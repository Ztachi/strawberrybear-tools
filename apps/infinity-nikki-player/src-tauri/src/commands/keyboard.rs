use crate::types::KeyLogEntry;
use crate::AppState;
#[cfg(not(target_os = "windows"))]
use crate::keyboard::KeySimulator;
#[cfg(target_os = "windows")]
use crate::keyboard::{self, init_driver};
use tauri::State;

/// 获取按键日志
#[tauri::command]
pub fn get_key_logs(state: State<'_, AppState>) -> Vec<KeyLogEntry> {
    state.key_logs.lock().clone()
}

/// 清空按键日志
#[tauri::command]
pub fn clear_key_logs(state: State<'_, AppState>) {
    state.key_logs.lock().clear();
}

/// 模拟按键按下（Windows 使用 SendInput）
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn simulate_key_down(key: String) -> Result<(), String> {
    // 初始化（如果需要）
    let _ = init_driver();

    // 使用 SendInput 发送按键
    keyboard::win_input::send_key_down(&key)
}

/// 模拟按键释放（Windows 使用 SendInput）
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn simulate_key_up(key: String) -> Result<(), String> {
    let _ = init_driver();
    keyboard::win_input::send_key_up(&key)
}

/// 模拟按键按下（macOS/其他平台）
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn simulate_key_down(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.press_key(&key);
    Ok(())
}

/// 模拟按键释放（macOS/其他平台）
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn simulate_key_up(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.release_key(&key);
    Ok(())
}
