//! Windows 键盘模拟模块
//!
//! 使用 Windows SendInput API 进行键盘模拟
//! 核心设计：使用扫描码模式，确保跨键盘布局兼容

use windows::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    KEYEVENTF_SCANCODE, MAP_VIRTUAL_KEY_TYPE,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VIRTUAL_KEY, VK_0, VK_1, VK_2, VK_3, VK_4, VK_5, VK_6, VK_7, VK_8, VK_9, VK_A, VK_B, VK_C,
    VK_D, VK_E, VK_F, VK_F1, VK_F10, VK_F11, VK_F12, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7,
    VK_F8, VK_F9, VK_G, VK_H, VK_I, VK_J, VK_K, VK_L, VK_M, VK_N, VK_O, VK_P, VK_Q, VK_R, VK_S,
    VK_T, VK_U, VK_V, VK_W, VK_X, VK_Y, VK_Z,
};

/// 初始化键盘模拟模块
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Notes
///
/// Windows 平台无需特殊初始化，此处仅记录日志
pub fn init() -> Result<(), String> {
    log::info!("Windows 键盘模拟初始化完成");
    Ok(())
}

/// 将虚拟键码转换为硬件扫描码
///
/// 使用 MapVirtualKeyW 进行转换
///
/// # Arguments
///
/// * `vk` - 虚拟键码
///
/// # Returns
///
/// 对应的扫描码
fn vk_to_scan_code(vk: VIRTUAL_KEY) -> u16 {
    unsafe { MapVirtualKeyW(vk.0 as u32, MAP_VIRTUAL_KEY_TYPE(0)) as u16 }
}

/// 将按键标识符转换为虚拟键码
///
/// # Arguments
///
/// * `key` - 模板中的按键标识符
///
/// # Returns
///
/// 对应的虚拟键码，不支持返回 None
///
/// # Notes
///
/// 目前支持 A-Z、0-9、F1-F12、常用标点和非系统控制键
fn key_to_vk(key: &str) -> Option<VIRTUAL_KEY> {
    let normalized = key.trim().to_ascii_uppercase();
    match normalized.as_str() {
        "A" => Some(VK_A),
        "B" => Some(VK_B),
        "C" => Some(VK_C),
        "D" => Some(VK_D),
        "E" => Some(VK_E),
        "F" => Some(VK_F),
        "G" => Some(VK_G),
        "H" => Some(VK_H),
        "I" => Some(VK_I),
        "J" => Some(VK_J),
        "K" => Some(VK_K),
        "L" => Some(VK_L),
        "M" => Some(VK_M),
        "N" => Some(VK_N),
        "O" => Some(VK_O),
        "P" => Some(VK_P),
        "Q" => Some(VK_Q),
        "R" => Some(VK_R),
        "S" => Some(VK_S),
        "T" => Some(VK_T),
        "U" => Some(VK_U),
        "V" => Some(VK_V),
        "W" => Some(VK_W),
        "X" => Some(VK_X),
        "Y" => Some(VK_Y),
        "Z" => Some(VK_Z),
        "0" => Some(VK_0),
        "1" => Some(VK_1),
        "2" => Some(VK_2),
        "3" => Some(VK_3),
        "4" => Some(VK_4),
        "5" => Some(VK_5),
        "6" => Some(VK_6),
        "7" => Some(VK_7),
        "8" => Some(VK_8),
        "9" => Some(VK_9),
        "F1" => Some(VK_F1),
        "F2" => Some(VK_F2),
        "F3" => Some(VK_F3),
        "F4" => Some(VK_F4),
        "F5" => Some(VK_F5),
        "F6" => Some(VK_F6),
        "F7" => Some(VK_F7),
        "F8" => Some(VK_F8),
        "F9" => Some(VK_F9),
        "F10" => Some(VK_F10),
        "F11" => Some(VK_F11),
        "F12" => Some(VK_F12),
        "`" => Some(VIRTUAL_KEY(0xC0)),
        "-" => Some(VIRTUAL_KEY(0xBD)),
        "=" => Some(VIRTUAL_KEY(0xBB)),
        "[" => Some(VIRTUAL_KEY(0xDB)),
        "]" => Some(VIRTUAL_KEY(0xDD)),
        "\\" => Some(VIRTUAL_KEY(0xDC)),
        ";" => Some(VIRTUAL_KEY(0xBA)),
        "'" => Some(VIRTUAL_KEY(0xDE)),
        "," => Some(VIRTUAL_KEY(0xBC)),
        "." => Some(VIRTUAL_KEY(0xBE)),
        "/" => Some(VIRTUAL_KEY(0xBF)),
        "SPACE" => Some(VIRTUAL_KEY(0x20)),
        "TAB" => Some(VIRTUAL_KEY(0x09)),
        "ENTER" => Some(VIRTUAL_KEY(0x0D)),
        "BACKSPACE" => Some(VIRTUAL_KEY(0x08)),
        "DELETE" => Some(VIRTUAL_KEY(0x2E)),
        "ARROWLEFT" => Some(VIRTUAL_KEY(0x25)),
        "ARROWUP" => Some(VIRTUAL_KEY(0x26)),
        "ARROWRIGHT" => Some(VIRTUAL_KEY(0x27)),
        "ARROWDOWN" => Some(VIRTUAL_KEY(0x28)),
        _ => None,
    }
}

