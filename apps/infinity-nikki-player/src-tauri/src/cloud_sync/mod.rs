//! 云端快照上传与恢复准备；同步配置和凭据均不进入用户内容快照。

mod config;
#[cfg(test)]
mod test_support;
mod transport;

use crate::data_management::{self, PreparedRestore, SnapshotSummary};
pub use config::{CloudSyncConfig, SecretUpdate};
use config::{CredentialStore, Provider, StoredConfig, SystemCredentials};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    future::Future,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};
use tokio_util::sync::CancellationToken;
use transport::{Transport, MAX_ARCHIVE_BYTES, MAX_MANIFEST_BYTES};

const MANIFEST: &str = "manifest.json";
const FORMAT: &str = "infinity-nikki-player-cloud";
const STATUS_EVENT: &str = "cloud-sync-status-changed";

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CloudSyncPhase {
    #[default]
    Idle,
    Testing,
    Uploading,
    Downloading,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncStatus {
    pub phase: CloudSyncPhase,
    pub last_sync_at: Option<u64>,
    pub last_error: Option<String>,
    pub pending: bool,
}

struct Runtime {
    stored: StoredConfig,
    config_valid: bool,
    status: CloudSyncStatus,
    cancellation: Option<CancellationToken>,
    epoch: u64,
    synced_generation: u64,
    observed_generation: u64,
    first_change: Option<Instant>,
    last_change: Option<Instant>,
    last_attempt: Option<(u64, u64)>,
    next_retry: Option<Instant>,
    retry_count: u32,
    last_fingerprint: Option<String>,
}

struct Service {
    path: PathBuf,
    credentials: Arc<dyn CredentialStore>,
    runtime: Mutex<Runtime>,
    operation: Arc<AsyncMutex<()>>,
}

pub struct CloudSyncState(Arc<Service>);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format: String,
    version: u32,
    archive: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    previous_snapshot_key: Option<String>,
    archive_size: usize,
    sha256: String,
    summary: SnapshotSummary,
}

impl Manifest {
    fn validate(&self) -> Result<(), String> {
        let id = self
            .archive
            .strip_prefix("snapshots/")
            .and_then(|name| name.strip_suffix(".zip"));
        if self.format != FORMAT || self.version != 1 || self.summary.format_version != 1 {
            return Err("云端快照版本不兼容，请更新应用后重试".into());
        }
        if id.is_none_or(|id| uuid::Uuid::parse_str(id).is_err())
            || self
                .previous_snapshot_key
                .as_deref()
                .is_some_and(|key| !valid_archive_key(key))
            || self.archive_size > MAX_ARCHIVE_BYTES
            || self.archive_size == 0
            || self.sha256.len() != 64
            || !self.sha256.bytes().all(|ch| ch.is_ascii_hexdigit())
        {
            return Err("云端快照清单无效".into());
        }
        if self.summary.kind != data_management::SnapshotKind::Cloud {
            return Err("云端快照类型无效".into());
        }
        Ok(())
    }
}

fn service(app: &tauri::AppHandle) -> Result<Arc<Service>, String> {
    app.try_state::<CloudSyncState>()
        .map(|state| state.0.clone())
        .ok_or_else(|| "云同步尚未初始化".into())
}

/// 启动后只监听后续内容变更；不会自动下载或用启动时的本地数据覆盖云端。
pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    if app.try_state::<CloudSyncState>().is_some() {
        return Ok(());
    }
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "获取云同步配置目录失败")?
        .join("cloud-sync.json");
    let (stored, config_valid) = match StoredConfig::load(&path) {
        Ok(stored) => (stored, true),
        Err(error) => (
            StoredConfig {
                last_error: Some(error),
                ..Default::default()
            },
            false,
        ),
    };
    let generation = data_management::change_generation(app);
    let status = CloudSyncStatus {
        last_sync_at: stored.last_sync_at,
        last_error: stored.last_error.clone(),
        ..Default::default()
    };
    let service = Arc::new(Service {
        path,
        credentials: Arc::new(SystemCredentials),
        operation: Arc::new(AsyncMutex::new(())),
        runtime: Mutex::new(Runtime {
            stored,
            config_valid,
            status,
            cancellation: None,
            epoch: 0,
            synced_generation: generation,
            observed_generation: generation,
            first_change: None,
            last_change: None,
            last_attempt: None,
            next_retry: None,
            retry_count: 0,
            last_fingerprint: None,
        }),
    });
    app.manage(CloudSyncState(service.clone()));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        automatic_worker(app, service).await;
    });
    Ok(())
}

