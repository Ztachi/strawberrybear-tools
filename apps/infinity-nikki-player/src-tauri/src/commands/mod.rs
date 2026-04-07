pub mod keyboard;
pub mod midi;
pub mod player;
pub mod templates;
pub mod window;

use std::process::Command;

/// 获取应用版本
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 检查辅助功能权限
#[tauri::command]
pub fn check_accessibility() -> bool {
    check_accessibility_impl()
}

/// 打开辅助功能权限设置页面
#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
#[cfg(debug_assertions)]
fn check_accessibility_impl() -> bool {
    // 开发阶段跳过权限检查
    true
}

#[cfg(target_os = "macos")]
#[cfg(not(debug_assertions))]
fn check_accessibility_impl() -> bool {
    let output = Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to return UI elements enabled",
        ])
        .output();

    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_lowercase() == "true",
        Err(_) => false,
    }
}

#[cfg(not(target_os = "macos"))]
fn check_accessibility_impl() -> bool {
    true
}
