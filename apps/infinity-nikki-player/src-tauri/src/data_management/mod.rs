//! 用户资料管理；系统配置和设备凭据始终留在系统默认配置目录。

mod archive;
#[cfg(test)]
mod tests;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use uuid::Uuid;

pub const CONTENT_DIRS: [&str; 5] = [
    "midi_library",
    "song_lists",
    "song_list_covers",
    "templates",
    "midi_projects",
];
const BACKUP_DIR: &str = "data_backups";
const POINTER_FILE: &str = "data-location.json";
const PENDING_DRAFTS_FILE: &str = "pending-template-drafts.json";
const TRANSACTION_FILE: &str = "data-restore-transaction.json";

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotKind {
    Local,
    Cloud,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCounts {
    pub midi: usize,
    pub song_lists: usize,
    pub templates: usize,
    pub projects: usize,
    pub drafts: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    pub format_version: u32,
    pub app_version: String,
    pub created_at: u64,
    pub device_name: String,
    pub kind: SnapshotKind,
    pub counts: SnapshotCounts,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub size: u64,
    pub summary: SnapshotSummary,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedRestore {
    pub token: String,
    pub summary: SnapshotSummary,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLocations {
    pub data_dir: String,
    pub default_data_dir: String,
    pub cache_dir: String,
    pub log_dir: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataPointer {
    path: PathBuf,
}

struct Prepared {
    root: PathBuf,
    stage: PathBuf,
    drafts: HashMap<String, String>,
}

/// 全部资料命令共享一把短期锁；压缩后的上传不占用此锁。
pub struct DataManagement {
    operation: Mutex<()>,
    root: Mutex<PathBuf>,
    transaction_path: PathBuf,
    generation: AtomicU64,
    frozen: AtomicBool,
    prepared: Mutex<HashMap<String, Prepared>>,
    last_backup_request: AtomicU64,
}

impl DataManagement {
    fn new(root: PathBuf, transaction_path: PathBuf) -> Self {
        Self {
            operation: Mutex::new(()),
            root: Mutex::new(root),
            transaction_path,
            generation: AtomicU64::new(0),
            frozen: AtomicBool::new(false),
            prepared: Mutex::new(HashMap::new()),
            last_backup_request: AtomicU64::new(0),
        }
    }
}

pub(super) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

fn device_name() -> String {
    if let Ok(name) = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")) {
        if !name.trim().is_empty() {
            return name.trim().into();
        }
    }
    // 从 Finder 启动时通常没有 HOSTNAME，读取系统电脑名称以便区分快照来源。
    #[cfg(target_os = "macos")]
    if let Ok(output) = std::process::Command::new("/usr/sbin/scutil")
        .args(["--get", "ComputerName"])
        .output()
    {
        if output.status.success() {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            if !name.is_empty() {
                return name;
            }
        }
    }
    std::env::consts::OS.into()
}

fn config_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|error| format!("获取系统配置目录失败：{error}"))
}

fn service<R: Runtime>(app: &AppHandle<R>) -> Result<Arc<DataManagement>, String> {
    app.try_state::<Arc<DataManagement>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "资料管理尚未初始化".into())
}

fn resolve_data_root(default: &Path, config: &Path) -> Result<PathBuf, String> {
    let pointer = config.join(POINTER_FILE);
    if !pointer.exists() {
        return Ok(default.into());
    }
    let value: DataPointer = serde_json::from_slice(
        &fs::read(pointer).map_err(|error| format!("读取资料目录设置失败：{error}"))?,
    )
    .map_err(|error| format!("资料目录设置无效：{error}"))?;
    if !value.path.is_absolute() {
        return Err("资料目录必须是绝对路径".into());
    }
    Ok(value.path)
}

pub fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(state) = app.try_state::<Arc<DataManagement>>() {
        return Ok(state.root.lock().clone());
    }
    let default = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("获取默认资料目录失败：{error}"))?;
    resolve_data_root(&default, &config_dir(app)?)
}