pub fn get_config(app: &tauri::AppHandle) -> Result<CloudSyncConfig, String> {
    let service = service(app)?;
    let config = service.runtime.lock().stored.public_config();
    Ok(config)
}

pub fn get_status(app: &tauri::AppHandle) -> Result<CloudSyncStatus, String> {
    let service = service(app)?;
    let status = service.runtime.lock().status.clone();
    Ok(status)
}

pub async fn save_config(
    app: &tauri::AppHandle,
    config: CloudSyncConfig,
    password: SecretUpdate,
    secret_key: SecretUpdate,
) -> Result<CloudSyncConfig, String> {
    let service = service(app)?;
    let _operation = service
        .operation
        .clone()
        .try_lock_owned()
        .map_err(|_| "云同步正在进行，请结束后再保存配置")?;
    let previous = service.runtime.lock().stored.clone();
    let path = service.path.clone();
    let credentials = service.credentials.clone();
    let next = tauri::async_runtime::spawn_blocking(move || {
        config::save_transaction(
            &path,
            &previous,
            config,
            &password,
            &secret_key,
            credentials.as_ref(),
        )
    })
    .await
    .map_err(|_| "保存云同步配置任务异常")??;
    let generation = data_management::change_generation(app);
    let config = next.public_config();
    {
        let mut runtime = service.runtime.lock();
        if !same_target(&runtime.stored, &next) {
            runtime.last_fingerprint = None;
        }
        runtime.stored = next;
        runtime.config_valid = true;
        runtime.epoch = runtime.epoch.wrapping_add(1);
        runtime.synced_generation = generation;
        runtime.observed_generation = generation;
        runtime.first_change = None;
        runtime.last_change = None;
        runtime.last_attempt = None;
        runtime.next_retry = None;
        runtime.retry_count = 0;
        runtime.status.pending = false;
        runtime.status.last_error = None;
    }
    emit_status(app, &service);
    Ok(config)
}

struct Operation {
    service: Arc<Service>,
    app: tauri::AppHandle,
    token: CancellationToken,
    epoch: u64,
    _lock: OwnedMutexGuard<()>,
}

impl Operation {
    fn begin(
        app: &tauri::AppHandle,
        service: Arc<Service>,
        phase: CloudSyncPhase,
    ) -> Result<Self, String> {
        let lock = service
            .operation
            .clone()
            .try_lock_owned()
            .map_err(|_| "已有云同步操作正在进行")?;
        let token = CancellationToken::new();
        let epoch = {
            let mut runtime = service.runtime.lock();
            runtime.status.phase = phase;
            runtime.cancellation = Some(token.clone());
            runtime.epoch
        };
        emit_status(app, &service);
        Ok(Self {
            service,
            app: app.clone(),
            token,
            epoch,
            _lock: lock,
        })
    }

    async fn run<T>(&self, future: impl Future<Output = Result<T, String>>) -> Result<T, String> {
        tokio::select! {
            biased;
            _ = self.token.cancelled() => Err("云同步已取消".into()),
            result = tokio::time::timeout(Duration::from_secs(600), future) => result.map_err(|_| "云同步超时，请检查网络后重试".to_string())?,
        }
    }

