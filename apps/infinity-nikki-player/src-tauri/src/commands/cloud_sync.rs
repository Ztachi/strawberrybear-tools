//! 云同步命令仅暴露脱敏配置、快照摘要及可取消操作。

use crate::{
    cloud_sync::{self, CloudSyncConfig, CloudSyncStatus, SecretUpdate},
    data_management::{PreparedRestore, SnapshotSummary},
};

#[tauri::command]
pub fn get_cloud_sync_config(app: tauri::AppHandle) -> Result<CloudSyncConfig, String> {
    cloud_sync::get_config(&app)
}

#[tauri::command]
pub async fn save_cloud_sync_config(
    app: tauri::AppHandle,
    config: CloudSyncConfig,
    password: SecretUpdate,
    secret_key: SecretUpdate,
) -> Result<CloudSyncConfig, String> {
    cloud_sync::save_config(&app, config, password, secret_key).await
}

#[tauri::command]
pub async fn test_cloud_sync_connection(
    app: tauri::AppHandle,
    config: CloudSyncConfig,
    password: SecretUpdate,
    secret_key: SecretUpdate,
) -> Result<(), String> {
    cloud_sync::test_connection(&app, config, password, secret_key).await
}

#[tauri::command]
pub fn get_cloud_sync_status(app: tauri::AppHandle) -> Result<CloudSyncStatus, String> {
    cloud_sync::get_status(&app)
}

#[tauri::command]
pub async fn preview_cloud_snapshot(
    app: tauri::AppHandle,
) -> Result<Option<SnapshotSummary>, String> {
    cloud_sync::preview(&app).await
}

#[tauri::command]
pub async fn upload_cloud_snapshot(app: tauri::AppHandle) -> Result<(), String> {
    cloud_sync::upload(&app).await
}

#[tauri::command]
pub async fn prepare_cloud_restore(app: tauri::AppHandle) -> Result<PreparedRestore, String> {
    cloud_sync::prepare_restore(&app).await
}

#[tauri::command]
pub async fn cancel_cloud_sync(app: tauri::AppHandle) -> Result<(), String> {
    cloud_sync::cancel(&app).await
}
