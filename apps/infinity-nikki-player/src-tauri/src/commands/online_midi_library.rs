//! @fileOverview 在线 MIDI 曲库网络请求代理命令
//!
//! 浏览器/WebView 的 fetch 会受 CORS 约束；曲库公开接口本身使用设备签名鉴权，
//! 这里仅代理受限路径的 HTTP 请求，不参与签名逻辑。

use reqwest::header::{HeaderName, HeaderValue};
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::Duration;

const MAX_REQUEST_BODY_BYTES: usize = 128 * 1024;
const MAX_RESPONSE_BODY_BYTES: usize = 6 * 1024 * 1024;

#[derive(Debug, Deserialize)]
pub struct OnlineMidiLibraryRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OnlineMidiLibraryResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

#[tauri::command]
pub async fn online_midi_library_request(
    request: OnlineMidiLibraryRequest,
) -> Result<OnlineMidiLibraryResponse, String> {
    let method = parse_method(&request.method)?;
    let url = Url::parse(&request.url).map_err(|e| format!("曲库 URL 无效: {}", e))?;
    validate_url(&url)?;
    validate_body(&request.body)?;

    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent(format!("InfinityNikkiPlayer/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("创建曲库请求客户端失败: {}", e))?;

    let mut builder = client.request(method, url);
    for (name, value) in request.headers {
        if !is_allowed_header(&name) {
            continue;
        }
        let header_name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|e| format!("曲库请求 Header 名无效: {}", e))?;
        let header_value =
            HeaderValue::from_str(&value).map_err(|e| format!("曲库请求 Header 值无效: {}", e))?;
        builder = builder.header(header_name, header_value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("曲库请求失败: {}", e))?;
    let status = response.status().as_u16();
    if let Some(content_length) = response.content_length() {
        if content_length as usize > MAX_RESPONSE_BODY_BYTES {
            return Err("曲库响应超过客户端允许的大小".to_string());
        }
    }

    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect::<BTreeMap<_, _>>();

    let body = response
        .bytes()
        .await
        .map_err(|e| format!("读取曲库响应失败: {}", e))?;
    if body.len() > MAX_RESPONSE_BODY_BYTES {
        return Err("曲库响应超过客户端允许的大小".to_string());
    }

    Ok(OnlineMidiLibraryResponse {
        status,
        headers,
        body: body.to_vec(),
    })
}

fn parse_method(method: &str) -> Result<Method, String> {
    match method.to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        _ => Err("曲库请求只支持 GET/POST".to_string()),
    }
}

fn validate_url(url: &Url) -> Result<(), String> {
    if !url.username().is_empty() || url.password().is_some() {
        return Err("曲库 URL 不能包含认证信息".to_string());
    }
    if !url.path().starts_with("/api/infinity-nikki/") {
        return Err("曲库请求路径不在允许范围内".to_string());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "曲库 URL 缺少主机名".to_string())?;
    let allowed_remote = url.scheme() == "https" && host.eq_ignore_ascii_case("ztachi.com");
    let allowed_local = matches!(host, "localhost" | "127.0.0.1" | "::1")
        && matches!(url.scheme(), "http" | "https");

    if allowed_remote || allowed_local {
        Ok(())
    } else {
        Err("曲库请求目标不在允许范围内".to_string())
    }
}

fn validate_body(body: &Option<String>) -> Result<(), String> {
    if body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_REQUEST_BODY_BYTES)
    {
        return Err("曲库请求体超过客户端允许的大小".to_string());
    }
    Ok(())
}

fn is_allowed_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "content-type"
            | "x-inp-app-version"
            | "x-inp-device-id"
            | "x-inp-timestamp"
            | "x-inp-nonce"
            | "x-inp-body-sha256"
            | "x-inp-signature"
    )
}
