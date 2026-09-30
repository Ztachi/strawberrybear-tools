//! 自动更新 IPC 入口，不允许前端指定任意安装包地址或公钥。

use crate::updater::{
    self,
    policy::{Source, UpdateError},
    CheckReason, Snapshot,
};
use std::io::Write;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// 读取当前更新状态。
#[tauri::command]
pub fn get_update_state(app: AppHandle) -> Snapshot {
    updater::snapshot(&app)
}

/// 手动或恢复网络时检查；自动周期由原生层统一管理。
#[tauri::command]
pub async fn check_app_update(app: AppHandle, reason: CheckReason) -> Snapshot {
    updater::check(app, reason).await
}

/// 下载并验证当前目标版本，不在下载回调中启动安装。
#[tauri::command]
pub async fn download_app_update(app: AppHandle) -> Snapshot {
    updater::download(app).await
}

/// 取消当前下载并保留可更新版本。
#[tauri::command]
pub fn cancel_app_update(app: AppHandle) -> Snapshot {
    updater::cancel(&app)
}

/// 编辑保护通过后由界面显式调用安装。
#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<Snapshot, UpdateError> {
    // 前端停止试听后，必须等原生演奏真正结束，不能在按键尚未释放时退出。
    if updater::snapshot(&app).phase != updater::Phase::Ready {
        return Ok(updater::snapshot(&app));
    }
    let player = app.state::<crate::commands::player::PlayerControl>();
    *player.should_stop.lock() = true;
    *player.is_paused.lock() = false;
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while *player.is_playing.lock() {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .map_err(|_| {
        UpdateError::new(
            "install",
            "operationFailed",
            "演奏尚未停止，已保留更新包，请停止演奏后重试",
            None,
        )
    })?;
    updater::install(app).await
}

/// 使用系统浏览器下载同一版本资产；macOS 压缩包解压后可手动移动应用。
#[tauri::command]
pub fn open_manual_update_download(app: AppHandle, source: Source) -> Result<(), UpdateError> {
    use tauri_plugin_shell::ShellExt;
    let url = updater::manual_download_url(&app, source)?;
    #[allow(deprecated)]
    app.shell().open(url, None).map_err(|e| {
        UpdateError::new(
            "manual",
            "operationFailed",
            format!("打开下载地址失败：{e}"),
            Some(source),
        )
    })
}

/// 用户主动选择导出位置后打包状态及轮转日志，不上传任何内容。
#[tauri::command]
pub async fn export_update_diagnostics(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        log::logger().flush();
        let Some(destination) = app
            .dialog()
            .file()
            .set_file_name("infinity-nikki-update-diagnostics.zip")
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = destination
            .into_path()
            .map_err(|e| format!("诊断文件路径无效：{e}"))?;
        let file = std::fs::File::create(&path).map_err(|e| format!("创建诊断文件失败：{e}"))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        let state = serde_json::json!({
            "state": updater::snapshot(&app),
            "executablePath": std::env::current_exe().ok(),
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        });
        zip.start_file("update-state.json", options)
            .map_err(|e| format!("创建诊断状态条目失败：{e}"))?;
        let contents =
            serde_json::to_vec_pretty(&state).map_err(|e| format!("序列化诊断状态失败：{e}"))?;
        zip.write_all(&contents)
            .map_err(|e| format!("写入诊断状态失败：{e}"))?;
        if let Ok(directory) = app.path().app_log_dir() {
            if let Ok(entries) = std::fs::read_dir(directory) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if name.starts_with("updater") && entry.file_type().is_ok_and(|t| t.is_file()) {
                        zip.start_file(format!("logs/{name}"), options)
                            .map_err(|e| format!("创建日志条目失败：{e}"))?;
                        let mut file = std::fs::File::open(entry.path())
                            .map_err(|e| format!("读取日志文件失败：{e}"))?;
                        std::io::copy(&mut file, &mut zip)
                            .map_err(|e| format!("写入诊断日志失败：{e}"))?;
                    }
                }
            }
        }
        zip.finish()
            .map_err(|e| format!("保存诊断压缩包失败：{e}"))?;
        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(|e| format!("导出更新诊断失败：{e}"))?
}
