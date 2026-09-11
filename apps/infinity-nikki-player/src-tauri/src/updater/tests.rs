//! 本地故障服务器调用真实官方更新器；不会执行安装或访问用户数据目录。

use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const PACKAGE: &[u8] = include_bytes!("fixtures/package.txt");
const SIGNATURE: &str = include_str!("fixtures/package.txt.sig");
const PUBLIC_KEY: &str = include_str!("fixtures/public-key.txt");

#[tokio::test(start_paused = true)]
async fn waking_from_sleep_does_not_replay_expired_startup_checks() {
    let count = Arc::new(AtomicUsize::new(0));
    let recorded = count.clone();
    let task = tokio::spawn(async move {
        run_startup_checks(|| {
            recorded.fetch_add(1, Ordering::Relaxed);
            async { Phase::Error }
        })
        .await;
    });
    tokio::task::yield_now().await;
    assert_eq!(count.load(Ordering::Relaxed), 1);
    tokio::time::advance(Duration::from_secs(3600)).await;
    task.await.unwrap();
    assert_eq!(count.load(Ordering::Relaxed), 2);
}

/// 测试服务结束时主动终止监听，所有地址和不安全 HTTP 配置仅存在于测试代码。
struct Server {
    url: String,
    requests: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn serve(body: Vec<u8>, length: Option<usize>, delay: Duration) -> Server {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/update", listener.local_addr().unwrap());
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = requests.clone();
    let task = tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let body = body.clone();
            counter.fetch_add(1, Ordering::Relaxed);
            tokio::spawn(async move {
                let mut request = [0; 4096];
                if stream.read(&mut request).await.is_err() {
                    return;
                }
                let size = length
                    .map(|value| format!("Content-Length: {value}\r\n"))
                    .unwrap_or_default();
                let header = format!("HTTP/1.1 200 OK\r\nConnection: close\r\n{size}\r\n");
                let _ = stream.write_all(header.as_bytes()).await;
                tokio::time::sleep(delay).await;
                let _ = stream.write_all(&body).await;
            });
        }
    });
    Server {
        url,
        requests,
        task,
    }
}

fn test_app() -> tauri::App<MockRuntime> {
    let mut context = mock_context(noop_assets());
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({
            "pubkey": PUBLIC_KEY, "dangerousInsecureTransportProtocol": true,
        }),
    );
    mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(UpdaterService::new("0.1.0".into()))
        .build(context)
        .unwrap()
}

#[tokio::test]
async fn official_store_persists_receipt_before_exit_and_reports_write_failure() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("receipt.json");
    let receipt = InstallReceipt {
        from_version: "1.2.0".into(),
        target_version: "1.2.1".into(),
        executable_path: "/fixture/old-copy".into(),
        attempted_at: now_ms(),
        outcome: "pending".into(),
    };
    {
        let app = test_app();
        save_receipt_to(app.handle(), &path, &receipt).unwrap();
        // 显式 save 返回时文件就必须存在，不能等待退出或自动保存定时器。
        let persisted: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(persisted["lastInstall"]["outcome"], "pending");
    }
    let app = test_app();
    let reloaded = app.store(&path).unwrap().get("lastInstall").unwrap();
    assert_eq!(reloaded["targetVersion"], "1.2.1");
    assert_eq!(reloaded["executablePath"], "/fixture/old-copy");
    let blocked = directory.path().join("not-a-directory");
    std::fs::write(&blocked, "不能在普通文件内创建安装记录").unwrap();
    assert_eq!(
        save_receipt_to(app.handle(), &blocked.join("receipt.json"), &receipt)
            .unwrap_err()
            .code,
        "storage"
    );
}

fn manifest(version: &str) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({ "version": version, "platforms": {
        "windows-x86_64": { "url": format!("{RELEASE_ROOT}/download/infinity-nikki-player@v{version}/package.exe"), "signature": SIGNATURE }
    }})).unwrap()
}

async fn candidate(app: &tauri::App<MockRuntime>) -> Update {
    let server = serve(manifest("1.2.1"), None, Duration::ZERO).await;
    check_source(
        app.updater_builder().target("windows-x86_64").no_proxy(),
        Source::Github,
        &server.url,
    )
    .await
    .unwrap()
    .unwrap()
}

#[tokio::test]
async fn invalid_source_does_not_discard_valid_source_and_higher_version_wins() {
    let app = test_app();
    for invalid in [
        "<html>代理错误</html>".as_bytes().to_vec(),
        b"{broken".to_vec(),
        br#"{"version":"1.2.1","platforms":{}}"#.to_vec(),
    ] {
        let bad = serve(invalid, None, Duration::ZERO).await;
        let good = serve(manifest("1.2.1"), None, Duration::ZERO).await;
        let (a, b) = tokio::join!(
            check_source(
                app.updater_builder().target("windows-x86_64").no_proxy(),
                Source::Mirror,
                &bad.url
            ),
            check_source(
                app.updater_builder().target("windows-x86_64").no_proxy(),
                Source::Github,
                &good.url
            ),
        );
        assert!(a.is_err());
        assert_eq!(select_update(vec![a, b]).unwrap().unwrap().version, "1.2.1");
    }
    let old = candidate(&app).await;
    let mut newer = old.clone();
    newer.version = "1.10.0".into();
    assert_eq!(
        select_update(vec![Ok(Some(old.clone())), Ok(Some(newer))])
            .unwrap()
            .unwrap()
            .version,
        "1.10.0"
    );
    let mut invalid = old.clone();
    invalid.version = "不是版本号".into();
    assert_eq!(
        select_update(vec![Ok(Some(invalid)), Ok(Some(old))])
            .unwrap()
            .unwrap()
            .version,
        "1.2.1"
    );
}

