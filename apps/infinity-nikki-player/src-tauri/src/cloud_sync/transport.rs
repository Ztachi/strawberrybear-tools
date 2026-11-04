//! WebDAV 使用现有 HTTP 客户端处理目录创建，S3 签名与传输交给维护中的 object_store。

use super::config::{validate_active, validate_url, CloudSyncConfig, Provider};
use bytes::Bytes;
use futures_util::StreamExt;
use object_store::{aws::AmazonS3Builder, path::Path, ClientOptions, ObjectStore, ObjectStoreExt};
use reqwest::{Client, Method, StatusCode, Url};
use std::{sync::Arc, time::Duration};

pub(super) const MAX_ARCHIVE_BYTES: usize = 512 * 1024 * 1024;
pub(super) const MAX_MANIFEST_BYTES: usize = 1024 * 1024;

pub(super) enum Transport {
    Webdav {
        client: Client,
        base: Url,
        username: String,
        password: String,
        prefix: String,
    },
    S3 {
        store: Arc<dyn ObjectStore>,
        prefix: String,
    },
}

impl Transport {
    pub fn build(config: &CloudSyncConfig, secret: String) -> Result<Self, String> {
        validate_active(config)?;
        if secret.is_empty() {
            return Err("请填写密码或访问密钥".into());
        }
        match config.provider {
            Provider::Webdav => {
                let client = client_builder()?
                    .connect_timeout(Duration::from_secs(10))
                    .timeout(Duration::from_secs(300))
                    // 凭据只发送到配置的主机，不跟随服务器跳转到其他地址。
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                    .map_err(|_| "创建 WebDAV 网络客户端失败")?;
                Ok(Self::Webdav {
                    client,
                    base: validate_url(&config.webdav.base_url)?,
                    username: config.webdav.username.clone(),
                    password: secret,
                    prefix: format!("{}/v1/{}", config.webdav.remote_root, config.webdav.profile),
                })
            }
            Provider::S3 => {
                let options = ClientOptions::new()
                    .with_connect_timeout(Duration::from_secs(10))
                    .with_timeout(Duration::from_secs(300));
                Ok(Self::S3 {
                    store: build_s3_store(&config.s3, secret, options)?,
                    prefix: format!("{}/v1/{}", config.s3.remote_root, config.s3.profile),
                })
            }
        }
    }

    /// WebDAV 目录需要逐层创建，不能把 PUT 对象等同于 S3 的虚拟目录。
    pub async fn ensure_directories(&self) -> Result<(), String> {
        if let Self::Webdav {
            client,
            base,
            username,
            password,
            prefix,
        } = self
        {
            let method = Method::from_bytes(b"PROPFIND").map_err(|_| "创建 WebDAV 请求失败")?;
            let response = client
                .request(method.clone(), base.clone())
                .header("Depth", "0")
                .basic_auth(username, Some(password))
                .send()
                .await
                .map_err(network_error)?;
            check_status(response.status(), "访问 WebDAV 根目录")?;
            let mut path = String::new();
            for part in prefix.split('/').chain(std::iter::once("snapshots")) {
                if !path.is_empty() {
                    path.push('/');
                }
                path.push_str(part);
                let url = append_path(base, &path)?;
                let response = client
                    .request(
                        Method::from_bytes(b"MKCOL").map_err(|_| "创建 WebDAV 请求失败")?,
                        url.clone(),
                    )
                    .basic_auth(username, Some(password))
                    .send()
                    .await
                    .map_err(network_error)?;
                if response.status() == StatusCode::METHOD_NOT_ALLOWED {
                    // 部分服务器用 405 表示已存在，再核对可访问性以避免掩盖权限错误。
                    let response = client
                        .request(method.clone(), url)
                        .header("Depth", "0")
                        .basic_auth(username, Some(password))
                        .send()
                        .await
                        .map_err(network_error)?;
                    check_status(response.status(), "访问 WebDAV 目录")?;
                } else {
                    check_status(response.status(), "创建 WebDAV 目录")?;
                }
            }
        }
        Ok(())
    }

