//! 自动更新唯一原生所有者：官方插件执行检查、校验和安装，本模块负责恢复与确认。

pub mod policy;

use parking_lot::Mutex;
use policy::*;
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::{Update, UpdaterBuilder, UpdaterExt};
use tokio_util::sync::CancellationToken;

const STATE_EVENT: &str = "app-update-state";
const RECEIPT_FILE: &str = "updater-state.json";

/// 下载安装阶段分离，下载完成不等于安装成功。
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Ready,
    Installing,
    Error,
}

/// 跨重启记录；写盘成功后才允许把控制权交给安装器。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReceipt {
    pub from_version: String,
    pub target_version: String,
    pub executable_path: String,
    pub attempted_at: u64,
    pub outcome: String,
}

/// 前端只消费可序列化状态，不持有原生更新对象或安装包。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub phase: Phase,
    pub current_version: String,
    pub target_version: Option<String>,
    pub source: Option<Source>,
    pub downloaded_bytes: u64,
    pub content_length: Option<u64>,
    pub last_checked_at: Option<u64>,
    pub last_error: Option<UpdateError>,
    pub last_install: Option<InstallReceipt>,
}

/// 操作代数隔离取消后的迟到回调，下载字节只在校验完成后进入共享状态。
struct Core {
    snapshot: Snapshot,
    candidate: Option<Update>,
    bytes: Option<Arc<Vec<u8>>>,
    generation: u64,
    cancellation: Option<CancellationToken>,
    last_progress_event: Instant,
    last_logged_phase: Phase,
}

pub struct UpdaterService(Mutex<Core>);

/// 检查触发原因决定恢复事件的节流；手动检查不受恢复节流限制。
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CheckReason {
    Manual,
    Startup,
    Scheduled,
    Resume,
}

impl UpdaterService {
    /// 构造应用级状态；版本来自 Tauri 包信息，与官方检查一致。
    pub fn new(current_version: String) -> Self {
        Self(Mutex::new(Core {
            snapshot: Snapshot {
                revision: 0,
                phase: Phase::Idle,
                current_version,
                target_version: None,
                source: None,
                downloaded_bytes: 0,
                content_length: None,
                last_checked_at: None,
                last_error: None,
                last_install: None,
            },
            candidate: None,
            bytes: None,
            generation: 0,
            cancellation: None,
            last_progress_event: Instant::now(),
            last_logged_phase: Phase::Idle,
        }))
    }
}

/// 获取状态快照；用于首次订阅和窗口重新挂载后的恢复。
pub fn snapshot<R: Runtime>(app: &AppHandle<R>) -> Snapshot {
    app.state::<UpdaterService>().0.lock().snapshot.clone()
}

/// 手动入口从已核验的候选清单提取真实资产，公共代理只用于资产下载。
pub fn manual_download_url<R: Runtime>(
    app: &AppHandle<R>,
    source: Source,
) -> Result<String, UpdateError> {
    let state = app.state::<UpdaterService>();
    let core = state.0.lock();
    if let Some(update) = &core.candidate {
        let urls = download_urls(update.download_url.as_str(), &update.version)?;
        return Ok(urls[if source == Source::Mirror { 0 } else { 1 }].clone());
    }
    if let Some(receipt) = &core.snapshot.last_install {
        if semver::Version::parse(&receipt.target_version).is_ok() {
            return Ok(format!(
                "{RELEASE_ROOT}/tag/infinity-nikki-player%40v{}",
                receipt.target_version
            ));
        }
    }
    Ok("https://ztachi.com/tools/infinity-nikki-player".into())
}

