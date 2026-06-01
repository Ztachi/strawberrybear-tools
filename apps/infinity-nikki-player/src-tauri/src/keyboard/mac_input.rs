//! @fileOverview macOS 键盘模拟模块
//!
//! 使用 macOS 物理键码发送键盘事件，避免游戏忽略字符输入事件。

use core_graphics::{
    event::{CGEvent, CGEventTapLocation},
    event_source::{CGEventSource, CGEventSourceStateID},
};

/// macOS 物理键码
type MacKeyCode = u16;

/// 将按键标识符转换为 macOS 物理键码
///
/// # Arguments
///
/// * `key` - 模板中的按键标识符
///
/// # Returns
///
/// 成功返回 macOS virtual keycode，不支持的按键返回错误
pub(crate) fn key_to_keycode(key: &str) -> Result<MacKeyCode, String> {
    let normalized = key.trim().to_ascii_uppercase();
    match normalized.as_str() {
        "A" => Ok(0),
        "S" => Ok(1),
        "D" => Ok(2),
        "F" => Ok(3),
        "H" => Ok(4),
        "G" => Ok(5),
        "Z" => Ok(6),
        "X" => Ok(7),
        "C" => Ok(8),
        "V" => Ok(9),
        "B" => Ok(11),
        "Q" => Ok(12),
        "W" => Ok(13),
        "E" => Ok(14),
        "R" => Ok(15),
        "Y" => Ok(16),
        "T" => Ok(17),
        "1" => Ok(18),
        "2" => Ok(19),
        "3" => Ok(20),
        "4" => Ok(21),
        "6" => Ok(22),
        "5" => Ok(23),
        "9" => Ok(25),
        "7" => Ok(26),
        "8" => Ok(28),
        "0" => Ok(29),
        "U" => Ok(32),
        "I" => Ok(34),
        "O" => Ok(31),
        "P" => Ok(35),
        "L" => Ok(37),
        "J" => Ok(38),
        "K" => Ok(40),
        "N" => Ok(45),
        "M" => Ok(46),
        "F1" => Ok(122),
        "F2" => Ok(120),
        "F3" => Ok(99),
        "F4" => Ok(118),
        "F5" => Ok(96),
        "F6" => Ok(97),
        "F7" => Ok(98),
        "F8" => Ok(100),
        "F9" => Ok(101),
        "F10" => Ok(109),
        "F11" => Ok(103),
        "F12" => Ok(111),
        "" => Err("按键不能为空".to_string()),
        _ => Err(format!("不支持的 macOS 按键: {}", key)),
    }
}

/// 发送按键事件
///
/// # Arguments
///
/// * `key` - 模板中的按键标识符
/// * `is_press` - 是否为按下事件
///
/// # Returns
///
/// 成功返回 Ok(())
fn send_key_event(key: &str, is_press: bool) -> Result<(), String> {
    let keycode = key_to_keycode(key)?;
    let event_source = CGEventSource::new(CGEventSourceStateID::Private)
        .map_err(|_| "macOS 键盘事件源创建失败".to_string())?;
    let event = CGEvent::new_keyboard_event(event_source, keycode, is_press)
        .map_err(|_| "macOS 键盘事件创建失败".to_string())?;
    event.post(CGEventTapLocation::HID);
    Ok(())
}

/// 发送按键按下事件
///
/// # Arguments
///
/// * `key` - 模板中的按键标识符
///
/// # Returns
///
/// 成功返回 Ok(())
pub fn send_key_down(key: &str) -> Result<(), String> {
    send_key_event(key, true)
}

/// 发送按键释放事件
///
/// # Arguments
///
/// * `key` - 模板中的按键标识符
///
/// # Returns
///
/// 成功返回 Ok(())
pub fn send_key_up(key: &str) -> Result<(), String> {
    send_key_event(key, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_letters_case_insensitively() {
        assert_eq!(key_to_keycode("A").unwrap(), 0);
        assert_eq!(key_to_keycode("q").unwrap(), 12);
    }

    #[test]
    fn maps_number_row_keys() {
        assert_eq!(key_to_keycode("1").unwrap(), 18);
        assert_eq!(key_to_keycode("0").unwrap(), 29);
    }

    #[test]
    fn maps_function_keys() {
        assert_eq!(key_to_keycode("F1").unwrap(), 122);
        assert_eq!(key_to_keycode("F12").unwrap(), 111);
    }

    #[test]
    fn rejects_invalid_keys() {
        assert!(key_to_keycode("").is_err());
        assert!(key_to_keycode("Space").is_err());
    }
}