    fn finish<T>(&self, result: &Result<T, String>, synced_generation: Option<(u64, bool)>) {
        let mut runtime = self.service.runtime.lock();
        if runtime.epoch != self.epoch {
            return;
        }
        if result.is_ok() {
            runtime.status.last_error = None;
            if let Some((generation, published)) = synced_generation {
                acknowledge_generation(
                    &mut runtime,
                    generation,
                    data_management::change_generation(&self.app),
                );
                if published {
                    runtime.status.last_sync_at = Some(now_ms());
                }
            }
        } else if let Err(error) = result {
            if error != "云同步已取消" {
                runtime.status.last_error = Some(error.clone());
                if runtime.status.phase == CloudSyncPhase::Uploading {
                    runtime.next_retry = Some(Instant::now() + retry_delay(runtime.retry_count));
                    runtime.retry_count = runtime.retry_count.saturating_add(1);
                }
            }
        }
        runtime.stored.last_sync_at = runtime.status.last_sync_at;
        runtime.stored.last_error = runtime.status.last_error.clone();
        if runtime.config_valid && config::atomic_save(&self.service.path, &runtime.stored).is_err()
        {
            log::warn!("云同步状态保存失败");
        }
    }
}

impl Drop for Operation {
    fn drop(&mut self) {
        {
            let mut runtime = self.service.runtime.lock();
            if runtime.epoch == self.epoch {
                runtime.status.phase = CloudSyncPhase::Idle;
                runtime.cancellation = None;
            }
        }
        emit_status(&self.app, &self.service);
    }
}

async fn build_transport(
    service: &Arc<Service>,
    config: CloudSyncConfig,
    password: SecretUpdate,
    secret_key: SecretUpdate,
) -> Result<Transport, String> {
    let config = config::normalize(config)?;
    config::validate_active(&config)?;
    let reference = {
        let runtime = service.runtime.lock();
        match config.provider {
            Provider::Webdav => runtime.stored.password_id.clone(),
            Provider::S3 => runtime.stored.secret_key_id.clone(),
        }
    };
    let credentials = service.credentials.clone();
    let secret = tauri::async_runtime::spawn_blocking(move || {
        let update = match config.provider {
            Provider::Webdav => password,
            Provider::S3 => secret_key,
        };
        let secret = config::resolve_secret(&reference, &update, credentials.as_ref())?;
        Transport::build(&config, secret)
    })
    .await
    .map_err(|_| "读取云同步凭据任务异常")??;
    Ok(secret)
}

async fn saved_transport(service: &Arc<Service>) -> Result<Transport, String> {
    let config = service.runtime.lock().stored.public_config();
    if !config.enabled {
        return Err("请先配置并启用云同步".into());
    }
    build_transport(
        service,
        config,
        SecretUpdate::default(),
        SecretUpdate::default(),
    )
    .await
}

pub async fn test_connection(
    app: &tauri::AppHandle,
    config: CloudSyncConfig,
    password: SecretUpdate,
    secret_key: SecretUpdate,
) -> Result<(), String> {
    let service = service(app)?;
    let operation = Operation::begin(app, service.clone(), CloudSyncPhase::Testing)?;
    let result = operation
        .run(async {
            let transport = build_transport(&service, config, password, secret_key).await?;
            transport.test().await
        })
        .await;
    operation.finish(&result, None);
    result
}

async fn read_manifest(transport: &Transport) -> Result<Option<Manifest>, String> {
    let Some(bytes) = transport.get(MANIFEST, MAX_MANIFEST_BYTES).await? else {
        return Ok(None);
    };
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|_| "云端快照清单损坏")?;
    manifest.validate()?;
    Ok(Some(manifest))
}

pub async fn preview(app: &tauri::AppHandle) -> Result<Option<SnapshotSummary>, String> {
    let service = service(app)?;
    let operation = Operation::begin(app, service.clone(), CloudSyncPhase::Downloading)?;
    let result = operation
        .run(async {
            read_manifest(&saved_transport(&service).await?)
                .await
                .map(|manifest| manifest.map(|manifest| manifest.summary))
        })
        .await;
    operation.finish(&result, None);
    result
}

pub async fn upload(app: &tauri::AppHandle) -> Result<(), String> {
    upload_with_service(app, service(app)?, false).await
}