/// 所有状态变更都带递增 revision，前端可以拒绝迟到的旧事件。
fn publish<R: Runtime>(app: &AppHandle<R>, core: &mut Core) -> Snapshot {
    if core.last_logged_phase != core.snapshot.phase {
        log::info!(
            "更新阶段 {:?} → {:?}，当前版本={}，目标版本={:?}，来源={:?}",
            core.last_logged_phase,
            core.snapshot.phase,
            core.snapshot.current_version,
            core.snapshot.target_version,
            core.snapshot.source
        );
        core.last_logged_phase = core.snapshot.phase;
    }
    core.snapshot.revision += 1;
    let snapshot = core.snapshot.clone();
    if let Err(error) = app.emit(STATE_EVENT, &snapshot) {
        log::warn!("发送更新状态失败：{error}");
    }
    snapshot
}

/// 单个来源使用单独的官方检查实例，解析错误不会阻断另一来源。
async fn check_source(
    builder: UpdaterBuilder,
    source: Source,
    endpoint: &str,
) -> Result<Option<Update>, UpdateError> {
    let started = Instant::now();
    let updater = builder
        .endpoints(vec![endpoint.parse().map_err(|e| {
            UpdateError::new("check", "invalidManifest", e, Some(source))
        })?])
        .map_err(|e| UpdateError::from_plugin("check", &e, source))?
        .timeout(CHECK_TIMEOUT)
        .configure_client(|client| {
            client
                .connect_timeout(CONNECT_TIMEOUT)
                .read_timeout(READ_TIMEOUT)
        })
        .build()
        .map_err(|e| UpdateError::from_plugin("check", &e, source))?;
    let update = updater
        .check()
        .await
        .inspect_err(|error| {
            log::warn!(
                "更新检查失败，来源={source:?}，耗时={}毫秒：{error}",
                started.elapsed().as_millis()
            );
        })
        .map_err(|e| UpdateError::from_plugin("check", &e, source))?;
    if let Some(ref update) = update {
        download_urls(update.download_url.as_str(), &update.version)?;
    }
    log::info!(
        "更新检查完成，来源={source:?}，耗时={}毫秒，目标={:?}",
        started.elapsed().as_millis(),
        update.as_ref().map(|u| &u.version)
    );
    Ok(update)
}

/// 比较两个来源的有效最高版本；失败时保留之前发现的候选版本。
pub async fn check<R: Runtime>(app: AppHandle<R>, reason: CheckReason) -> Snapshot {
    let generation = {
        let state = app.state::<UpdaterService>();
        let mut core = state.0.lock();
        if matches!(
            core.snapshot.phase,
            Phase::Checking | Phase::Downloading | Phase::Ready | Phase::Installing
        ) || (matches!(reason, CheckReason::Resume)
            && core
                .snapshot
                .last_checked_at
                .is_some_and(|last| now_ms().saturating_sub(last) < RESUME_COOLDOWN_MS))
        {
            return core.snapshot.clone();
        }
        core.generation += 1;
        core.snapshot.phase = Phase::Checking;
        core.snapshot.last_checked_at = Some(now_ms());
        core.snapshot.last_error = None;
        publish(&app, &mut core);
        core.generation
    };
    let mirror_endpoint = Source::Mirror.endpoint();
    let github_endpoint = Source::Github.endpoint();
    let (mirror, github) = tokio::join!(
        check_source(app.updater_builder(), Source::Mirror, &mirror_endpoint),
        check_source(app.updater_builder(), Source::Github, &github_endpoint),
    );
    let result = select_update(vec![mirror, github]);
    let state = app.state::<UpdaterService>();
    let mut core = state.0.lock();
    if core.generation != generation {
        return core.snapshot.clone();
    }
    match result {
        Ok(candidate) => {
            // 不能因缓存回退而遗忘已经发现的更高版本。
            let candidates = vec![Ok(core.candidate.take()), Ok(candidate)];
            core.candidate = select_update(candidates).ok().flatten();
            core.snapshot.target_version = core.candidate.as_ref().map(|u| u.version.clone());
            core.snapshot.source = core.candidate.as_ref().map(|u| {
                if u.download_url.as_str().starts_with(PROXY_PREFIX) {
                    Source::Mirror
                } else {
                    Source::Github
                }
            });
            core.snapshot.phase = if core.candidate.is_some() {
                Phase::Available
            } else {
                Phase::UpToDate
            };
            core.snapshot.last_error = None;
        }
        Err(error) => {
            core.snapshot.phase = Phase::Error;
            core.snapshot.last_error = Some(error);
        }
    }
    publish(&app, &mut core)
}