/// 发送单个按键事件
///
/// # Arguments
///
/// * `_vk` - 虚拟键码（扫描码模式下设为 0）
/// * `scan_code` - 硬件扫描码
/// * `is_release` - 是否为释放事件
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Notes
///
/// 使用 KEYEVENTF_SCANCODE 标志发送扫描码而非虚拟键码
/// 这样可以确保在不同键盘布局下行为一致
unsafe fn send_key_event(_vk: VIRTUAL_KEY, scan_code: u16, is_release: bool) -> Result<(), String> {
    // 确定标志位
    let flags = if is_release {
        KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP
    } else {
        KEYEVENTF_SCANCODE
    };

    // 构建键盘输入结构
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

    // 发送输入
    let result = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    if result != 1 {
        return Err(format!("SendInput 失败，返回值: {}", result));
    }
    Ok(())
}

/// 发送按键按下事件
///
/// # Arguments
///
/// * `key` - 按键字符
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 不支持的按键返回错误
pub fn send_key_down(key: &str) -> Result<(), String> {
    let vk = key_to_vk(key).ok_or_else(|| {
        if key.trim().is_empty() {
            "按键不能为空".to_string()
        } else {
            format!("不支持的 Windows 按键: {}", key)
        }
    })?;
    let scan_code = vk_to_scan_code(vk);
    unsafe { send_key_event(vk, scan_code, false) }
}

/// 发送按键释放事件
///
/// # Arguments
///
/// * `key` - 按键字符
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 不支持的按键返回错误
pub fn send_key_up(key: &str) -> Result<(), String> {
    let vk = key_to_vk(key).ok_or_else(|| {
        if key.trim().is_empty() {
            "按键不能为空".to_string()
        } else {
            format!("不支持的 Windows 按键: {}", key)
        }
    })?;
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

    #[test]
    fn test_key_to_vk_letters_and_numbers() {
        assert_eq!(key_to_vk("A"), Some(VK_A));
        assert_eq!(key_to_vk("q"), Some(VK_Q));
        assert_eq!(key_to_vk("1"), Some(VK_1));
        assert_eq!(key_to_vk("0"), Some(VK_0));
    }

    #[test]
    fn test_key_to_vk_function_keys() {
        assert_eq!(key_to_vk("F1"), Some(VK_F1));
        assert_eq!(key_to_vk("F12"), Some(VK_F12));
    }

    #[test]
    fn test_key_to_vk_extended_keys() {
        assert_eq!(key_to_vk("Space"), Some(VIRTUAL_KEY(0x20)));
        assert_eq!(key_to_vk("/"), Some(VIRTUAL_KEY(0xBF)));
        assert_eq!(key_to_vk("ArrowLeft"), Some(VIRTUAL_KEY(0x25)));
    }

    #[test]
    fn test_key_to_vk_rejects_invalid_keys() {
        assert_eq!(key_to_vk(""), None);
        assert_eq!(key_to_vk("Escape"), None);
    }
}