async fn upload_with_service(
    app: &tauri::AppHandle,
    service: Arc<Service>,
    automatic: bool,
) -> Result<(), String> {
    if data_management::restore_frozen(app) {
        return Err("数据恢复后需要重启应用，再进行云同步".into());
    }
    let operation = Operation::begin(app, service.clone(), CloudSyncPhase::Uploading)?;
    let mut captured_generation = None;
    let mut captured_fingerprint = None;
    let mut published = false;
    let result = operation
        .run(async {
            let app = app.clone();
            let (bytes, summary, generation, fingerprint) =
                tauri::async_runtime::spawn_blocking(move || {
                    data_management::build_cloud_snapshot_with_generation(&app)
                })
                .await
                .map_err(|_| "创建云端快照任务异常")??;
            captured_generation = Some(generation);
            captured_fingerprint = Some(fingerprint.clone());
            if automatic && service.runtime.lock().last_fingerprint.as_deref() == Some(&fingerprint)
            {
                return Ok(());
            }
            let transport = saved_transport(&service).await?;
            publish_snapshot(&transport, bytes, summary).await?;
            published = true;
            Ok(())
        })
        .await;
    if result.is_ok() {
        service.runtime.lock().last_fingerprint = captured_fingerprint;
    }
    operation.finish(
        &result,
        captured_generation
            .filter(|_| result.is_ok())
            .map(|generation| (generation, published)),
    );
    result
}

async fn publish_snapshot(
    transport: &Transport,
    bytes: Vec<u8>,
    summary: SnapshotSummary,
) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > MAX_ARCHIVE_BYTES {
        return Err("云端快照大小无效或超过 512 MiB".into());
    }
    transport.ensure_directories().await?;
    let previous = read_manifest(transport).await?;
    let manifest = Manifest {
        format: FORMAT.into(),
        version: 1,
        archive: format!("snapshots/{}.zip", uuid::Uuid::new_v4()),
        previous_snapshot_key: previous.as_ref().map(|manifest| manifest.archive.clone()),
        archive_size: bytes.len(),
        sha256: format!("{:x}", Sha256::digest(&bytes)),
        summary,
    };
    manifest.validate()?;
    let manifest_bytes = serde_json::to_vec(&manifest).map_err(|_| "生成云端快照清单失败")?;
    // 每次写独立归档，完整成功后才发布指针；传输中断不会破坏已发布的快照。
    transport.put(&manifest.archive, bytes).await?;
    // 清单请求失败时服务器仍可能已经提交，不能删除它可能指向的新归档。
    transport.put(MANIFEST, manifest_bytes).await?;
    if let Some(key) = previous.and_then(|manifest| manifest.previous_snapshot_key) {
        if key != manifest.archive
            && manifest.previous_snapshot_key.as_deref() != Some(&key)
            && transport.delete(&key).await.is_err()
        {
            log::warn!("旧云端快照未能清理，本次上传已成功");
        }
    }
    Ok(())
}

pub async fn prepare_restore(app: &tauri::AppHandle) -> Result<PreparedRestore, String> {
    let service = service(app)?;
    let operation = Operation::begin(app, service.clone(), CloudSyncPhase::Downloading)?;
    let result = operation
        .run(async {
            let transport = saved_transport(&service).await?;
            let (manifest, bytes) = download_verified(&transport).await?;
            let app = app.clone();
            let prepared = tauri::async_runtime::spawn_blocking(move || {
                data_management::prepare_cloud_archive(&app, bytes)
            })
            .await
            .map_err(|_| "准备云端恢复任务异常")??;
            if prepared.summary != manifest.summary {
                return Err("云端快照摘要与归档内容不一致".into());
            }
            Ok(prepared)
        })
        .await;
    operation.finish(&result, None);
    result
}

/// 返回时活动网络操作已退出；持有返回锁可阻止自动上传跨越资料恢复事务。
pub async fn quiesce(app: &tauri::AppHandle) -> Result<Option<OwnedMutexGuard<()>>, String> {
    let Some(state) = app.try_state::<CloudSyncState>() else {
        return Ok(None);
    };
    let service = state.0.clone();
    if let Some(token) = service.runtime.lock().cancellation.clone() {
        token.cancel();
    }
    Ok(Some(service.operation.clone().lock_owned().await))
}