/// 下载中每个来源至多尝试两次；验证由官方插件完成，取消会丢弃整个下载 future。
pub async fn download<R: Runtime>(app: AppHandle<R>) -> Snapshot {
    let prepared = {
        let state = app.state::<UpdaterService>();
        let mut core = state.0.lock();
        if matches!(
            core.snapshot.phase,
            Phase::Checking | Phase::Downloading | Phase::Ready | Phase::Installing
        ) {
            return core.snapshot.clone();
        }
        let Some(candidate) = core.candidate.clone() else {
            return core.snapshot.clone();
        };
        core.generation += 1;
        let cancellation = CancellationToken::new();
        core.cancellation = Some(cancellation.clone());
        core.bytes = None;
        core.snapshot.phase = Phase::Downloading;
        core.snapshot.downloaded_bytes = 0;
        core.snapshot.content_length = None;
        core.snapshot.last_error = None;
        publish(&app, &mut core);
        (candidate, core.generation, cancellation)
    };
    let (update, generation, cancellation) = prepared;
    let result = tokio::select! {
        biased;
        _ = cancellation.cancelled() => return snapshot(&app),
        result = download_sources(&app, update, generation) => result,
    };
    let state = app.state::<UpdaterService>();
    let mut core = state.0.lock();
    if core.generation != generation {
        return core.snapshot.clone();
    }
    core.cancellation = None;
    match result {
        Ok((bytes, update)) => {
            core.bytes = Some(Arc::new(bytes));
            core.candidate = Some(update);
            core.snapshot.phase = Phase::Ready;
            core.snapshot.last_error = None;
        }
        Err(error) => {
            core.snapshot.phase = Phase::Error;
            core.snapshot.last_error = Some(error);
        }
    }
    publish(&app, &mut core)
}

/// 固定目标后只替换官方 Update 的下载地址，不换版本和签名。
async fn download_sources<R: Runtime>(
    app: &AppHandle<R>,
    update: Update,
    generation: u64,
) -> Result<(Vec<u8>, Update), UpdateError> {
    let urls = download_urls(update.download_url.as_str(), &update.version)?;
    download_from_urls(app, update, generation, urls, RETRY_DELAY).await
}

/// 地址由生产策略校验后传入；故障测试用独立本地服务验证官方 HTTP 与签名链路。
async fn download_from_urls<R: Runtime>(
    app: &AppHandle<R>,
    mut update: Update,
    generation: u64,
    urls: [String; 2],
    retry_delay: std::time::Duration,
) -> Result<(Vec<u8>, Update), UpdateError> {
    let mut last_error = UpdateError::new("download", "network", "全部下载线路均失败", None);
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    for (source, url) in [Source::Mirror, Source::Github].into_iter().zip(urls) {
        update.download_url = url
            .parse()
            .map_err(|e| UpdateError::new("download", "invalidManifest", e, Some(source)))?;
        for attempt in 0..2 {
            {
                let state = app.state::<UpdaterService>();
                let mut core = state.0.lock();
                if core.generation != generation {
                    return Err(UpdateError::new(
                        "download",
                        "cancelled",
                        "下载已取消",
                        Some(source),
                    ));
                }
                core.snapshot.source = Some(source);
                core.snapshot.downloaded_bytes = 0;
                core.snapshot.content_length = None;
                publish(app, &mut core);
            }
            let started = Instant::now();
            let result = update
                .download(
                    |chunk, length| {
                        let state = app.state::<UpdaterService>();
                        let mut core = state.0.lock();
                        if core.generation != generation {
                            return;
                        }
                        core.snapshot.downloaded_bytes += chunk as u64;
                        core.snapshot.content_length = length;
                        // 大文件不能对每个网络分块都发一次 IPC，避免拖慢主窗口。
                        if core.last_progress_event.elapsed().as_millis() >= 100 {
                            core.last_progress_event = Instant::now();
                            publish(app, &mut core);
                        }
                    },
                    || {},
                )
                .await;
            match result {
                Ok(bytes) => {
                    log::info!(
                        "更新下载及签名校验完成，版本={}，来源={source:?}，字节数={}，耗时={}毫秒",
                        update.version,
                        bytes.len(),
                        started.elapsed().as_millis()
                    );
                    return Ok((bytes, update));
                }
                Err(error) => {
                    last_error = UpdateError::from_plugin("download", &error, source);
                    log::warn!(
                        "更新下载失败，来源={source:?}，尝试={}，耗时={}毫秒：{}",
                        attempt + 1,
                        started.elapsed().as_millis(),
                        last_error.message
                    );
                    if !last_error.retryable() || attempt == 1 {
                        break;
                    }
                    tokio::time::sleep(retry_delay).await;
                }
            }
        }
    }
    Err(last_error)
}

