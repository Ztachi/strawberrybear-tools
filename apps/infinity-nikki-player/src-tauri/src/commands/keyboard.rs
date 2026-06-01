//! @fileOverview 键盘模拟命令模块
//!
//! 提供按键日志查询和键盘模拟功能

use crate::keyboard::KeySimulator;
use crate::types::KeyLogEntry;
use crate::AppState;
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
/// - macOS: 使用物理键码事件
/// - Linux: 使用 Enigo 字符输入回退
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 模拟失败时返回错误
#[tauri::command]
pub fn simulate_key_down(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.press_key(&key)
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
#[tauri::command]
pub fn simulate_key_up(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.release_key(&key)
}
