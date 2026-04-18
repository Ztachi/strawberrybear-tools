//! @fileOverview 命令模块
//!
//! 聚合所有 Tauri 命令，包含系统信息获取、权限检查、外部链接等功能

pub mod keyboard;
pub mod midi;
pub mod player;
pub mod settings;
pub mod templates;
pub mod window;

use std::process::Command;

/// 获取应用版本号
///
/// # Returns
///
/// 当前应用版本字符串（如 "1.0.0"）
///
/// # Notes
///
/// 版本号从 Cargo.toml 的 package.version 字段读取
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 获取系统语言/区域设置
///
/// 读取 macOS 系统偏好语言设置
///
/// # Returns
///
/// 语言代码字符串（"zh-CN" | "en-US" 等）
///
/// # Platform
///
/// 仅 macOS，其他平台回退到 "en-US"
///
/// # Notes
///
/// - 优先使用 AppleLanguages 列表中的第一个（最高优先级）
/// - 解析格式：`(\n    "en-CN",\n    "zh-Hans-CN"\n)`
#[tauri::command]
pub fn get_system_locale() -> String {
    if let Ok(output) = Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // AppleLanguages 返回格式: (\n    "en-CN",\n    "zh-Hans-CN"\n)
        // 提取第一个语言代码
        if let Some(start) = stdout.find('"') {
            if let Some(end) = stdout[start + 1..].find('"') {
                let lang = &stdout[start + 1..start + 1 + end];
                let lang = lang.trim();
                log::info!("First AppleLanguage: {}", lang);
                if lang.starts_with("zh-Hans") || lang.starts_with("zh-CN") {
                    return "zh-CN".to_string();
                }
                if lang.starts_with("zh-Hant") || lang.starts_with("zh-TW") {
                    return "zh-TW".to_string();
                }
                if lang.starts_with("en") {
                    return "en-US".to_string();
                }
            }
        }
    }
    "en-US".to_string()
}

/// 检查辅助功能权限是否授权
///
/// # Returns
///
/// 是否已获得辅助功能权限
///
/// # Platform
///
/// 仅 macOS，其他平台始终返回 true
///
/// # Notes
///
/// 开发模式下跳过权限检查，始终返回 true
#[tauri::command]
pub fn check_accessibility() -> bool {
    check_accessibility_impl()
}

/// 打开辅助功能权限设置页面
///
/// 打开系统偏好设置中的辅助功能权限页面
///
/// # Returns
///
/// 成功返回 Ok(())，打开失败返回错误
///
/// # Platform
///
/// 仅 macOS，其他平台直接返回 Ok
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

/// 打开外部链接
///
/// 使用系统默认浏览器打开指定 URL
///
/// # Arguments
///
/// * `url` - 要打开的网址
///
/// # Returns
///
/// 成功返回 Ok(())，打开失败返回错误
///
/// # Platform
///
/// - macOS: 使用 `open` 命令
/// - Windows: 使用 `cmd /C start`
/// - Linux: 使用 `xdg-open`
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", "", &url]).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 检查辅助功能权限实现（macOS 开发模式）
///
/// 开发阶段跳过权限检查，始终返回 true
#[cfg(target_os = "macos")]
#[cfg(debug_assertions)]
fn check_accessibility_impl() -> bool {
    true
}

/// 检查辅助功能权限实现（macOS 发布模式）
///
/// 使用 osascript 执行 AppleScript 查询 UI Elements 是否启用
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

/// 检查辅助功能权限实现（非 macOS 平台）
///
/// 其他平台始终返回 true
#[cfg(not(target_os = "macos"))]
fn check_accessibility_impl() -> bool {
    true
}