/// 必须在种子初始化、资料读取和后台同步之前调用，先完成上次中断事务的恢复。
pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app.try_state::<Arc<DataManagement>>().is_some() {
        return Ok(());
    }
    let config = config_dir(app)?;
    fs::create_dir_all(&config).map_err(|error| format!("创建配置目录失败：{error}"))?;
    recover_transaction(&config)?;
    let root = data_dir(app)?;
    if config.join(POINTER_FILE).exists() {
        let meta = fs::metadata(&root).map_err(|error| {
            format!(
                "已配置的资料目录不可用：{}（{error}）。请重新连接磁盘，或修复 {} 后重启应用。",
                root.display(),
                config.join(POINTER_FILE).display()
            )
        })?;
        if !meta.is_dir() {
            return Err(format!(
                "已配置的资料路径不是目录：{}。请修复 {} 后重启应用。",
                root.display(),
                config.join(POINTER_FILE).display()
            ));
        }
    }
    fs::create_dir_all(&root).map_err(|error| format!("创建资料目录失败：{error}"))?;
    let staging = root.join(".data-staging");
    if staging.exists() {
        fs::remove_dir_all(&staging)
            .map_err(|error| format!("清理上次取消的恢复暂存目录失败：{error}"))?;
    }
    if !app.manage(Arc::new(DataManagement::new(
        root,
        config.join(TRANSACTION_FILE),
    ))) {
        return Ok(());
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // 主窗口注册事件后再请求备份，避免启动期间丢掉草稿收集请求。
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            if let Err(error) = request_scheduled_backup(&app) {
                log::warn!("自动备份调度失败：{error}");
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
    Ok(())
}

pub fn change_generation<R: Runtime>(app: &AppHandle<R>) -> u64 {
    app.try_state::<Arc<DataManagement>>()
        .map_or(0, |state| state.generation.load(Ordering::Acquire))
}

pub fn restore_frozen<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Ok(state) = service(app) else {
        return false;
    };
    // 活跃事务自己持有写锁；仅在空闲时识别遗留日志，避免把可完整回滚的临时日志误判为故障。
    if let Some(_lock) = state.operation.try_lock() {
        freeze_for_pending_transaction(&state);
    }
    state.frozen.load(Ordering::Acquire)
}

pub fn data_operation_requires_restart<R: Runtime>(app: &AppHandle<R>) -> bool {
    restore_frozen(app)
}

/// 事务日志是持久化的最后防线；冻结标志意外复位也不能放行混合资料的新写入。
fn freeze_for_pending_transaction(state: &DataManagement) {
    if !matches!(fs::symlink_metadata(&state.transaction_path), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
    {
        state.frozen.store(true, Ordering::Release);
    }
}

pub fn mark_content_changed<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(state) = service(app) {
        if state.frozen.load(Ordering::Acquire) {
            return;
        }
        let generation = state.generation.fetch_add(1, Ordering::AcqRel) + 1;
        let _ = app.emit(
            "data-content-changed",
            serde_json::json!({ "generation": generation }),
        );
    }
}

/// 命令入口统一串行化，内部辅助函数不再加锁，避免同一事务嵌套死锁。
pub fn with_data_write<R: Runtime, T>(
    app: &AppHandle<R>,
    cloud_change: bool,
    operation: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let state = service(app)?;
    let _lock = state.operation.lock();
    freeze_for_pending_transaction(&state);
    if state.frozen.load(Ordering::Acquire) {
        return Err("资料已更新或恢复尚未完成，请重启应用完成修复后继续操作".into());
    }
    require_available_root(&state.root.lock())?;
    let result = operation();
    // 回滚失败必须保持冻结，不能允许新写入随后被启动恢复流程覆盖。
    freeze_for_pending_transaction(&state);
    // 部分写入后返回错误仍属于本地变化；内容摘要由同步层负责消除无变化的重复请求。
    if cloud_change {
        mark_content_changed(app);
    }
    result
}