/// 只取消下载，递增代数使已取消任务的回调无法覆盖新任务。
pub fn cancel<R: Runtime>(app: &AppHandle<R>) -> Snapshot {
    let state = app.state::<UpdaterService>();
    let mut core = state.0.lock();
    if core.snapshot.phase == Phase::Downloading {
        if let Some(cancellation) = core.cancellation.take() {
            cancellation.cancel();
        }
        core.generation += 1;
        core.bytes = None;
        core.snapshot.phase = Phase::Available;
        core.snapshot.downloaded_bytes = 0;
        core.snapshot.content_length = None;
        core.snapshot.source = None;
        core.snapshot.last_error = None;
    }
    publish(app, &mut core)
}

/// 安装记录必须显式保存；Windows 安装器会直接结束旧进程，不能依赖退出自动保存。
fn save_receipt<R: Runtime>(
    app: &AppHandle<R>,
    receipt: &InstallReceipt,
) -> Result<(), UpdateError> {
    save_receipt_to(app, std::path::Path::new(RECEIPT_FILE), receipt)
}

/// 生产使用应用目录；测试注入临时路径验证真实 Store 落盘及失败传播。
fn save_receipt_to<R: Runtime>(
    app: &AppHandle<R>,
    path: &std::path::Path,
    receipt: &InstallReceipt,
) -> Result<(), UpdateError> {
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let store = app.store(path)?;
        store.set("lastInstall", serde_json::to_value(receipt)?);
        store.save()?;
        Ok(())
    })();
    result
        .map_err(|e| UpdateError::new("install", "storage", format!("保存更新记录失败：{e}"), None))
}