    pub async fn put(&self, name: &str, bytes: Vec<u8>) -> Result<(), String> {
        match self {
            Self::Webdav {
                client,
                base,
                username,
                password,
                prefix,
            } => {
                let url = append_path(base, &format!("{prefix}/{name}"))?;
                let response = client
                    .put(url)
                    .basic_auth(username, Some(password))
                    .header("Content-Type", "application/octet-stream")
                    .body(bytes)
                    .send()
                    .await
                    .map_err(network_error)?;
                check_status(response.status(), "写入 WebDAV 数据")
            }
            Self::S3 { store, prefix } => store
                .put(&object_path(prefix, name)?, Bytes::from(bytes).into())
                .await
                .map(|_| ())
                .map_err(|_| "S3 写入失败，请检查存储桶权限、端点和网络".into()),
        }
    }

    pub async fn get(&self, name: &str, limit: usize) -> Result<Option<Vec<u8>>, String> {
        match self {
            Self::Webdav {
                client,
                base,
                username,
                password,
                prefix,
            } => {
                let mut response = client
                    .get(append_path(base, &format!("{prefix}/{name}"))?)
                    .basic_auth(username, Some(password))
                    .send()
                    .await
                    .map_err(network_error)?;
                if response.status() == StatusCode::NOT_FOUND {
                    return Ok(None);
                }
                check_status(response.status(), "读取 WebDAV 数据")?;
                if response
                    .content_length()
                    .is_some_and(|size| size > limit as u64)
                {
                    return Err("云端文件超过允许的大小".into());
                }
                let mut bytes = Vec::new();
                while let Some(chunk) = response.chunk().await.map_err(network_error)? {
                    if chunk.len() > limit.saturating_sub(bytes.len()) {
                        return Err("云端文件超过允许的大小".into());
                    }
                    bytes.extend_from_slice(&chunk);
                }
                Ok(Some(bytes))
            }
            Self::S3 { store, prefix } => {
                let result = match store.get(&object_path(prefix, name)?).await {
                    Ok(result) => result,
                    Err(object_store::Error::NotFound { .. }) => return Ok(None),
                    Err(_) => return Err("S3 读取失败，请检查存储桶权限、端点和网络".into()),
                };
                if result.meta.size > limit as u64 {
                    return Err("云端文件超过允许的大小".into());
                }
                let mut stream = result.into_stream();
                let mut bytes = Vec::new();
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|_| "S3 下载中断，请重试")?;
                    if chunk.len() > limit.saturating_sub(bytes.len()) {
                        return Err("云端文件超过允许的大小".into());
                    }
                    bytes.extend_from_slice(&chunk);
                }
                Ok(Some(bytes))
            }
        }
    }

    pub async fn delete(&self, name: &str) -> Result<(), String> {
        match self {
            Self::Webdav {
                client,
                base,
                username,
                password,
                prefix,
            } => {
                let response = client
                    .delete(append_path(base, &format!("{prefix}/{name}"))?)
                    .basic_auth(username, Some(password))
                    .send()
                    .await
                    .map_err(network_error)?;
                if response.status() == StatusCode::NOT_FOUND {
                    return Ok(());
                }
                check_status(response.status(), "删除 WebDAV 测试文件")
            }
            Self::S3 { store, prefix } => match store.delete(&object_path(prefix, name)?).await {
                Ok(()) | Err(object_store::Error::NotFound { .. }) => Ok(()),
                Err(_) => Err("S3 测试文件清理失败，请检查删除权限".into()),
            },
        }
    }

    pub async fn test(&self) -> Result<(), String> {
        self.ensure_directories().await?;
        let name = format!(".connection-check-{}", uuid::Uuid::new_v4());
        let payload = b"infinity-nikki-player-connection-check".to_vec();
        self.put(&name, payload.clone()).await?;
        let read = self.get(&name, 1024).await;
        let cleanup = self.delete(&name).await;
        if read? != Some(payload) {
            return Err("云服务连接成功，但写入内容校验失败".into());
        }
        cleanup
    }
}