fn require_available_root(root: &Path) -> Result<(), String> {
    match fs::metadata(root) {
        Ok(meta) if meta.is_dir() => Ok(()),
        _ => Err(format!(
            "资料目录不可用：{}。请重新连接磁盘或修复目录后重试，应用不会创建空资料库。",
            root.display()
        )),
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("文件路径缺少父目录")?;
    fs::create_dir_all(parent).map_err(|error| format!("创建资料目录失败：{error}"))?;
    let temp = parent.join(format!(".data-write-{}", Uuid::new_v4()));
    let result = (|| {
        let mut file = File::create(&temp).map_err(|error| format!("创建临时文件失败：{error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("写入临时文件失败：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("保存临时文件失败：{error}"))?;
        fs::rename(&temp, path).map_err(|error| format!("替换资料文件失败：{error}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    atomic_write(
        path,
        &serde_json::to_vec(value).map_err(|error| format!("序列化资料失败：{error}"))?,
    )
}

pub fn get_data_locations<R: Runtime>(app: &AppHandle<R>) -> Result<DataLocations, String> {
    Ok(DataLocations {
        data_dir: data_dir(app)?.to_string_lossy().into(),
        default_data_dir: app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .into(),
        cache_dir: app
            .path()
            .app_cache_dir()
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .into(),
        log_dir: app
            .path()
            .app_log_dir()
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .into(),
    })
}

pub fn open_data_location<R: Runtime>(app: &AppHandle<R>, kind: &str) -> Result<(), String> {
    let locations = get_data_locations(app)?;
    let path = match kind {
        "data" => locations.data_dir,
        "cache" => locations.cache_dir,
        "logs" => locations.log_dir,
        _ => return Err("不支持此目录类型".into()),
    };
    ensure_location_exists(Path::new(&path), kind)?;
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map_err(|error| format!("打开目录失败：{error}"))?;
    Ok(())
}

fn ensure_location_exists(path: &Path, kind: &str) -> Result<(), String> {
    if kind == "data" {
        return require_available_root(path);
    }
    fs::create_dir_all(path).map_err(|error| format!("创建目录失败：{error}"))
}

fn valid_backup_id(id: &str) -> Result<(), String> {
    if Uuid::parse_str(id).is_err() {
        return Err("备份标识无效".into());
    }
    Ok(())
}

fn list_backups_at(root: &Path) -> Result<Vec<BackupInfo>, String> {
    let directory = root.join(BACKUP_DIR);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| format!("读取备份目录失败：{error}"))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
            || entry
                .path()
                .extension()
                .is_none_or(|extension| extension != "json")
        {
            continue;
        }
        let info = fs::read(entry.path())
            .ok()
            .and_then(|bytes| serde_json::from_slice::<BackupInfo>(&bytes).ok());
        if let Some(mut info) = info {
            if valid_backup_id(&info.id).is_err()
                || entry.file_name() != format!("{}.json", info.id).as_str()
            {
                continue;
            }
            let archive = root.join(BACKUP_DIR).join(format!("{}.zip", info.id));
            if let Ok(meta) = fs::symlink_metadata(&archive) {
                if meta.is_file() && !meta.file_type().is_symlink() {
                    info.size = meta.len();
                    backups.push(info);
                }
            }
        }
    }
    backups.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(backups)
}

pub fn list_data_backups<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<BackupInfo>, String> {
    let state = service(app)?;
    let _lock = state.operation.lock();
    list_backups_at(&data_dir(app)?)
}

fn create_backup_at(
    root: &Path,
    version: &str,
    drafts: HashMap<String, String>,
    keep: usize,
) -> Result<BackupInfo, String> {
    let (bytes, summary) =
        archive::build(root, version, &device_name(), SnapshotKind::Local, drafts)?;
    persist_backup(root, &bytes, summary, keep)
}

fn persist_backup(
    root: &Path,
    bytes: &[u8],
    summary: SnapshotSummary,
    keep: usize,
) -> Result<BackupInfo, String> {
    let id = Uuid::new_v4().to_string();
    let info = BackupInfo {
        id: id.clone(),
        name: "本地备份".into(),
        created_at: summary.created_at,
        size: bytes.len() as u64,
        summary,
    };
    let directory = root.join(BACKUP_DIR);
    atomic_write(&directory.join(format!("{id}.zip")), bytes)?;
    if let Err(error) = write_json(&directory.join(format!("{id}.json")), &info) {
        let _ = fs::remove_file(directory.join(format!("{id}.zip")));
        return Err(error);
    }
    // 新备份落盘后才清理历史，至少保留本次可恢复的副本。
    for old in list_backups_at(root)?.into_iter().skip(keep.max(1)) {
        if let Err(error) = delete_backup_at(root, &old.id) {
            log::warn!("新备份已保存，清理历史备份失败：{error}");
        }
    }
    Ok(info)
}

pub fn create_data_backup<R: Runtime>(
    app: &AppHandle<R>,
    drafts: HashMap<String, String>,
) -> Result<BackupInfo, String> {
    let keep = crate::preferences::load(app)?.backup_keep;
    let (root, captured) = with_data_write(app, false, || {
        let root = data_dir(app)?;
        let captured = archive::capture(
            &root,
            &app.package_info().version.to_string(),
            &device_name(),
            SnapshotKind::Local,
            drafts,
        )?;
        Ok((root, captured))
    })?;
    let (bytes, summary) = archive::encode(captured)?;
    with_data_write(app, false, || persist_backup(&root, &bytes, summary, keep))
}

pub fn rename_data_backup<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    name: &str,
) -> Result<(), String> {
    valid_backup_id(id)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("备份名称应为 1 至 80 个字符".into());
    }
    with_data_write(app, false, || {
        let root = data_dir(app)?;
        let mut info = list_backups_at(&root)?
            .into_iter()
            .find(|backup| backup.id == id)
            .ok_or("备份不存在")?;
        info.name = name.into();
        write_json(&root.join(BACKUP_DIR).join(format!("{id}.json")), &info)
    })
}

fn delete_backup_at(root: &Path, id: &str) -> Result<(), String> {
    valid_backup_id(id)?;
    for extension in ["zip", "json"] {
        let path = root.join(BACKUP_DIR).join(format!("{id}.{extension}"));
        if path.exists() {
            fs::remove_file(path).map_err(|error| format!("删除备份失败：{error}"))?;
        }
    }
    Ok(())
}

pub fn delete_data_backup<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), String> {
    with_data_write(app, false, || delete_backup_at(&data_dir(app)?, id))
}

