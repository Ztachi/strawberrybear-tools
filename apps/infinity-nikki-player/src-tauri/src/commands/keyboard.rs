//! @fileOverview 键盘模拟命令模块
//!
//! 提供按键日志查询和键盘模拟功能

use crate::types::KeyLogEntry;
use crate::AppState;
#[cfg(not(target_os = "windows"))]
use crate::keyboard::KeySimulator;
#[cfg(target_os = "windows")]
use crate::keyboard::{self, init_driver};
use tauri::State;

/// 获取按键日志
///
/// 从全局状态中获取所有记录的按键事件
///
/// # Arguments
///
/// * `state` - 应用状态
///
/// # Returns
///
/// 按键日志列表
///
/// # Notes
///
/// 日志最多保留 50 条，超过会自动清理最早的条目
#[tauri::command]
pub fn get_key_logs(state: State<'_, AppState>) -> Vec<KeyLogEntry> {
    state.key_logs.lock().clone()
}

/// 清空按键日志
///
/// # Arguments
///
/// * `state` - 应用状态
#[tauri::command]
pub fn clear_key_logs(state: State<'_, AppState>) {
    state.key_logs.lock().clear();
}

/// 模拟按键按下
///
/// 使用平台特定的方式发送按键按下事件
///
/// # Arguments
///
/// * `key` - 按键标识符（如 "A", "Space" 等）
///
/// # Platform
///
/// - Windows: 使用 SendInput API
/// - macOS/Linux: 使用 Enigo 库
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 模拟失败时返回错误
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn simulate_key_down(key: String) -> Result<(), String> {
    // 初始化驱动（如果需要）
    let _ = init_driver();

    // 使用 Windows SendInput 发送按键
    keyboard::win_input::send_key_down(&key)
}

/// 模拟按键释放
///
/// # Arguments
///
/// * `key` - 按键标识符
///
/// # See
///
/// [simulate_key_down]
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn simulate_key_up(key: String) -> Result<(), String> {
    let _ = init_driver();
    keyboard::win_input::send_key_up(&key)
}

/// 模拟按键按下（macOS/Linux）
///
/// # Arguments
///
/// * `key` - 按键标识符
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 创建模拟器或发送按键失败时返回错误
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn simulate_key_down(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.press_key(&key);
    Ok(())
}

/// 模拟按键释放（macOS/Linux）
///
/// # Arguments
///
/// * `key` - 按键标识符
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 创建模拟器或发送按键失败时返回错误
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn simulate_key_up(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.release_key(&key);
    Ok(())
}