pub async fn cancel(app: &tauri::AppHandle) -> Result<(), String> {
    drop(quiesce(app).await?);
    Ok(())
}

fn emit_status(app: &tauri::AppHandle, service: &Service) {
    let status = service.runtime.lock().status.clone();
    if app.emit(STATUS_EVENT, status).is_err() {
        log::debug!("云同步状态事件发送失败");
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn valid_archive_key(key: &str) -> bool {
    key.strip_prefix("snapshots/")
        .and_then(|key| key.strip_suffix(".zip"))
        .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
}

async fn download_verified(transport: &Transport) -> Result<(Manifest, Vec<u8>), String> {
    for attempt in 0..2 {
        let manifest = read_manifest(transport)
            .await?
            .ok_or("云端没有可恢复的快照")?;
        if let Some(bytes) = transport.get(&manifest.archive, MAX_ARCHIVE_BYTES).await? {
            if bytes.len() == manifest.archive_size
                && format!("{:x}", Sha256::digest(&bytes)) == manifest.sha256
            {
                return Ok((manifest, bytes));
            }
        }
        if attempt == 0 {
            continue;
        }
    }
    Err("云端快照已变化或校验失败，请稍后重试；未修改本地数据".into())
}

fn due(first: Instant, last: Instant, now: Instant) -> bool {
    now.saturating_duration_since(last) >= Duration::from_secs(1)
        || now.saturating_duration_since(first) >= Duration::from_secs(10)
}

fn retry_delay(attempt: u32) -> Duration {
    Duration::from_secs((30 * 2u64.pow(attempt.min(4))).min(300))
}

fn acknowledge_generation(runtime: &mut Runtime, captured: u64, current: u64) {
    runtime.synced_generation = captured;
    runtime.observed_generation = current;
    runtime.status.pending = current != captured;
    runtime.next_retry = None;
    runtime.retry_count = 0;
    // 上传期间的新改动开启下一轮防抖，绝不能被旧快照的完成回调清掉。
    let pending_since = runtime.status.pending.then(Instant::now);
    runtime.first_change = pending_since;
    runtime.last_change = pending_since;
}

fn same_target(left: &StoredConfig, right: &StoredConfig) -> bool {
    if left.config.provider != right.config.provider {
        return false;
    }
    match left.config.provider {
        Provider::Webdav => {
            let (a, b) = (&left.config.webdav, &right.config.webdav);
            a.base_url == b.base_url
                && a.username == b.username
                && a.remote_root == b.remote_root
                && a.profile == b.profile
                && left.password_id == right.password_id
        }
        Provider::S3 => {
            let (a, b) = (&left.config.s3, &right.config.s3);
            a.region == b.region
                && a.bucket == b.bucket
                && a.endpoint == b.endpoint
                && a.access_key_id == b.access_key_id
                && a.remote_root == b.remote_root
                && a.profile == b.profile
                && left.secret_key_id == right.secret_key_id
        }
    }
}

async fn automatic_worker(app: tauri::AppHandle, service: Arc<Service>) {
    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if data_management::restore_frozen(&app) {
            continue;
        }
        let generation = data_management::change_generation(&app);
        let mut status_changed = false;
        let should_upload = {
            let mut runtime = service.runtime.lock();
            if !runtime.stored.config.enabled || !runtime.stored.config.auto_upload {
                runtime.synced_generation = generation;
                runtime.observed_generation = generation;
                runtime.first_change = None;
                runtime.last_change = None;
                runtime.next_retry = None;
                runtime.retry_count = 0;
                false
            } else {
                let now = Instant::now();
                if generation != runtime.observed_generation {
                    runtime.observed_generation = generation;
                    runtime.first_change.get_or_insert(now);
                    runtime.last_change = Some(now);
                }
                let pending = generation != runtime.synced_generation;
                if pending != runtime.status.pending {
                    runtime.status.pending = pending;
                    status_changed = true;
                }
                pending
                    && runtime.status.phase == CloudSyncPhase::Idle
                    && (runtime.last_attempt != Some((runtime.epoch, generation))
                        || runtime.next_retry.is_some_and(|retry| now >= retry))
                    && runtime
                        .first_change
                        .zip(runtime.last_change)
                        .is_some_and(|(first, last)| due(first, last, now))
            }
        };
        if status_changed {
            emit_status(&app, &service);
        }
        if should_upload {
            {
                let mut runtime = service.runtime.lock();
                runtime.last_attempt = Some((runtime.epoch, generation));
            }
            // 失败保留待上传状态，按 30 秒至 5 分钟退避；手动操作不受退避限制。
            if upload_with_service(&app, service.clone(), true)
                .await
                .is_err()
            {
                let mut runtime = service.runtime.lock();
                runtime
                    .next_retry
                    .get_or_insert_with(|| Instant::now() + Duration::from_secs(30));
                log::debug!("自动云端上传未完成，请在设置中查看状态");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{serve, Reply};
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn summary() -> SnapshotSummary {
        serde_json::from_value(serde_json::json!({
            "formatVersion": 1, "appVersion": "1.3.3", "createdAt": 1, "deviceName": "测试设备", "kind": "cloud",
            "counts": { "midi": 0, "songLists": 0, "templates": 0, "projects": 0, "drafts": 0 }
        })).unwrap()
    }

    fn test_manifest(bytes: &[u8]) -> Manifest {
        Manifest {
            format: FORMAT.into(),
            version: 1,
            archive: format!("snapshots/{}.zip", uuid::Uuid::new_v4()),
            previous_snapshot_key: None,
            archive_size: bytes.len(),
            sha256: format!("{:x}", Sha256::digest(bytes)),
            summary: summary(),
        }
    }

    fn runtime() -> Runtime {
        Runtime {
            stored: StoredConfig::default(),
            config_valid: true,
            status: CloudSyncStatus::default(),
            cancellation: None,
            epoch: 0,
            synced_generation: 0,
            observed_generation: 0,
            first_change: None,
            last_change: None,
            last_attempt: None,
            next_retry: None,
            retry_count: 0,
            last_fingerprint: None,
        }
    }

    #[test]
    fn debounce_caps_continuous_changes_at_ten_seconds() {
        let start = Instant::now();
        assert!(!due(start, start, start + Duration::from_millis(900)));
        assert!(due(start, start, start + Duration::from_secs(1)));
        assert!(due(
            start,
            start + Duration::from_millis(9900),
            start + Duration::from_secs(10)
        ));
        assert_eq!(retry_delay(0), Duration::from_secs(30));
        assert_eq!(retry_delay(1), Duration::from_secs(60));
        assert_eq!(retry_delay(100), Duration::from_secs(300));
    }

    #[test]
    fn completion_only_acknowledges_captured_generation_and_keeps_new_edits_pending() {
        let mut runtime = runtime();
        runtime.retry_count = 4;
        acknowledge_generation(&mut runtime, 3, 4);
        assert_eq!(runtime.synced_generation, 3);
        assert!(runtime.status.pending);
        assert!(runtime.first_change.is_some());
        assert_eq!(runtime.retry_count, 0);
        acknowledge_generation(&mut runtime, 4, 4);
        assert!(!runtime.status.pending);
        assert!(runtime.first_change.is_none());
    }

    #[tokio::test]
    async fn snapshot_rotation_retains_current_and_previous_only() {
        let transport = Transport::S3 {
            store: Arc::new(object_store::memory::InMemory::new()),
            prefix: "test/v1/default".into(),
        };
        publish_snapshot(&transport, vec![1], summary())
            .await
            .unwrap();
        let first = read_manifest(&transport).await.unwrap().unwrap();
        publish_snapshot(&transport, vec![2], summary())
            .await
            .unwrap();
        let second = read_manifest(&transport).await.unwrap().unwrap();
        assert_eq!(
            second.previous_snapshot_key.as_deref(),
            Some(first.archive.as_str())
        );
        publish_snapshot(&transport, vec![3], summary())
            .await
            .unwrap();
        let third = read_manifest(&transport).await.unwrap().unwrap();
        assert_eq!(
            third.previous_snapshot_key.as_deref(),
            Some(second.archive.as_str())
        );
        assert!(transport.get(&first.archive, 100).await.unwrap().is_none());
        assert_eq!(
            transport.get(&second.archive, 100).await.unwrap(),
            Some(vec![2])
        );
        assert_eq!(
            transport.get(&third.archive, 100).await.unwrap(),
            Some(vec![3])
        );
    }

    #[tokio::test]
    async fn download_refreshes_manifest_once_when_rotation_or_corruption_changes_archive() {
        for old_status in [404, 200] {
            let old = test_manifest(&[1]);
            let fresh = test_manifest(&[2, 3]);
            let fresh_key = fresh.archive.clone();
            let expected = fresh.archive.clone();
            let old_json = serde_json::to_vec(&old).unwrap();
            let fresh_json = serde_json::to_vec(&fresh).unwrap();
            let manifests = Arc::new(AtomicUsize::new(0));
            let counter = manifests.clone();
            let (base, _server) = serve(move |request| {
                if request.path.ends_with("/manifest.json") {
                    let count = counter.fetch_add(1, Ordering::SeqCst);
                    Reply::new(
                        200,
                        if count == 0 {
                            old_json.clone()
                        } else {
                            fresh_json.clone()
                        },
                    )
                } else if request.path.ends_with(&fresh_key) {
                    Reply::new(200, vec![2, 3])
                } else {
                    Reply::new(old_status, vec![9])
                }
            });
            let transport = Transport::Webdav {
                client: transport::client_builder().unwrap().build().unwrap(),
                base: reqwest::Url::parse(&base).unwrap(),
                username: "测试".into(),
                password: "测试".into(),
                prefix: "root".into(),
            };
            let (manifest, bytes) = download_verified(&transport).await.unwrap();
            assert_eq!(manifest.archive, expected);
            assert_eq!(bytes, vec![2, 3]);
            assert_eq!(manifests.load(Ordering::SeqCst), 2);
        }
    }

    #[tokio::test]
    async fn corrupted_archive_is_never_returned_for_restore_after_retry() {
        let transport = Transport::S3 {
            store: Arc::new(object_store::memory::InMemory::new()),
            prefix: "test/v1/default".into(),
        };
        let manifest = test_manifest(&[1]);
        transport.put(&manifest.archive, vec![9]).await.unwrap();
        transport
            .put(MANIFEST, serde_json::to_vec(&manifest).unwrap())
            .await
            .unwrap();
        assert!(download_verified(&transport)
            .await
            .unwrap_err()
            .contains("校验失败"));
    }

    #[tokio::test]
    async fn manifest_is_published_after_archive_and_corruption_is_detectable() {
        let transport = Transport::S3 {
            store: Arc::new(object_store::memory::InMemory::new()),
            prefix: "test/v1/default".into(),
        };
        let summary: SnapshotSummary = serde_json::from_value(serde_json::json!({
            "formatVersion": 1, "appVersion": "1.3.3", "createdAt": 1, "deviceName": "测试设备", "kind": "cloud",
            "counts": { "midi": 0, "songLists": 0, "templates": 0, "projects": 0, "drafts": 0 }
        })).unwrap();
        publish_snapshot(&transport, vec![1, 2, 3], summary)
            .await
            .unwrap();
        let mut manifest = read_manifest(&transport).await.unwrap().unwrap();
        let bytes = transport
            .get(&manifest.archive, MAX_ARCHIVE_BYTES)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(manifest.sha256, format!("{:x}", Sha256::digest(&bytes)));
        manifest.archive = "../../settings.json".into();
        assert!(manifest.validate().is_err());
        manifest.archive = format!("snapshots/{}.zip", uuid::Uuid::new_v4());
        manifest.version = 2;
        assert!(manifest.validate().is_err());
    }
}