fn build_s3_store(
    config: &super::config::S3Config,
    secret: String,
    options: ClientOptions,
) -> Result<Arc<dyn ObjectStore>, String> {
    let (endpoint, virtual_hosted) = s3_addressing(config)?;
    let mut builder = AmazonS3Builder::new()
        .with_region(&config.region)
        .with_bucket_name(&config.bucket)
        .with_access_key_id(&config.access_key_id)
        .with_secret_access_key(secret)
        // 只删除单个快照，避免兼容服务必须实现批量删除接口。
        .with_disable_bulk_delete(true)
        .with_http_connector(CloudHttpConnector)
        .with_virtual_hosted_style_request(virtual_hosted)
        .with_client_options(options);
    if let Some(endpoint) = endpoint {
        builder = builder
            .with_endpoint(endpoint.as_str().trim_end_matches('/'))
            .with_allow_http(endpoint.scheme() == "http");
    }
    builder
        .build()
        .map(|store| Arc::new(store) as Arc<dyn ObjectStore>)
        .map_err(|_| "S3 配置无效，请检查区域和服务端点".into())
}

/// 为此模块的客户端显式设置 TLS 提供者，不改进程全局默认值或既有更新器。
pub(super) fn client_builder() -> Result<reqwest::ClientBuilder, String> {
    let mut roots = rustls::RootCertStore::empty();
    roots.add_parsable_certificates(rustls_native_certs::load_native_certs().certs);
    if roots.is_empty() {
        return Err("读取系统 TLS 根证书失败，请检查系统证书配置".into());
    }
    let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|_| "初始化云服务 TLS 协议失败")?
    .with_root_certificates(roots)
    .with_no_client_auth();
    Ok(Client::builder().tls_backend_preconfigured(tls))
}

#[derive(Debug)]
struct CloudHttpConnector;

impl object_store::client::HttpConnector for CloudHttpConnector {
    fn connect(
        &self,
        options: &ClientOptions,
    ) -> object_store::Result<object_store::client::HttpClient> {
        let mut builder = client_builder()
            .map_err(|message| object_store::Error::Generic {
                store: "云同步",
                source: Box::new(std::io::Error::other(message)),
            })?
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(300))
            .redirect(reqwest::redirect::Policy::none());
        if let Some(resolver) = options.dns_resolver() {
            builder = builder
                .no_proxy()
                .dns_resolver(Arc::new(CloudDnsResolver(resolver.clone())));
        }
        builder
            .build()
            .map(object_store::client::HttpClient::new)
            .map_err(|error| object_store::Error::Generic {
                store: "云同步",
                source: Box::new(error),
            })
    }
}

/// 仅在调用方注入解析器时适配库的公开 DNS 接口，集成测试不依赖外网解析。
#[derive(Debug)]
struct CloudDnsResolver(Arc<dyn object_store::client::DnsResolver>);

impl reqwest::dns::Resolve for CloudDnsResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let resolver = self.0.clone();
        Box::pin(async move {
            let addresses = resolver.resolve(name.as_str()).await?;
            Ok(Box::new(
                addresses
                    .into_iter()
                    .map(|ip| std::net::SocketAddr::new(ip, 0)),
            ) as reqwest::dns::Addrs)
        })
    }
}

/// AWS 使用桶域名；OSS、COS、OBS 的新桶要求桶域名，MinIO、R2 和自定义端点保留路径形式。
fn s3_addressing(config: &super::config::S3Config) -> Result<(Option<Url>, bool), String> {
    if config.endpoint.is_empty() {
        return Ok((None, true));
    }
    let mut endpoint = validate_url(&config.endpoint)?;
    let host = endpoint.host_str().ok_or("S3 端点缺少主机名")?.to_owned();
    let virtual_hosted = matches!(
        config.preset.as_str(),
        "s3-oss" | "oss" | "s3-cos" | "cos" | "s3-obs" | "obs"
    ) || host.ends_with(".aliyuncs.com")
        || host.ends_with(".myqcloud.com")
        || host.ends_with(".myhuaweicloud.com")
        || host.ends_with(".amazonaws.com")
        || host.ends_with(".amazonaws.com.cn");
    if virtual_hosted && !host.starts_with(&format!("{}.", config.bucket)) {
        endpoint
            .set_host(Some(&format!("{}.{}", config.bucket, host)))
            .map_err(|_| "S3 存储桶不能组成有效域名")?;
    }
    Ok((Some(endpoint), virtual_hosted))
}