pub fn export_data_backup<R: Runtime>(
    app: &AppHandle<R>,
    path: &Path,
    drafts: HashMap<String, String>,
) -> Result<(), String> {
    let captured = with_data_write(app, false, || {
        archive::capture(
            &data_dir(app)?,
            &app.package_info().version.to_string(),
            &device_name(),
            SnapshotKind::Local,
            drafts,
        )
    })?;
    let (bytes, _) = archive::encode(captured)?;
    atomic_write(path, &bytes)
}

pub fn build_cloud_snapshot_with_generation<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(Vec<u8>, SnapshotSummary, u64, String), String> {
    let (captured, generation) = with_data_write(app, false, || {
        let captured = archive::capture(
            &data_dir(app)?,
            &app.package_info().version.to_string(),
            &device_name(),
            SnapshotKind::Cloud,
            HashMap::new(),
        )?;
        Ok((captured, change_generation(app)))
    })?;
    let fingerprint = archive::content_fingerprint(&captured);
    let (bytes, summary) = archive::encode(captured)?;
    Ok((bytes, summary, generation, fingerprint))
}

fn stage_archive(
    root: &Path,
    archive: archive::ArchiveContents,
) -> Result<(PreparedRestore, Prepared), String> {
    let token = Uuid::new_v4().to_string();
    let stage = root.join(".data-staging").join(&token);
    let result = (|| {
        for directory in CONTENT_DIRS {
            fs::create_dir_all(stage.join("content").join(directory))
                .map_err(|error| format!("创建恢复暂存目录失败：{error}"))?;
        }
        for (relative, bytes) in archive.files {
            atomic_write(&stage.join("content").join(relative), &bytes)?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&stage);
        return Err(error);
    }
    let response = PreparedRestore {
        token,
        summary: archive.summary.clone(),
    };
    Ok((
        response,
        Prepared {
            root: root.into(),
            stage,
            drafts: archive.drafts,
        },
    ))
}

fn prepare_bytes<R: Runtime>(
    app: &AppHandle<R>,
    bytes: &[u8],
    cloud: bool,
) -> Result<PreparedRestore, String> {
    let archive = archive::read(bytes, cloud)?;
    with_data_write(app, false, || {
        let (response, prepared) = stage_archive(&data_dir(app)?, archive)?;
        let state = service(app)?;
        // 只保留一个待确认恢复，用户反复选文件不会无限占用磁盘。
        for (_, old) in state.prepared.lock().drain() {
            let _ = fs::remove_dir_all(old.stage);
        }
        state
            .prepared
            .lock()
            .insert(response.token.clone(), prepared);
        Ok(response)
    })
}

pub fn prepare_cloud_archive<R: Runtime>(
    app: &AppHandle<R>,
    bytes: Vec<u8>,
) -> Result<PreparedRestore, String> {
    prepare_bytes(app, &bytes, true)
}

pub fn prepare_data_restore<R: Runtime>(
    app: &AppHandle<R>,
    path: Option<PathBuf>,
    backup_id: Option<String>,
) -> Result<PreparedRestore, String> {
    let path = match (path, backup_id) {
        (Some(path), None) => path,
        (None, Some(id)) => {
            valid_backup_id(&id)?;
            data_dir(app)?.join(BACKUP_DIR).join(format!("{id}.zip"))
        }
        _ => return Err("请选择一个备份文件或本地备份".into()),
    };
    let meta = fs::metadata(&path).map_err(|error| format!("读取备份文件失败：{error}"))?;
    if meta.len() > archive::MAX_ARCHIVE_BYTES as u64 {
        return Err("备份文件超过允许的大小".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|error| format!("打开备份文件失败：{error}"))?
        .take(archive::MAX_ARCHIVE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("读取备份文件失败：{error}"))?;
    prepare_bytes(app, &bytes, false)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreTransaction {
    target: PathBuf,
    stage: PathBuf,
    rollback: PathBuf,
    directories: Vec<String>,
    previous: Vec<String>,
    pending_original: Option<Vec<u8>>,
    pointer_original: Option<Vec<u8>>,
    update_pointer: bool,
    committed: bool,
}

fn restore_optional_file(path: &Path, bytes: &Option<Vec<u8>>) -> Result<(), String> {
    match bytes {
        Some(bytes) => atomic_write(path, bytes),
        None if path.exists() => {
            fs::remove_file(path).map_err(|error| format!("回滚配置失败：{error}"))
        }
        None => Ok(()),
    }
}

fn recover_transaction(config: &Path) -> Result<(), String> {
    let journal = config.join(TRANSACTION_FILE);
    if !journal.exists() {
        return Ok(());
    }
    let transaction: RestoreTransaction = serde_json::from_slice(
        &fs::read(&journal).map_err(|error| format!("读取恢复事务失败：{error}"))?,
    )
    .map_err(|error| format!("恢复事务记录无效：{error}"))?;
    if !transaction.committed {
        for name in &transaction.directories {
            if !CONTENT_DIRS.contains(&name.as_str()) && name != BACKUP_DIR {
                return Err("恢复事务含有无效目录".into());
            }
            let current = transaction.target.join(name);
            let previous = transaction.rollback.join(name);
            if previous.exists() {
                if current.exists() {
                    fs::remove_dir_all(&current)
                        .map_err(|error| format!("清理未完成恢复失败：{error}"))?;
                }
                fs::rename(previous, current).map_err(|error| format!("回滚资料失败：{error}"))?;
            } else if !transaction.previous.contains(name) && current.exists() {
                fs::remove_dir_all(current)
                    .map_err(|error| format!("回滚新增目录失败：{error}"))?;
            }
        }
        restore_optional_file(
            &config.join(PENDING_DRAFTS_FILE),
            &transaction.pending_original,
        )?;
        if transaction.update_pointer {
            restore_optional_file(&config.join(POINTER_FILE), &transaction.pointer_original)?;
        }
    }
    if transaction.rollback.exists() {
        fs::remove_dir_all(&transaction.rollback)
            .map_err(|error| format!("清理恢复回滚目录失败：{error}"))?;
    }
    if transaction.stage.exists() {
        fs::remove_dir_all(&transaction.stage)
            .map_err(|error| format!("清理恢复暂存目录失败：{error}"))?;
    }
    fs::remove_file(journal).map_err(|error| format!("清理恢复事务失败：{error}"))
}

fn apply_transaction(
    config: &Path,
    target: &Path,
    stage: &Path,
    directories: Vec<String>,
    drafts: &HashMap<String, String>,
    pointer: Option<&Path>,
) -> Result<(), String> {
    archive::validate_template_drafts(drafts)?;
    let rollback = target
        .join(".data-staging")
        .join(format!("rollback-{}", Uuid::new_v4()));
    fs::create_dir_all(&rollback).map_err(|error| format!("创建回滚目录失败：{error}"))?;
    let mut transaction = RestoreTransaction {
        target: target.into(),
        stage: stage.into(),
        rollback,
        previous: directories
            .iter()
            .filter(|name| target.join(name).exists())
            .cloned()
            .collect(),
        directories,
        pending_original: read_optional(&config.join(PENDING_DRAFTS_FILE))?,
        pointer_original: read_optional(&config.join(POINTER_FILE))?,
        update_pointer: pointer.is_some(),
        committed: false,
    };
    write_json(&config.join(TRANSACTION_FILE), &transaction)?;
    let result = (|| {
        for name in &transaction.directories {
            let current = target.join(name);
            if current.exists() {
                fs::rename(&current, transaction.rollback.join(name))
                    .map_err(|error| format!("暂存原资料失败：{error}"))?;
            }
            fs::rename(stage.join("content").join(name), current)
                .map_err(|error| format!("恢复资料失败：{error}"))?;
        }
        write_json(&config.join(PENDING_DRAFTS_FILE), drafts)?;
        if let Some(path) = pointer {
            write_json(
                &config.join(POINTER_FILE),
                &DataPointer { path: path.into() },
            )?;
        }
        transaction.committed = true;
        write_json(&config.join(TRANSACTION_FILE), &transaction)
    })();
    if let Err(error) = result {
        if let Err(rollback) = recover_transaction(config) {
            return Err(format!(
                "{error}；自动回滚失败：{rollback}，请重启应用重试恢复"
            ));
        }
        return Err(error);
    }
    // 提交已持久化，清理失败交给下次启动继续；不能把成功提交误报为可重试的失败。
    if let Err(error) = recover_transaction(config) {
        log::warn!("资料已恢复，清理事务将在重启后继续：{error}");
    }
    Ok(())
}

fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("读取恢复前配置失败：{error}")),
    }
}

