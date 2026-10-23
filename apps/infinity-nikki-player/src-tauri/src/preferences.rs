//! 本机偏好独立于用户作品保存；日志和自动检查通过既有运行时入口读取。
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    sync::atomic::{AtomicBool, AtomicU8, Ordering},
};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;

static AUTO_CHECK: AtomicBool = AtomicBool::new(true);
static LOG_LEVEL: AtomicU8 = AtomicU8::new(3);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct AppPreferences {
    pub backup_interval_hours: u32,
    pub backup_keep: usize,
    pub logs_enabled: bool,
    pub log_level: String,
    pub auto_check_updates: bool,
    pub launch_on_startup: bool,
    pub silent_startup: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            backup_interval_hours: 24,
            backup_keep: 10,
            logs_enabled: true,
            log_level: "info".into(),
            auto_check_updates: true,
            launch_on_startup: false,
            silent_startup: false,
        }
    }
}

struct PreferencesWrite(Mutex<()>);

fn level_number(level: &str) -> Result<u8, String> {
    match level {
        "error" => Ok(1),
        "warn" => Ok(2),
        "info" => Ok(3),
        "debug" => Ok(4),
        "trace" => Ok(5),
        _ => Err("日志级别无效".into()),
    }
}

fn validate(preferences: &AppPreferences) -> Result<(), String> {
    if ![0, 6, 12, 24, 48, 168].contains(&preferences.backup_interval_hours) {
        return Err("备份间隔无效".into());
    }
    if ![3, 5, 10, 15, 20, 30, 50].contains(&preferences.backup_keep) {
        return Err("备份保留数量无效".into());
    }
    level_number(&preferences.log_level)?;
    Ok(())
}

/// 固定本机位置不随资料迁移，旧版本没有此文件时采用兼容默认值。
pub fn load<R: Runtime>(app: &AppHandle<R>) -> Result<AppPreferences, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("preferences.json");
    let preferences = match fs::read(&path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|e| format!("读取本机偏好失败：{e}"))?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppPreferences::default(),
        Err(error) => return Err(format!("读取本机偏好失败：{error}")),
    };
    validate(&preferences)?;
    Ok(preferences)
}

fn apply(preferences: &AppPreferences) {
    AUTO_CHECK.store(preferences.auto_check_updates, Ordering::Release);
    LOG_LEVEL.store(
        if preferences.logs_enabled {
            level_number(&preferences.log_level).unwrap_or(3)
        } else {
            0
        },
        Ordering::Release,
    );
}

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    app.manage(PreferencesWrite(Mutex::new(())));
    apply(&load(app)?);
    Ok(())
}

pub fn auto_check_enabled() -> bool {
    AUTO_CHECK.load(Ordering::Acquire)
}

/// 插件统一使用这一过滤器，修改偏好无需另建日志实例。
pub fn log_enabled(level: log::Level) -> bool {
    level as u8 <= LOG_LEVEL.load(Ordering::Acquire)
}

#[tauri::command]
pub fn get_data_preferences(app: AppHandle) -> Result<AppPreferences, String> {
    let mut preferences = load(&app)?;
    // 操作系统可能在应用外禁用了启动项，以系统真实状态为准。
    preferences.launch_on_startup = app
        .autolaunch()
        .is_enabled()
        .map_err(|e| format!("读取开机启动状态失败：{e}"))?;
    Ok(preferences)
}

#[tauri::command]
pub fn save_data_preferences(app: AppHandle, preferences: AppPreferences) -> Result<(), String> {
    validate(&preferences)?;
    let state = app.state::<PreferencesWrite>();
    let _lock = state.0.lock();
    let manager = app.autolaunch();
    let prior_startup = manager
        .is_enabled()
        .map_err(|e| format!("读取开机启动状态失败：{e}"))?;
    if prior_startup != preferences.launch_on_startup {
        let result = if preferences.launch_on_startup {
            manager.enable()
        } else {
            manager.disable()
        };
        result.map_err(|e| format!("更新开机启动失败：{e}"))?;
    }
    let result = (|| {
        let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let temp = directory.join(format!("preferences-{}.tmp", uuid::Uuid::new_v4()));
        fs::write(
            &temp,
            serde_json::to_vec_pretty(&preferences).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if let Err(error) = fs::rename(&temp, directory.join("preferences.json")) {
            let _ = fs::remove_file(&temp);
            return Err(format!("保存本机偏好失败：{error}"));
        }
        Ok(())
    })();
    if result.is_err() && prior_startup != preferences.launch_on_startup {
        let rollback = if prior_startup {
            manager.enable()
        } else {
            manager.disable()
        };
        if let Err(error) = rollback {
            return Err(format!("保存偏好失败，启动项回滚失败：{error}"));
        }
    }
    result?;
    apply(&preferences);
    Ok(())
}

#[tauri::command]
pub fn should_show_main_window(app: AppHandle) -> bool {
    let startup = std::env::args().any(|argument| argument == "--autostart");
    // 托盘不可用时必须展示窗口，避免静默启动后失去操作入口。
    let has_tray = app.tray_by_id("nikki-main-tray").is_some();
    main_window_visible(
        startup,
        has_tray,
        load(&app).is_ok_and(|preferences| preferences.silent_startup),
    )
}

fn main_window_visible(startup: bool, has_tray: bool, silent: bool) -> bool {
    !(startup && has_tray && silent)
}

#[tauri::command]
pub fn restart_after_data_change(app: AppHandle) {
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silent_startup_only_hides_autostart_with_a_working_tray() {
        assert!(!main_window_visible(true, true, true));
        assert!(main_window_visible(false, true, true));
        assert!(main_window_visible(true, false, true));
        assert!(main_window_visible(true, true, false));
    }
    #[test]
    fn old_preferences_keep_existing_update_and_log_defaults() {
        let preferences: AppPreferences = serde_json::from_str("{}").unwrap();
        assert_eq!(preferences, AppPreferences::default());
        assert!(preferences.auto_check_updates);
        assert!(!preferences.launch_on_startup);
    }
    #[test]
    fn unsupported_backup_and_log_values_are_rejected() {
        let mut preferences = AppPreferences::default();
        preferences.backup_keep = 0;
        assert!(validate(&preferences).is_err());
        preferences = AppPreferences::default();
        preferences.log_level = "unknown".into();
        assert!(validate(&preferences).is_err());
    }
}
