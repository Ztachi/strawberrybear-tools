//! Windows 驱动级键盘模拟模块
//!
//! 使用 rdev 库实现硬件级键盘模拟，可绕过反作弊检测
//! rdev 直接与 Windows 输入系统交互，发送的输入与真实键盘无法区分

use rdev::{simulate, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};

/// 驱动是否已初始化
static DRIVER_INITIALIZED: AtomicBool = AtomicBool::new(false);

/// 将字符转换为 rdev Key
fn char_to_key(c: char) -> Option<Key> {
    match c.to_ascii_uppercase() {
        'A' => Some(Key::KeyA),
        'B' => Some(Key::KeyB),
        'C' => Some(Key::KeyC),
        'D' => Some(Key::KeyD),
        'E' => Some(Key::KeyE),
        'F' => Some(Key::KeyF),
        'G' => Some(Key::KeyG),
        'H' => Some(Key::KeyH),
        'I' => Some(Key::KeyI),
        'J' => Some(Key::KeyJ),
        'K' => Some(Key::KeyK),
        'L' => Some(Key::KeyL),
        'M' => Some(Key::KeyM),
        'N' => Some(Key::KeyN),
        'O' => Some(Key::KeyO),
        'P' => Some(Key::KeyP),
        'Q' => Some(Key::KeyQ),
        'R' => Some(Key::KeyR),
        'S' => Some(Key::KeyS),
        'T' => Some(Key::KeyT),
        'U' => Some(Key::KeyU),
        'V' => Some(Key::KeyV),
        'W' => Some(Key::KeyW),
        'X' => Some(Key::KeyX),
        'Y' => Some(Key::KeyY),
        'Z' => Some(Key::KeyZ),
        '0' => Some(Key::Num0),
        '1' => Some(Key::Num1),
        '2' => Some(Key::Num2),
        '3' => Some(Key::Num3),
        '4' => Some(Key::Num4),
        '5' => Some(Key::Num5),
        '6' => Some(Key::Num6),
        '7' => Some(Key::Num7),
        '8' => Some(Key::Num8),
        '9' => Some(Key::Num9),
        _ => None,
    }
}

/// 初始化驱动
pub fn init() -> Result<(), String> {
    // rdev 不需要初始化，直接设置标志
    DRIVER_INITIALIZED.store(true, Ordering::SeqCst);
    log::info!("rdev 驱动初始化完成");
    Ok(())
}

/// 检查是否已初始化
pub fn is_initialized() -> bool {
    DRIVER_INITIALIZED.load(Ordering::SeqCst)
}

/// 发送按键按下事件
pub fn send_key_down(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Ok(());
    }

    let c = key.chars().next().unwrap();

    // 查找对应的 Key
    let rdev_key = char_to_key(c).ok_or_else(|| format!("不支持的字符: {}", c))?;

    // 发送按键按下事件
    simulate(&EventType::KeyPress(rdev_key))
        .map_err(|e| format!("发送按键失败: {:?}", e))?;

    Ok(())
}

/// 发送按键释放事件
pub fn send_key_up(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Ok(());
    }

    let c = key.chars().next().unwrap();

    // 查找对应的 Key
    let rdev_key = char_to_key(c).ok_or_else(|| format!("不支持的字符: {}", c))?;

    // 发送按键释放事件
    simulate(&EventType::KeyRelease(rdev_key))
        .map_err(|e| format!("发送按键失败: {:?}", e))?;

    Ok(())
}

/// 发送鼠标点击事件
pub fn send_mouse_click(button: &str, is_press: bool) -> Result<(), String> {
    let event_type = match (button, is_press) {
        ("left", true) => EventType::ButtonPress(rdev::Button::Left),
        ("left", false) => EventType::ButtonRelease(rdev::Button::Left),
        ("right", true) => EventType::ButtonPress(rdev::Button::Right),
        ("right", false) => EventType::ButtonRelease(rdev::Button::Right),
        ("middle", true) => EventType::ButtonPress(rdev::Button::Middle),
        ("middle", false) => EventType::ButtonRelease(rdev::Button::Middle),
        _ => return Err(format!("不支持的鼠标按钮: {}", button)),
    };

    simulate(&event_type)
        .map_err(|e| format!("发送鼠标事件失败: {:?}", e))?;

    Ok(())
}