pub fn commit_data_restore<R: Runtime>(
    app: &AppHandle<R>,
    token: &str,
    drafts: HashMap<String, String>,
) -> Result<(), String> {
    archive::validate_template_drafts(&drafts)?;
    let keep = crate::preferences::load(app)?.backup_keep;
    with_data_write(app, false, || {
        let state = service(app)?;
        let prepared = state
            .prepared
            .lock()
            .remove(token)
            .ok_or("恢复预览已失效，请重新选择备份")?;
        let root = data_dir(app)?;
        if prepared.root != root {
            return Err("资料目录已变化，请重新选择备份".into());
        }
        // 原资料（包括未保存草稿）必须成功备份后才能覆盖。
        if let Err(error) =
            create_backup_at(&root, &app.package_info().version.to_string(), drafts, keep)
        {
            let _ = fs::remove_dir_all(&prepared.stage);
            return Err(format!("创建恢复前备份失败：{error}"));
        }
        let result = apply_transaction(
            &config_dir(app)?,
            &root,
            &prepared.stage,
            CONTENT_DIRS.iter().map(|name| name.to_string()).collect(),
            &prepared.drafts,
            None,
        );
        if result.is_ok() {
            state.frozen.store(true, Ordering::Release);
        }
        result
    })
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| format!("创建迁移目录失败：{error}"))?;
    if !source.exists() {
        return Ok(());
    }
    if fs::symlink_metadata(source)
        .map_err(|error| format!("读取迁移目录属性失败：{error}"))?
        .file_type()
        .is_symlink()
    {
        return Err("资料中含有软链接，不能迁移".into());
    }
    for entry in fs::read_dir(source).map_err(|error| format!("读取迁移资料失败：{error}"))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        if kind.is_symlink() {
            return Err("资料中含有软链接，不能迁移".into());
        }
        let target = destination.join(entry.file_name());
        if kind.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), &target)
                .map_err(|error| format!("复制迁移资料失败：{error}"))?;
            if !files_equal(&entry.path(), &target)? {
                return Err(format!(
                    "迁移副本校验失败：{}，原资料已保留",
                    entry.path().display()
                ));
            }
        }
    }
    Ok(())
}

