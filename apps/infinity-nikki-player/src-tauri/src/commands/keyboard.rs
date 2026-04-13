use crate::types::KeyLogEntry;
use crate::{AppState, keyboard::KeySimulator};
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

/// 模拟按键按下
#[tauri::command]
pub fn simulate_key_down(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.press_key(&key);
    Ok(())
}

/// 模拟按键释放
#[tauri::command]
pub fn simulate_key_up(key: String) -> Result<(), String> {
    let simulator = KeySimulator::new()?;
    simulator.release_key(&key);
    Ok(())
}
