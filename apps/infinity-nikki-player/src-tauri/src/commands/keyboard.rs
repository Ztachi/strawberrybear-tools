use crate::types::KeyLogEntry;
use crate::{AppState, keyboard::KeySimulator};
#[cfg(target_os = "windows")]
use crate::keyboard::{self, is_driver_initialized, init_driver};
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

/// 模拟按键按下（Windows 优先使用驱动级模拟）
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn simulate_key_down(key: String) -> Result<(), String> {
    // 优先尝试驱动级模拟
    if is_driver_initialized() {
        keyboard::driver::send_key_down(&key)?;
        return Ok(());
    }

    // 尝试初始化驱动
    if let Ok(()) = init_driver() {
        if is_driver_initialized() {
            keyboard::driver::send_key_down(&key)?;
            return Ok(());
        }
    }

    // 回退到 enigo
    let simulator = KeySimulator::new()?;
    simulator.press_key(&key);
    Ok(())
}

/// 模拟按键释放（Windows 优先使用驱动级模拟）
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn simulate_key_up(key: String) -> Result<(), String> {
    if is_driver_initialized() {
        keyboard::driver::send_key_up(&key)?;
        return Ok(());
    }

    if let Ok(()) = init_driver() {
        if is_driver_initialized() {
            keyboard::driver::send_key_up(&key)?;
            return Ok(());
        }
    }

    let simulator = KeySimulator::new()?;
    simulator.release_key(&key);
    Ok(())
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
