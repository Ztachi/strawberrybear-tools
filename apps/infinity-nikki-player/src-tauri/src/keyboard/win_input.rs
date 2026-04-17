//! Windows 键盘模拟模块 - 事件调度器版本
//!
//! 核心设计：把"事件"变成"状态曲线"
//! 按键按下后保持一段时间，确保游戏帧轮询能检测到

use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MapVirtualKeyW, MAP_VIRTUAL_KEY_TYPE,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VK_A, VK_B, VK_C, VK_D, VK_E, VK_F, VK_G, VK_H, VK_I, VK_J, VK_K, VK_L, VK_M,
    VK_N, VK_O, VK_P, VK_Q, VK_R, VK_S, VK_T, VK_U, VK_V, VK_W, VK_X, VK_Y, VK_Z,
    VK_0, VK_1, VK_2, VK_3, VK_4, VK_5, VK_6, VK_7, VK_8, VK_9,
    VIRTUAL_KEY,
};

/// 初始化
pub fn init() -> Result<(), String> {
    log::info!("Windows 键盘模拟初始化完成");
    Ok(())
}

/// 将虚拟键码转换为硬件扫描码
fn vk_to_scan_code(vk: VIRTUAL_KEY) -> u16 {
    unsafe {
        MapVirtualKeyW(vk.0 as u32, MAP_VIRTUAL_KEY_TYPE(0)) as u16
    }
}

/// 将字符转换为虚拟键码
fn char_to_vk(c: char) -> Option<VIRTUAL_KEY> {
    match c.to_ascii_uppercase() {
        'A' => Some(VK_A), 'B' => Some(VK_B), 'C' => Some(VK_C), 'D' => Some(VK_D),
        'E' => Some(VK_E), 'F' => Some(VK_F), 'G' => Some(VK_G), 'H' => Some(VK_H),
        'I' => Some(VK_I), 'J' => Some(VK_J), 'K' => Some(VK_K), 'L' => Some(VK_L),
        'M' => Some(VK_M), 'N' => Some(VK_N), 'O' => Some(VK_O), 'P' => Some(VK_P),
        'Q' => Some(VK_Q), 'R' => Some(VK_R), 'S' => Some(VK_S), 'T' => Some(VK_T),
        'U' => Some(VK_U), 'V' => Some(VK_V), 'W' => Some(VK_W), 'X' => Some(VK_X),
        'Y' => Some(VK_Y), 'Z' => Some(VK_Z),
        '0' => Some(VK_0), '1' => Some(VK_1), '2' => Some(VK_2), '3' => Some(VK_3),
        '4' => Some(VK_4), '5' => Some(VK_5), '6' => Some(VK_6), '7' => Some(VK_7),
        '8' => Some(VK_8), '9' => Some(VK_9),
        _ => None,
    }
}

/// 发送单个按键事件（按下或释放）
unsafe fn send_key_event(_vk: VIRTUAL_KEY, scan_code: u16, is_release: bool) -> Result<(), String> {
    let flags = if is_release {
        KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP
    } else {
        KEYEVENTF_SCANCODE
    };

    let kb_input = KEYBDINPUT {
        wVk: VIRTUAL_KEY(0), // 扫描码模式下 wVk 必须为 0
        wScan: scan_code,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
    };

    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: kb_input },
    };

    let result = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    if result != 1 {
        return Err(format!("SendInput 失败，返回值: {}", result));
    }
    Ok(())
}

/// 发送按键按下（仅按下，不释放——由 simulate_key_up 负责释放）
pub fn send_key_down(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Ok(());
    }
    let c = key.chars().next().unwrap();
    let vk = char_to_vk(c).ok_or_else(|| format!("不支持的按键: {}", c))?;
    let scan_code = vk_to_scan_code(vk);
    unsafe {
        send_key_event(vk, scan_code, false)
    }
}

/// 发送按键释放
pub fn send_key_up(key: &str) -> Result<(), String> {
    // 释放时不需要保持，直接发送
    if key.is_empty() {
        return Ok(());
    }

    let c = key.chars().next().unwrap();
    let vk = char_to_vk(c).ok_or_else(|| format!("不支持的按键: {}", c))?;
    let scan_code = vk_to_scan_code(vk);

    unsafe {
        send_key_event(vk, scan_code, true)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vk_to_scan() {
        let vk_a = VK_A;
        let scan = vk_to_scan_code(vk_a);
        assert!(scan > 0, "A的扫描码应该 > 0");
        println!("VK_A scan code: {}", scan);
    }
}
