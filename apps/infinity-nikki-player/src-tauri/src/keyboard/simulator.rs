use crate::types::KeyMapping;
use enigo::{Direction, Enigo, Keyboard, Settings};
use parking_lot::Mutex;

/// 键盘模拟器
pub struct KeySimulator {
    enigo: Mutex<Enigo>,
}

impl KeySimulator {
    pub fn new() -> Result<Self, String> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| format!("初始化键盘模拟失败: {}", e))?;
        Ok(Self {
            enigo: Mutex::new(enigo),
        })
    }

    /// 模拟按键按下（同步版本）
    pub fn press_key_sync(&self, _pitch: u8, mapping: &KeyMapping) {
        let key = &mapping.key;
        if key.is_empty() {
            return;
        }

        let c = key.chars().next().unwrap();
        let _ = self.enigo.lock().key(enigo::Key::Unicode(c), Direction::Press);
    }

    /// 模拟按键释放（同步版本）
    pub fn release_key_sync(&self, _pitch: u8, mapping: &KeyMapping) {
        let key = &mapping.key;
        if key.is_empty() {
            return;
        }

        let c = key.chars().next().unwrap();
        let _ = self.enigo.lock().key(enigo::Key::Unicode(c), Direction::Release);
    }
}
