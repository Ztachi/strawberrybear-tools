//! 设置页面的资料命令；前端负责文件选择、未保存编辑保护和恢复后的重启。

use crate::data_management::{self, BackupInfo, DataLocations, PreparedRestore};
use std::collections::HashMap;
use std::path::Path;
use tauri::AppHandle;

#[tauri::command]
pub fn get_data_locations(app: AppHandle) -> Result<DataLocations, String> {
    data_management::get_data_locations(&app)
}
#[tauri::command]
pub fn open_data_location(app: AppHandle, kind: String) -> Result<(), String> {
    data_management::open_data_location(&app, &kind)
}
#[tauri::command]
pub fn list_data_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    data_management::list_data_backups(&app)
}
#[tauri::command]
pub async fn create_data_backup(
    app: AppHandle,
    drafts: HashMap<String, String>,
) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || data_management::create_data_backup(&app, drafts))
        .await
        .map_err(|error| format!("创建备份任务异常：{error}"))?
}
#[tauri::command]
pub fn rename_data_backup(app: AppHandle, id: String, name: String) -> Result<(), String> {
    data_management::rename_data_backup(&app, &id, &name)
}
#[tauri::command]
pub fn delete_data_backup(app: AppHandle, id: String) -> Result<(), String> {
    data_management::delete_data_backup(&app, &id)
}
#[tauri::command]
pub async fn export_data_backup(
    app: AppHandle,
    path: String,
    drafts: HashMap<String, String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        data_management::export_data_backup(&app, Path::new(&path), drafts)
    })
    .await
    .map_err(|error| format!("导出备份任务异常：{error}"))?
}
#[tauri::command]
pub async fn prepare_data_restore(
    app: AppHandle,
    path: Option<String>,
    backup_id: Option<String>,
) -> Result<PreparedRestore, String> {
    tauri::async_runtime::spawn_blocking(move || {
        data_management::prepare_data_restore(&app, path.map(Into::into), backup_id)
    })
    .await
    .map_err(|error| format!("读取备份任务异常：{error}"))?
}
#[tauri::command]
pub async fn commit_data_restore(
    app: AppHandle,
    token: String,
    drafts: HashMap<String, String>,
) -> Result<(), String> {
    let _cloud_lock = crate::cloud_sync::quiesce(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        data_management::commit_data_restore(&app, &token, drafts)
    })
    .await
    .map_err(|error| format!("恢复资料任务异常：{error}"))?
}
#[tauri::command]
pub async fn migrate_data_directory(
    app: AppHandle,
    path: String,
    drafts: HashMap<String, String>,
    overwrite_default: bool,
) -> Result<(), String> {
    let _cloud_lock = crate::cloud_sync::quiesce(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        data_management::migrate_data_directory(&app, Path::new(&path), drafts, overwrite_default)
    })
    .await
    .map_err(|error| format!("迁移资料任务异常：{error}"))?
}
#[tauri::command]
pub fn clear_data_cache(app: AppHandle) -> Result<(), String> {
    data_management::clear_data_cache(&app)
}
#[tauri::command]
pub fn get_pending_template_drafts(
    app: AppHandle,
) -> Result<Option<HashMap<String, String>>, String> {
    data_management::get_pending_template_drafts(&app)
}
#[tauri::command]
pub fn acknowledge_template_drafts(app: AppHandle) -> Result<(), String> {
    data_management::acknowledge_template_drafts(&app)
}

#[tauri::command]
pub fn data_operation_requires_restart(app: AppHandle) -> bool {
    data_management::data_operation_requires_restart(&app)
}