/// 调用官方安装器；下载包保留到成功退出，安装失败仍可重试。
pub async fn install<R: Runtime>(app: AppHandle<R>) -> Result<Snapshot, UpdateError> {
    let (update, bytes, receipt) = {
        let state = app.state::<UpdaterService>();
        let mut core = state.0.lock();
        if core.snapshot.phase != Phase::Ready {
            return Ok(core.snapshot.clone());
        }
        let (Some(update), Some(bytes)) = (core.candidate.clone(), core.bytes.clone()) else {
            return Err(UpdateError::new(
                "install",
                "operationFailed",
                "更新包尚未准备完成",
                None,
            ));
        };
        let receipt = InstallReceipt {
            from_version: core.snapshot.current_version.clone(),
            target_version: update.version.clone(),
            executable_path: std::env::current_exe()
                .map_err(|e| UpdateError::new("install", "operationFailed", e, None))?
                .display()
                .to_string(),
            attempted_at: now_ms(),
            outcome: "pending".into(),
        };
        if let Err(error) = save_receipt(&app, &receipt) {
            log::error!("{}", error.message);
            core.snapshot.last_error = Some(error.clone());
            publish(&app, &mut core);
            return Err(error);
        }
        core.snapshot.last_install = Some(receipt.clone());
        core.snapshot.phase = Phase::Installing;
        core.snapshot.last_error = None;
        publish(&app, &mut core);
        (update, bytes, receipt)
    };
    log::info!(
        "开始安装更新：{} → {}，当前路径={}",
        receipt.from_version,
        receipt.target_version,
        receipt.executable_path
    );
    let result =
        tauri::async_runtime::spawn_blocking(move || update.install(bytes.as_slice())).await;
    match result {
        Ok(Ok(())) => app.restart(),
        error => {
            let error = UpdateError::new(
                "install",
                "operationFailed",
                format!("安装更新失败：{error:?}"),
                None,
            );
            log::error!("{}", error.message);
            let mut receipt = receipt;
            receipt.outcome = "notApplied".into();
            if let Err(save_error) = save_receipt(&app, &receipt) {
                log::error!("{}", save_error.message);
            }
            let state = app.state::<UpdaterService>();
            let mut core = state.0.lock();
            core.snapshot.last_install = Some(receipt);
            core.snapshot.phase = Phase::Ready;
            core.snapshot.last_error = Some(error.clone());
            publish(&app, &mut core);
            Err(error)
        }
    }
}

/// 初始化时核对上次安装，并在原生层启动不依赖音频或 WebView 加载的自动检查。
pub fn initialize<R: Runtime>(app: &AppHandle<R>) {
    app.manage(UpdaterService::new(app.package_info().version.to_string()));
    let state = app.state::<UpdaterService>();
    let mut core = state.0.lock();
    match app.store(RECEIPT_FILE) {
        Ok(store) => {
            if let Some(value) = store.get("lastInstall") {
                match serde_json::from_value::<InstallReceipt>(value) {
                    Ok(mut receipt) => {
                        // 即使此前确认成功，再次打开旧副本也必须重新核对实际版本。
                        receipt.outcome = if installation_applied(
                            &core.snapshot.current_version,
                            &receipt.target_version,
                        ) {
                            "applied"
                        } else {
                            "notApplied"
                        }
                        .into();
                        log::info!(
                            "核对上次安装：目标={}，当前={}，结果={}，上次路径={}，当前路径={:?}",
                            receipt.target_version,
                            core.snapshot.current_version,
                            receipt.outcome,
                            receipt.executable_path,
                            std::env::current_exe()
                        );
                        if let Err(error) = save_receipt(app, &receipt) {
                            log::warn!("{}", error.message);
                        }
                        core.snapshot.last_install = Some(receipt);
                    }
                    Err(error) => log::warn!("读取历史更新记录失败：{error}"),
                }
            }
        }
        Err(error) => log::warn!("打开更新记录失败：{error}"),
    }
    drop(core);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // 开发服务和浏览器验收不应下载或提示正式发布版本。
        if cfg!(debug_assertions) {
            return;
        }
        run_startup_checks(|| async { check(app.clone(), CheckReason::Startup).await.phase }).await;
        let mut interval = tokio::time::interval(CHECK_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        interval.tick().await;
        loop {
            interval.tick().await;
            check(app.clone(), CheckReason::Scheduled).await;
        }
    });
}

/// 启动补查按原始时间点触发；休眠或任务延迟后跳过已过期的后续检查。
async fn run_startup_checks<F, Fut>(mut check_once: F)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Phase>,
{
    let started = tokio::time::Instant::now();
    for seconds in [0, 30, 120] {
        let deadline = started + std::time::Duration::from_secs(seconds);
        if seconds != 0 && deadline < tokio::time::Instant::now() {
            continue;
        }
        tokio::time::sleep_until(deadline).await;
        if check_once().await != Phase::Error {
            break;
        }
    }
}

#[cfg(test)]
mod tests;
