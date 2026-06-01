//! @fileOverview 键盘模拟器模块
//!
//! 提供跨平台的键盘按键模拟门面，平台细节由独立模块实现。

use crate::types::KeyMapping;

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
use enigo::{Direction, Keyboard};
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
use enigo::{Enigo, Settings};
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
use parking_lot::Mutex;

/// 键盘模拟器
///
/// 封装平台特定实现，确保调用层不直接依赖平台分支。
pub struct KeySimulator {
    /// Enigo 实例，使用 Mutex 保证线程安全
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    enigo: Mutex<Enigo>,
}

impl KeySimulator {
    /// 创建新的键盘模拟器
    ///
    /// # Returns
    ///
    /// 成功返回 KeySimulator，失败返回错误
    pub fn new() -> Result<Self, String> {
        #[cfg(target_os = "windows")]
        {
            crate::keyboard::win_input::init()?;
            Ok(Self {})
        }

        #[cfg(target_os = "macos")]
        {
            Ok(Self {})
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            let enigo = Enigo::new(&Settings::default())
                .map_err(|e| format!("初始化键盘模拟失败: {}", e))?;
            Ok(Self {
                enigo: Mutex::new(enigo),
            })
        }
    }

    /// 模拟按键按下
    ///
    /// # Arguments
    ///
    /// * `key` - 按键标识符
    ///
    /// # Returns
    ///
    /// 成功返回 Ok(())
    pub fn press_key(&self, key: &str) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            crate::keyboard::win_input::send_key_down(key)
        }

        #[cfg(target_os = "macos")]
        {
            crate::keyboard::mac_input::send_key_down(key)
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            let c = key
                .chars()
                .next()
                .ok_or_else(|| "按键不能为空".to_string())?;
            self.enigo
                .lock()
                .key(enigo::Key::Unicode(c), Direction::Press)
                .map_err(|e| format!("键盘事件发送失败: {}", e))
        }
    }

    /// 模拟按键释放
    ///
    /// # Arguments
    ///
    /// * `key` - 按键标识符
    ///
    /// # Returns
    ///
    /// 成功返回 Ok(())
    pub fn release_key(&self, key: &str) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            crate::keyboard::win_input::send_key_up(key)
        }

        #[cfg(target_os = "macos")]
        {
            crate::keyboard::mac_input::send_key_up(key)
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            let c = key
                .chars()
                .next()
                .ok_or_else(|| "按键不能为空".to_string())?;
            self.enigo
                .lock()
                .key(enigo::Key::Unicode(c), Direction::Release)
                .map_err(|e| format!("键盘事件发送失败: {}", e))
        }
    }

    /// 模拟按键按下（同步版本）
    ///
    /// 根据映射关系发送按键
    ///
    /// # Arguments
    ///
    /// * `_pitch` - MIDI 音符号（暂未使用）
    /// * `mapping` - 键盘映射
    ///
    /// # Returns
    ///
    /// 成功返回 Ok(())
    pub fn press_key_sync(&self, _pitch: u8, mapping: &KeyMapping) -> Result<(), String> {
        self.press_key(&mapping.key)
    }

    /// 模拟按键释放（同步版本）
    ///
    /// # Arguments
    ///
    /// * `_pitch` - MIDI 音符号（暂未使用）
    /// * `mapping` - 键盘映射
    ///
    /// # Returns
    ///
    /// 成功返回 Ok(())
    pub fn release_key_sync(&self, _pitch: u8, mapping: &KeyMapping) -> Result<(), String> {
        self.release_key(&mapping.key)
    }
}
