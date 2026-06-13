//! @fileOverview 应用设置命令模块
//!
//! 提供设置的加载和保存功能

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// 全局设置数据结构
///
/// 注意：模板列表已从设置中移除，改为从 templates/ 目录独立加载
///
/// # Fields
///
/// * `locale` - 当前语言
/// * `current_template_id` - 当前模板 ID
/// * `play_mode` - 演奏模式："auto" | "piano"
/// * `enable_keyboard_sim` - 是否启用键盘模拟（仅在 piano 模式下生效）
/// * `auto_fps_enabled` - 是否启用自动 FPS 获取
/// * `manual_fps` - 手动 FPS，自动获取不可用时作为兜底
/// * `last_detected_fps` - 最近一次自动检测 FPS，仅用于展示回填
/// * `playlist_playback_mode` - 播放列表调度模式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// 当前语言
    pub locale: String,
    /// 当前模板 ID
    pub current_template_id: Option<String>,
    /// 演奏模式："auto" | "piano"
    #[serde(default = "default_play_mode")]
    pub play_mode: String,
    /// 是否启用键盘模拟（仅在模板演奏模式下生效）
    #[serde(default)]
    pub enable_keyboard_sim: bool,
    /// 是否启用自动 FPS 获取
    #[serde(default = "default_auto_fps_enabled")]
    pub auto_fps_enabled: bool,
    /// 手动 FPS，自动获取不可用或用户关闭自动获取时生效
    #[serde(default = "default_manual_fps")]
    pub manual_fps: u32,
    /// 最近一次自动检测到的 FPS，仅用于 UI 展示，不作为强依赖
    #[serde(default)]
    pub last_detected_fps: Option<u32>,
    /// 播放列表调度模式："sequential" | "shuffle" | "repeat-one" | "repeat-all"
    #[serde(default = "default_playlist_playback_mode")]
    pub playlist_playback_mode: String,
}

/// 默认演奏模式
fn default_play_mode() -> String {
    "auto".to_string()
}

/// 默认开启自动 FPS 获取；不支持的平台会在前端回落到手动 FPS。
fn default_auto_fps_enabled() -> bool {
    true
}

/// 默认手动 FPS，覆盖 60fps 常见场景。
fn default_manual_fps() -> u32 {
    60
}

/// 默认播放列表调度模式：顺序播放一轮。
fn default_playlist_playback_mode() -> String {
    "sequential".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            locale: "en-US".to_string(),
            current_template_id: None,
            play_mode: "auto".to_string(),
            enable_keyboard_sim: false,
            auto_fps_enabled: true,
            manual_fps: default_manual_fps(),
            last_detected_fps: None,
            playlist_playback_mode: default_playlist_playback_mode(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_settings_json_uses_fps_defaults() {
        let settings: AppSettings = serde_json::from_str(
            r#"{
                "locale": "zh-CN",
                "current_template_id": null,
                "play_mode": "piano",
                "enable_keyboard_sim": true
            }"#,
        )
        .expect("settings");

        assert!(settings.auto_fps_enabled);
        assert_eq!(settings.manual_fps, 60);
        assert_eq!(settings.last_detected_fps, None);
        assert_eq!(settings.playlist_playback_mode, "sequential");
    }
}

/// 获取设置文件路径
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 设置文件路径
fn get_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    // 确保目录存在
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(data_dir.join("settings.json"))
}

/// 加载设置
///
/// 从应用数据目录读取 settings.json
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 设置对象，文件不存在返回默认值
///
/// # Notes
///
/// 模板列表不再从设置中加载，而是独立从 templates/ 目录读取
#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_path(&app)?;
    log::info!("Loading settings from: {:?}", path);

    if !path.exists() {
        log::info!("Settings file not found, using defaults");
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    log::info!("Settings loaded successfully");
    Ok(settings)
}

/// 保存设置
///
/// 将设置写入应用数据目录的 settings.json
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `settings` - 要保存的设置对象
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Notes
///
/// 模板列表不保存在设置中，而是独立存储在 templates/ 目录
#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = get_settings_path(&app)?;
    log::info!("Saving settings to: {:?}", path);

    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    log::info!("Settings saved successfully");
    Ok(())
}