/// 分块比较真实字节，不把长度相同误认为复制成功，也不整份载入大型备份。
fn files_equal(source: &Path, copied: &Path) -> Result<bool, String> {
    let mut source = File::open(source).map_err(|error| format!("读取原资料校验失败：{error}"))?;
    let mut copied =
        File::open(copied).map_err(|error| format!("读取迁移副本校验失败：{error}"))?;
    let mut left = [0u8; 64 * 1024];
    let mut right = [0u8; 64 * 1024];
    loop {
        let size = source
            .read(&mut left)
            .map_err(|error| format!("读取原资料校验失败：{error}"))?;
        if size == 0 {
            return copied
                .read(&mut right[..1])
                .map(|size| size == 0)
                .map_err(|error| format!("读取迁移副本校验失败：{error}"));
        }
        if let Err(error) = copied.read_exact(&mut right[..size]) {
            if error.kind() == std::io::ErrorKind::UnexpectedEof {
                return Ok(false);
            }
            return Err(format!("读取迁移副本校验失败：{error}"));
        }
        if left[..size] != right[..size] {
            return Ok(false);
        }
    }
}

fn directory_size(directory: &Path) -> Result<u64, String> {
    if !directory.exists() {
        return Ok(0);
    }
    if fs::symlink_metadata(directory)
        .map_err(|error| format!("读取迁移目录属性失败：{error}"))?
        .file_type()
        .is_symlink()
    {
        return Err("资料中含有软链接，不能迁移".into());
    }
    let mut total = 0u64;
    for entry in fs::read_dir(directory).map_err(|error| format!("计算迁移大小失败：{error}"))?
    {
        let entry = entry.map_err(|error| format!("读取迁移条目失败：{error}"))?;
        let kind = entry
            .file_type()
            .map_err(|error| format!("读取迁移属性失败：{error}"))?;
        if kind.is_symlink() {
            return Err("资料中含有软链接，不能迁移".into());
        }
        let size = if kind.is_dir() {
            directory_size(&entry.path())?
        } else {
            entry
                .metadata()
                .map_err(|error| format!("读取迁移文件大小失败：{error}"))?
                .len()
        };
        total = total.checked_add(size).ok_or("资料大小超出支持范围")?;
    }
    Ok(total)
}