#[tokio::test]
async fn source_body_timeout_is_bounded_and_other_source_remains_valid() {
    let app = test_app();
    let stalled = serve(manifest("1.3.0"), None, Duration::from_secs(10)).await;
    let result = check_source(
        app.updater_builder().target("windows-x86_64").no_proxy(),
        Source::Mirror,
        &stalled.url,
    )
    .await;
    assert_eq!(result.err().unwrap().code, "timeout");
    assert!(select_update(vec![
        Err(UpdateError::new("check", "timeout", "超时", None)),
        Ok(Some(candidate(&app).await))
    ])
    .unwrap()
    .is_some());
}

#[tokio::test]
async fn truncated_download_retries_then_switches_source_and_verifies_signature() {
    let app = test_app();
    let update = candidate(&app).await;
    let bad = serve("中断".as_bytes().to_vec(), Some(5000), Duration::ZERO).await;
    let good = serve(PACKAGE.to_vec(), None, Duration::ZERO).await;
    let result = download_from_urls(
        app.handle(),
        update,
        0,
        [bad.url.clone(), good.url.clone()],
        Duration::ZERO,
    )
    .await
    .unwrap();
    assert_eq!(result.0, PACKAGE);
    assert_eq!(bad.requests.load(Ordering::Relaxed), 2);
    assert_eq!(good.requests.load(Ordering::Relaxed), 1);
    let state = snapshot(app.handle());
    assert_eq!(state.source, Some(Source::Github));
    assert_eq!(state.downloaded_bytes, PACKAGE.len() as u64);
    assert_eq!(state.content_length, None);
}

#[tokio::test]
async fn signature_failure_switches_immediately_and_all_failures_keep_bytes_unavailable() {
    let app = test_app();
    let update = candidate(&app).await;
    let bad = serve("损坏包".as_bytes().to_vec(), None, Duration::ZERO).await;
    let good = serve(PACKAGE.to_vec(), Some(PACKAGE.len()), Duration::ZERO).await;
    assert!(download_from_urls(
        app.handle(),
        update.clone(),
        0,
        [bad.url.clone(), good.url.clone()],
        Duration::ZERO
    )
    .await
    .is_ok());
    assert_eq!(bad.requests.load(Ordering::Relaxed), 1);
    let result = download_from_urls(
        app.handle(),
        update,
        0,
        [bad.url.clone(), bad.url.clone()],
        Duration::ZERO,
    )
    .await;
    assert_eq!(result.err().unwrap().code, "signature");
    assert!(app.state::<UpdaterService>().0.lock().bytes.is_none());
    assert_ne!(snapshot(app.handle()).phase, Phase::Ready);
}

#[tokio::test]
async fn stalled_reads_and_connection_failure_are_retryable() {
    let app = test_app();
    let metadata = serve(manifest("1.2.1"), None, Duration::ZERO).await;
    let mut update = app
        .updater_builder()
        .target("windows-x86_64")
        .no_proxy()
        .endpoints(vec![metadata.url.parse().unwrap()])
        .unwrap()
        .configure_client(|client| {
            client
                .connect_timeout(Duration::from_millis(50))
                .read_timeout(Duration::from_millis(50))
        })
        .build()
        .unwrap()
        .check()
        .await
        .unwrap()
        .unwrap();
    let stalled = serve(
        PACKAGE.to_vec(),
        Some(PACKAGE.len()),
        Duration::from_secs(1),
    )
    .await;
    update.download_url = stalled.url.parse().unwrap();
    let error = update.download(|_, _| {}, || {}).await.err().unwrap();
    assert!(UpdateError::from_plugin("download", &error, Source::Mirror).retryable());
    let closed = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    update.download_url = format!("http://{}/closed", closed.local_addr().unwrap())
        .parse()
        .unwrap();
    drop(closed);
    let error = update.download(|_, _| {}, || {}).await.err().unwrap();
    assert!(UpdateError::from_plugin("download", &error, Source::Github).retryable());
}

#[tokio::test]
async fn cancel_invalidates_generation_and_busy_states_deduplicate_all_triggers() {
    let app = test_app();
    let token = CancellationToken::new();
    {
        let service = app.state::<UpdaterService>();
        let mut core = service.0.lock();
        core.snapshot.phase = Phase::Downloading;
        core.snapshot.downloaded_bytes = 123;
        core.cancellation = Some(token.clone());
    }
    assert_eq!(
        check(app.handle().clone(), CheckReason::Resume).await.phase,
        Phase::Downloading
    );
    assert_eq!(
        download(app.handle().clone()).await.phase,
        Phase::Downloading
    );
    assert_eq!(cancel(app.handle()).phase, Phase::Available);
    assert!(token.is_cancelled());
    assert_eq!(snapshot(app.handle()).downloaded_bytes, 0);
    assert_eq!(app.state::<UpdaterService>().0.lock().generation, 1);
    for phase in [Phase::Checking, Phase::Ready, Phase::Installing] {
        app.state::<UpdaterService>().0.lock().snapshot.phase = phase;
        assert_eq!(
            check(app.handle().clone(), CheckReason::Manual).await.phase,
            phase
        );
        assert_eq!(download(app.handle().clone()).await.phase, phase);
        assert_eq!(cancel(app.handle()).phase, phase);
    }
    let service = app.state::<UpdaterService>();
    service.0.lock().snapshot.phase = Phase::Idle;
    service.0.lock().snapshot.last_checked_at = Some(now_ms());
    assert_eq!(
        check(app.handle().clone(), CheckReason::Resume).await.phase,
        Phase::Idle
    );
}
