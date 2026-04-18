//! @fileOverview 键盘模拟器模块
//!
//! 提供跨平台的键盘按键模拟功能

use crate::types::KeyMapping;
use enigo::{Direction, Enigo, Keyboard, Settings};
use parking_lot::Mutex;

/// 键盘模拟器
///
/// 封装 Enigo 库，提供按键按下和释放功能
pub struct KeySimulator {
    /// Enigo 实例，使用 Mutex 保证线程安全
    enigo: Mutex<Enigo>,
}

/// 将字符转换为 Windows 虚拟键码
///
/// # Arguments
///
/// * `c` - 要转换的字符
///
/// # Returns
///
/// 虚拟键码，不支持返回 None
///
/// # Notes
///
/// 目前仅支持 A-Z 和 0-9
#[cfg(target_os = "windows")]
fn char_to_vkey(c: char) -> Option<u32> {
    if c.is_ascii_alphabetic() {
        // A-Z: 虚拟键码 0x41 (VK_KEY_A)
        Some(c.to_ascii_uppercase() as u32)
    } else if c.is_ascii_digit() {
        // 0-9: 虚拟键码 0x30 (VK_KEY_0)
        Some(c as u32)
    } else {
        None
    }
}

impl KeySimulator {
    /// 创建新的键盘模拟器
    ///
    /// # Returns
    ///
    /// 成功返回 KeySimulator，失败返回错误
    pub fn new() -> Result<Self, String> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| format!("初始化键盘模拟失败: {}", e))?;
        Ok(Self {
            enigo: Mutex::new(enigo),
        })
    }

    /// 模拟按键按下（Windows）
    ///
    /// # Arguments
    ///
    /// * `key` - 按键字符
    #[cfg(target_os = "windows")]
    pub fn press_key(&self, key: &str) {
        if key.is_empty() {
            return;
        }
        let c = key.chars().next().unwrap();
        let mut enigo = self.enigo.lock();

        // 使用 Key::Other 发送虚拟键码
        if let Some(vkey) = char_to_vkey(c) {
            let _ = enigo.key(enigo::Key::Other(vkey), Direction::Press);
        } else {
            let _ = enigo.key(enigo::Key::Unicode(c), Direction::Press);
        }
    }

    /// 模拟按键释放（Windows）
    ///
    /// # Arguments
    ///
    /// * `key` - 按键字符
    #[cfg(target_os = "windows")]
    pub fn release_key(&self, key: &str) {
        if key.is_empty() {
            return;
        }
        let c = key.chars().next().unwrap();
        let mut enigo = self.enigo.lock();

        if let Some(vkey) = char_to_vkey(c) {
            let _ = enigo.key(enigo::Key::Other(vkey), Direction::Release);
        } else {
            let _ = enigo.key(enigo::Key::Unicode(c), Direction::Release);
        }
    }

    /// 模拟按键按下（macOS/Linux）
    ///
    /// # Arguments
    ///
    /// * `key` - 按键字符
    #[cfg(not(target_os = "windows"))]
    pub fn press_key(&self, key: &str) {
        if key.is_empty() {
            return;
        }
        let c = key.chars().next().unwrap();
        let _ = self.enigo.lock().key(enigo::Key::Unicode(c), Direction::Press);
    }

    /// 模拟按键释放（macOS/Linux）
    ///
    /// # Arguments
    ///
    /// * `key` - 按键字符
    #[cfg(not(target_os = "windows"))]
    pub fn release_key(&self, key: &str) {
        if key.is_empty() {
            return;
        }
        let c = key.chars().next().unwrap();
        let _ = self.enigo.lock().key(enigo::Key::Unicode(c), Direction::Release);
    }

    /// 模拟按键按下（同步版本）
    ///
    /// 根据映射关系发送按键
    ///
    /// # Arguments
    ///
    /// * `_pitch` - MIDI 音符号（暂未使用）
    /// * `mapping` - 键盘映射
    pub fn press_key_sync(&self, _pitch: u8, mapping: &KeyMapping) {
        self.press_key(&mapping.key);
    }

    /// 模拟按键释放（同步版本）
    ///
    /// # Arguments
    ///
    /// * `_pitch` - MIDI 音符号（暂未使用）
    /// * `mapping` - 键盘映射
    pub fn release_key_sync(&self, _pitch: u8, mapping: &KeyMapping) {
        self.release_key(&mapping.key);
    }
}