fn require_space(available: u64, needed: u64, location: &Path) -> Result<(), String> {
    if available < needed {
        return Err(format!(
            "目录空间不足：{}，至少需要 {} MiB，可用 {} MiB。原资料保持不变。",
            location.display(),
            needed.saturating_add(1024 * 1024 - 1) / (1024 * 1024),
            available / (1024 * 1024)
        ));
    }
    Ok(())
}

pub fn migrate_data_directory<R: Runtime>(
    app: &AppHandle<R>,
    path: &Path,
    drafts: HashMap<String, String>,
    overwrite_default: bool,
) -> Result<(), String> {
    archive::validate_template_drafts(&drafts)?;
    if !path.is_absolute() {
        return Err("资料目录必须是绝对路径".into());
    }
    let keep = crate::preferences::load(app)?.backup_keep;
    with_data_write(app, false, || {
        let state = service(app)?;
        let source = fs::canonicalize(data_dir(app)?)
            .map_err(|error| format!("读取原资料路径失败：{error}"))?;
        fs::create_dir_all(path).map_err(|error| format!("创建目标资料目录失败：{error}"))?;
        let target =
            fs::canonicalize(path).map_err(|error| format!("读取目标资料路径失败：{error}"))?;
        if source == target {
            return Ok(());
        }
        if source.starts_with(&target) || target.starts_with(&source) {
            return Err("新旧资料目录不能互相包含".into());
        }
        let default = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        let default = fs::canonicalize(&default).unwrap_or(default);
        let directories: Vec<String> = CONTENT_DIRS
            .iter()
            .copied()
            .chain([BACKUP_DIR])
            .map(String::from)
            .collect();
        if directories.iter().any(|name| target.join(name).exists())
            && !(overwrite_default && target == default)
        {
            return Err("目标目录已有资料，请选择空目录；恢复默认目录需要确认覆盖".into());
        }
        let content_size = CONTENT_DIRS.iter().try_fold(0u64, |size, name| {
            directory_size(&source.join(name)).and_then(|length| {
                size.checked_add(length)
                    .ok_or_else(|| "资料大小超出支持范围".to_string())
            })
        })?;
        let draft_size = serde_json::to_vec(&drafts)
            .map_err(|error| error.to_string())?
            .len() as u64;
        let backup_reserve = content_size
            .saturating_add(draft_size)
            .saturating_add(1024 * 1024);
        const HEADROOM: u64 = 16 * 1024 * 1024;
        require_space(
            fs4::available_space(&source)
                .map_err(|error| format!("读取原资料目录可用空间失败：{error}"))?,
            backup_reserve.saturating_add(HEADROOM),
            &source,
        )?;
        create_backup_at(
            &source,
            &app.package_info().version.to_string(),
            drafts.clone(),
            keep,
        )?;
        // 创建迁移前备份后重新读取目标卷空间；同卷迁移也会计入新备份已占用的空间。
        let required = content_size
            .saturating_add(directory_size(&source.join(BACKUP_DIR))?)
            .saturating_add(HEADROOM);
        require_space(
            fs4::available_space(&target)
                .map_err(|error| format!("读取目标目录可用空间失败：{error}"))?,
            required,
            &target,
        )?;
        let stage = target
            .join(".data-staging")
            .join(format!("migration-{}", Uuid::new_v4()));
        let result = (|| {
            for name in &directories {
                copy_directory(&source.join(name), &stage.join("content").join(name))?;
            }
            apply_transaction(
                &config_dir(app)?,
                &target,
                &stage,
                directories,
                &drafts,
                Some(&target),
            )
        })();
        if result.is_ok() {
            *state.root.lock() = target;
            state.frozen.store(true, Ordering::Release);
        } else {
            let _ = fs::remove_dir_all(stage);
        }
        result
    })
}