fn object_path(prefix: &str, name: &str) -> Result<Path, String> {
    Path::parse(format!("{prefix}/{name}")).map_err(|_| "云端对象路径无效".into())
}

fn append_path(base: &Url, path: &str) -> Result<Url, String> {
    let mut url = base.clone();
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "WebDAV 地址不能追加路径")?;
        segments.pop_if_empty();
        for part in path.split('/') {
            segments.push(part);
        }
    }
    Ok(url)
}

fn check_status(status: StatusCode, operation: &str) -> Result<(), String> {
    if status.is_success() {
        return Ok(());
    }
    let reason = match status.as_u16() {
        401 => "账号或密码错误",
        403 => "没有访问权限",
        404 => "地址或目录不存在",
        409 => "父目录不存在",
        423 => "文件被服务器锁定",
        429 => "请求过于频繁，请稍后重试",
        507 => "云端空间不足",
        _ => "服务器返回异常状态",
    };
    Err(format!("{operation}失败：{reason}（{}）", status.as_u16()))
}

fn network_error(error: reqwest::Error) -> String {
    // 不回传网络库的完整 URL，避免服务器响应或地址中意外泄露凭据。
    if error.is_timeout() {
        "云服务请求超时，请检查网络后重试".into()
    } else if error.is_connect() {
        "无法连接云服务，请检查地址、网络及证书".into()
    } else {
        "云服务请求失败，请检查服务配置后重试".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud_sync::{
        config::S3Config,
        test_support::{serve, Reply},
    };
    use parking_lot::Mutex;
    use std::collections::HashMap;

    #[test]
    fn webdav_paths_are_segment_encoded_without_changing_server_prefix() {
        let base = Url::parse("https://example.com/remote.php/dav/files/user/").unwrap();
        let url = append_path(&base, "曲库/v1/default/snapshots/文件.zip").unwrap();
        assert!(url
            .as_str()
            .starts_with("https://example.com/remote.php/dav/files/user/"));
        assert!(url.as_str().contains("%E6%9B%B2%E5%BA%93"));
        assert_eq!(url.path_segments().unwrap().count(), 9);
    }

    #[test]
    fn server_errors_do_not_include_response_bodies_or_credentials() {
        assert_eq!(
            check_status(StatusCode::UNAUTHORIZED, "测试").unwrap_err(),
            "测试失败：账号或密码错误（401）"
        );
        assert!(check_status(StatusCode::MULTI_STATUS, "测试").is_ok());
    }

    #[tokio::test]
    async fn s3_adapter_roundtrips_with_memory_store_and_enforces_limit() {
        let transport = Transport::S3 {
            store: Arc::new(object_store::memory::InMemory::new()),
            prefix: "test/v1/default".into(),
        };
        transport.test().await.unwrap();
        assert!(transport.get("missing", 100).await.unwrap().is_none());
        transport
            .put("snapshots/test.zip", vec![1, 2, 3])
            .await
            .unwrap();
        assert!(transport.get("snapshots/test.zip", 2).await.is_err());
        assert_eq!(
            transport.get("snapshots/test.zip", 3).await.unwrap(),
            Some(vec![1, 2, 3])
        );
    }

    #[tokio::test]
    async fn real_s3_client_signs_custom_endpoint_roundtrips_and_limits_downloads() {
        let objects = Arc::new(Mutex::new(HashMap::<String, Vec<u8>>::new()));
        let received = Arc::new(Mutex::new(Vec::new()));
        let saved = objects.clone();
        let requests = received.clone();
        let (base, _server) = serve(move |request| {
            requests.lock().push((
                request.method.clone(),
                request.path.clone(),
                request.headers.clone(),
            ));
            let mut objects = saved.lock();
            match request.method.as_str() {
                "PUT" => {
                    objects.insert(request.path, request.body);
                    Reply::new(200, vec![])
                }
                "GET" => match objects.get(&request.path) {
                    Some(bytes) => Reply::new(200, bytes.clone()),
                    None => Reply::new(404, vec![]),
                },
                "DELETE" => {
                    objects.remove(&request.path);
                    Reply::new(204, vec![])
                }
                _ => Reply::new(400, vec![]),
            }
        });
        let mut config = CloudSyncConfig::default();
        config.provider = Provider::S3;
        config.s3 = S3Config {
            preset: "s3-minio".into(),
            region: "us-east-1".into(),
            bucket: "test-bucket".into(),
            access_key_id: "TESTACCESS".into(),
            endpoint: base.clone(),
            ..Default::default()
        };
        let transport = Transport::build(&config, "测试访问密钥".into()).unwrap();
        transport.put("test.bin", vec![1, 2, 3]).await.unwrap();
        assert_eq!(
            transport.get("test.bin", 3).await.unwrap(),
            Some(vec![1, 2, 3])
        );
        assert!(transport.get("test.bin", 2).await.is_err());
        transport.delete("test.bin").await.unwrap();
        assert!(transport.get("test.bin", 3).await.unwrap().is_none());
        let requests = received.lock();
        assert_eq!(requests.len(), 5);
        for (_, path, headers) in requests.iter() {
            assert_eq!(
                path,
                "/test-bucket/infinity-nikki-player-sync/v1/default/test.bin"
            );
            assert!(headers["authorization"].starts_with("AWS4-HMAC-SHA256 Credential=TESTACCESS/"));
            assert!(headers.contains_key("x-amz-date"));
            assert!(headers.contains_key("x-amz-content-sha256"));
            assert_eq!(headers["host"], base.strip_prefix("http://").unwrap());
            assert!(!headers["authorization"].contains("测试访问密钥"));
        }
    }

    #[tokio::test]
    async fn real_s3_virtual_host_client_preserves_bucket_host_and_omits_bucket_path() {
        #[derive(Debug)]
        struct LocalDns;
        impl object_store::client::DnsResolver for LocalDns {
            fn resolve(&self, host: &str) -> object_store::client::DnsFuture {
                assert_eq!(host, "test-bucket.store.test");
                Box::pin(async { Ok(vec![std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)]) })
            }
        }
        let received = Arc::new(Mutex::new(Vec::new()));
        let requests = received.clone();
        let (base, _server) = serve(move |request| {
            requests
                .lock()
                .push((request.method.clone(), request.path, request.headers));
            Reply::new(
                if request.method == "DELETE" { 204 } else { 200 },
                if request.method == "GET" {
                    vec![4]
                } else {
                    vec![]
                },
            )
        });
        let port = Url::parse(&base).unwrap().port().unwrap();
        let config = S3Config {
            preset: "s3-oss".into(),
            region: "cn-hangzhou".into(),
            bucket: "test-bucket".into(),
            access_key_id: "TESTACCESS".into(),
            endpoint: format!("http://store.test:{port}"),
            ..Default::default()
        };
        let options = ClientOptions::new()
            .with_proxy_excludes("*")
            .with_dns_resolver(Arc::new(LocalDns));
        let transport = Transport::S3 {
            store: build_s3_store(&config, "测试密钥".into(), options).unwrap(),
            prefix: "root/v1/default".into(),
        };
        transport.put("item", vec![4]).await.unwrap();
        assert_eq!(transport.get("item", 1).await.unwrap(), Some(vec![4]));
        transport.delete("item").await.unwrap();
        for (_, path, headers) in received.lock().iter() {
            assert_eq!(path, "/root/v1/default/item");
            assert_eq!(headers["host"], format!("test-bucket.store.test:{port}"));
            assert!(headers["authorization"].contains("/cn-hangzhou/s3/aws4_request"));
        }
    }

    #[test]
    fn known_s3_providers_choose_compatible_address_styles() {
        for (preset, endpoint, virtual_hosted) in [
            ("aws-s3", "https://s3.us-east-1.amazonaws.com", true),
            ("s3-minio", "http://minio.local:9000", false),
            ("s3-r2", "https://account.r2.cloudflarestorage.com", false),
            ("s3-oss", "https://oss-cn-hangzhou.aliyuncs.com", true),
            ("s3-cos", "https://cos.ap-guangzhou.myqcloud.com", true),
            ("s3-obs", "https://obs.cn-north-4.myhuaweicloud.com", true),
        ] {
            let config = S3Config {
                preset: preset.into(),
                endpoint: endpoint.into(),
                bucket: "my-bucket".into(),
                ..Default::default()
            };
            let (url, style) = s3_addressing(&config).unwrap();
            assert_eq!(style, virtual_hosted);
            assert_eq!(
                url.unwrap().host_str().unwrap().starts_with("my-bucket."),
                virtual_hosted
            );
        }
    }

    #[tokio::test]
    async fn webdav_creates_nested_directories_and_checks_read_write_delete() {
        let received = Arc::new(Mutex::new(Vec::new()));
        let requests = received.clone();
        let payload = Arc::new(Mutex::new(Vec::new()));
        let stored = payload.clone();
        let (base, _server) = serve(move |request| {
            assert!(request.headers["authorization"].starts_with("Basic "));
            requests
                .lock()
                .push((request.method.clone(), request.path.clone()));
            match request.method.as_str() {
                "PROPFIND" => {
                    assert_eq!(request.headers["depth"], "0");
                    Reply::new(207, vec![])
                }
                "MKCOL" if request.path.ends_with("/nested") => Reply::new(405, vec![]),
                "MKCOL" => Reply::new(201, vec![]),
                "PUT" => {
                    *stored.lock() = request.body;
                    Reply::new(201, vec![])
                }
                "GET" => Reply::new(200, stored.lock().clone()),
                "DELETE" => Reply::new(204, vec![]),
                _ => Reply::new(400, vec![]),
            }
        });
        let mut config = CloudSyncConfig::default();
        config.webdav.base_url = format!("{base}/dav/");
        config.webdav.username = "测试账号".into();
        config.webdav.remote_root = "root/nested".into();
        Transport::build(&config, "测试密码".into())
            .unwrap()
            .test()
            .await
            .unwrap();
        let requests = received.lock();
        let directories: Vec<_> = requests
            .iter()
            .filter(|(method, _)| method == "MKCOL")
            .map(|(_, path)| path.as_str())
            .collect();
        assert_eq!(
            directories,
            [
                "/dav/root",
                "/dav/root/nested",
                "/dav/root/nested/v1",
                "/dav/root/nested/v1/default",
                "/dav/root/nested/v1/default/snapshots"
            ]
        );
        assert_eq!(requests.last().unwrap().0, "DELETE");
    }

    #[tokio::test]
    async fn webdav_handles_auth_missing_timeout_and_cancellation() {
        let (base, _server) = serve(|request| {
            if request.path.ends_with("/auth") {
                Reply::new(401, vec![])
            } else if request.path.ends_with("/missing") {
                Reply::new(404, vec![])
            } else {
                Reply {
                    status: 200,
                    body: vec![1],
                    delay: Duration::from_millis(150),
                }
            }
        });
        let make = |timeout| Transport::Webdav {
            client: client_builder().unwrap().timeout(timeout).build().unwrap(),
            base: Url::parse(&base).unwrap(),
            username: "测试".into(),
            password: "不可泄露".into(),
            prefix: "root".into(),
        };
        let transport = make(Duration::from_millis(50));
        assert!(transport.get("auth", 10).await.unwrap_err().contains("401"));
        assert!(transport.get("missing", 10).await.unwrap().is_none());
        assert!(transport
            .get("slow", 10)
            .await
            .unwrap_err()
            .contains("超时"));
        let transport = make(Duration::from_secs(2));
        let token = tokio_util::sync::CancellationToken::new();
        let cancel = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            cancel.cancel();
        });
        tokio::select! {
            _ = token.cancelled() => {},
            _ = transport.get("slow", 10) => panic!("取消信号应先中断请求"),
        }
    }
}