pub fn clear_data_cache<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with_data_write(app, false, || {
        let previews = app
            .path()
            .app_cache_dir()
            .map_err(|error| error.to_string())?
            .join("online_midi_preview");
        if previews.exists() {
            fs::remove_dir_all(previews).map_err(|error| format!("清理试听缓存失败：{error}"))?;
        }
        Ok(())
    })
}

pub fn get_pending_template_drafts<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<HashMap<String, String>>, String> {
    let path = config_dir(app)?.join(PENDING_DRAFTS_FILE);
    let Some(bytes) = read_optional(&path)? else {
        return Ok(None);
    };
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("待恢复模板草稿超过允许的大小".into());
    }
    let drafts = serde_json::from_slice(&bytes)
        .map_err(|error| format!("读取待恢复模板草稿失败：{error}"))?;
    archive::validate_template_drafts(&drafts)?;
    Ok(Some(drafts))
}

pub fn acknowledge_template_drafts<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with_data_write(app, false, || {
        let path = config_dir(app)?.join(PENDING_DRAFTS_FILE);
        if path.exists() {
            fs::remove_file(path).map_err(|error| format!("确认模板草稿恢复失败：{error}"))?;
        }
        Ok(())
    })
}

fn request_scheduled_backup<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = service(app)?;
    if state.frozen.load(Ordering::Acquire) {
        return Ok(());
    }
    let interval = crate::preferences::load(app)?.backup_interval_hours as u64 * 60 * 60 * 1000;
    if interval == 0 {
        return Ok(());
    }
    let now = now_millis();
    let latest = list_data_backups(app)?
        .first()
        .map_or(0, |backup| backup.created_at);
    if now.saturating_sub(latest) < interval
        || now.saturating_sub(state.last_backup_request.load(Ordering::Acquire)) < 10 * 60 * 1000
    {
        return Ok(());
    }
    let marker = config_dir(app)?.join("data-backup-last-request.json");
    let previous = read_optional(&marker)?
        .and_then(|bytes| serde_json::from_slice::<u64>(&bytes).ok())
        .unwrap_or(0);
    if now.saturating_sub(previous) < 10 * 60 * 1000 {
        return Ok(());
    }
    state.last_backup_request.store(now, Ordering::Release);
    write_json(&marker, &now)?;
    app.emit_to("main", "data-backup-requested", ())
        .map_err(|error| format!("请求自动备份失败：{error}"))
}
