//! @fileOverview Windows 自定义标题栏原生能力适配
//!
//! 为自绘标题栏保留 Windows 11 最大化按钮的系统 Snap Layout 浮层。

#[cfg(target_os = "windows")]
mod platform {
    use tauri::WebviewWindow;
    use windows::core::BOOL;
    use windows::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
        UI::{
            HiDpi::GetDpiForWindow,
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
                VIRTUAL_KEY, VK_ESCAPE, VK_Z,
            },
            Shell::{DefSubclassProc, SetWindowSubclass},
            WindowsAndMessaging::{
                EnumChildWindows, GetAncestor, GetWindowLongPtrW, GetWindowRect, SetWindowLongPtrW,
                SetWindowPos, GA_ROOT, GWL_STYLE, HTMAXBUTTON, SWP_FRAMECHANGED, SWP_NOMOVE,
                SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER, WM_NCCALCSIZE, WM_NCHITTEST,
                WS_CAPTION, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
            },
        },
    };

    const SUBCLASS_ID: usize = 0x4950_5743;
    const HEADER_HEIGHT_LOGICAL: f64 = 46.0;
    const WINDOW_CONTROL_WIDTH_LOGICAL: f64 = 46.0;
    const SNAP_OVERLAY_ALT_DELAY_MS: u64 = 10;
    const VK_LEFT_WINDOWS: VIRTUAL_KEY = VIRTUAL_KEY(0x5B);
    const VK_ALT: VIRTUAL_KEY = VIRTUAL_KEY(0x12);

    /// @description: 为 Windows 主窗口应用自定义标题栏原生能力
    ///
    /// 自绘最大化按钮要触发 Windows 11 Snap Layout，除了 HTMAXBUTTON 命中测试外，
    /// 窗口还必须保留可最大化的系统 style 位。WM_NCCALCSIZE 用于移除原生标题栏占位。
    pub fn apply_windows_custom_titlebar(window: &WebviewWindow) {
        let hwnd = match window.hwnd() {
            Ok(hwnd) => hwnd,
            Err(e) => {
                log::warn!("获取 Windows 窗口句柄失败: {}", e);
                return;
            }
        };

        preserve_snap_layout_window_styles(hwnd);
        install_hit_test_for_hwnd(hwnd);

        // WebView2 会创建子 HWND 覆盖客户区；鼠标悬停 HTML 按钮时，命中测试消息通常先到子窗口。
        // 子窗口也需要返回 HTMAXBUTTON，否则 Windows 11 不会显示系统 Snap Layout 浮层。
        unsafe {
            let _ = EnumChildWindows(Some(hwnd), Some(enum_child_windows_proc), LPARAM(0));
        }
    }

    /// @description: 补回 Windows Snap Layout 依赖的窗口样式位
    /// @param {HWND} hwnd - 顶层窗口句柄
    fn preserve_snap_layout_window_styles(hwnd: HWND) {
        let current_style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) } as u32;
        let next_style = current_style
            | WS_CAPTION.0
            | WS_THICKFRAME.0
            | WS_SYSMENU.0
            | WS_MINIMIZEBOX.0
            | WS_MAXIMIZEBOX.0;

        unsafe {
            SetWindowLongPtrW(hwnd, GWL_STYLE, next_style as isize);
            if let Err(e) = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
            ) {
                log::warn!("刷新 Windows 自定义标题栏窗口样式失败: {}", e);
            }
        }
    }

    unsafe extern "system" fn enum_child_windows_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        install_hit_test_for_hwnd(hwnd);
        BOOL(1)
    }

    /// @description: 给指定 HWND 安装最大化按钮命中测试
    /// @param {HWND} hwnd - 目标窗口句柄
    fn install_hit_test_for_hwnd(hwnd: HWND) {
        let ok = unsafe {
            SetWindowSubclass(hwnd, Some(titlebar_subclass_proc), SUBCLASS_ID, 0).as_bool()
        };
        if !ok {
            log::warn!("安装 Windows 标题栏命中测试失败: {:?}", hwnd);
        }
    }

    unsafe extern "system" fn titlebar_subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _uid_subclass: usize,
        _ref_data: usize,
    ) -> LRESULT {
        if msg == WM_NCCALCSIZE && wparam.0 != 0 {
            return LRESULT(0);
        }

        if msg == WM_NCHITTEST && is_in_maximize_button_rect(hwnd, lparam) {
            return LRESULT(HTMAXBUTTON as isize);
        }

        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    /// @description: 判断鼠标是否位于自绘最大化按钮矩形
    /// @param {HWND} hwnd - Windows 窗口句柄
    /// @param {LPARAM} lparam - WM_NCHITTEST 的屏幕坐标参数
    /// @return {boolean} 是否命中最大化按钮
    fn is_in_maximize_button_rect(hwnd: HWND, lparam: LPARAM) -> bool {
        let root_hwnd = unsafe { GetAncestor(hwnd, GA_ROOT) };
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(root_hwnd, &mut rect) }.is_err() {
            return false;
        }

        let cursor_x = signed_low_word(lparam.0) - rect.left;
        let cursor_y = signed_high_word(lparam.0) - rect.top;
        let window_width = rect.right - rect.left;
        let dpi = unsafe { GetDpiForWindow(root_hwnd) };
        let control_width = logical_to_physical(WINDOW_CONTROL_WIDTH_LOGICAL, dpi);
        let header_height = logical_to_physical(HEADER_HEIGHT_LOGICAL, dpi);

        let max_button_left = window_width - control_width * 2;
        let max_button_right = window_width - control_width;

        cursor_x >= max_button_left
            && cursor_x < max_button_right
            && cursor_y >= 0
            && cursor_y < header_height
    }

    /// @description: 将 Windows lparam 的低 16 位还原为有符号屏幕坐标
    /// @param {isize} value - LPARAM 原始数值
    /// @return {i32} 屏幕坐标
    fn signed_low_word(value: isize) -> i32 {
        (value as u32 & 0xffff) as u16 as i16 as i32
    }

    /// @description: 将 Windows lparam 的高 16 位还原为有符号屏幕坐标
    /// @param {isize} value - LPARAM 原始数值
    /// @return {i32} 屏幕坐标
    fn signed_high_word(value: isize) -> i32 {
        ((value as u32 >> 16) & 0xffff) as u16 as i16 as i32
    }

    /// @description: 将前端逻辑像素按当前窗口 DPI 转换为物理像素
    /// @param {f64} logical - 逻辑像素
    /// @param {u32} dpi - 当前窗口 DPI
    /// @return {i32} 物理像素
    fn logical_to_physical(logical: f64, dpi: u32) -> i32 {
        ((logical * dpi as f64 / 96.0).round() as i32).max(1)
    }

    /// @description: 显示 Windows 11 系统 Snap Layout 浮层
    ///
    /// 无边框 WebView 窗口在部分环境下不会因为 `HTMAXBUTTON` 自动弹出 Snap Layout。
    /// 这里使用系统快捷键 Win+Z 作为兜底，并短暂发送 Alt 隐藏快捷键数字提示，保持接近原生悬停体验。
    pub fn show_windows_snap_overlay() -> Result<(), String> {
        send_key_chord(&[VK_LEFT_WINDOWS, VK_Z])?;
        std::thread::sleep(std::time::Duration::from_millis(SNAP_OVERLAY_ALT_DELAY_MS));
        send_key_chord(&[VK_ALT])?;
        Ok(())
    }

    /// @description: 隐藏 Windows 11 系统 Snap Layout 浮层
    /// @return {Result<(), String>} 发送结果
    pub fn hide_windows_snap_overlay() -> Result<(), String> {
        send_key_chord(&[VK_ESCAPE])
    }

    /// @description: 发送按下后反向释放的 Windows 虚拟键组合
    /// @param {&[VIRTUAL_KEY]} keys - 需要组合发送的虚拟键
    /// @return {Result<(), String>} 发送结果
    fn send_key_chord(keys: &[VIRTUAL_KEY]) -> Result<(), String> {
        let mut inputs = Vec::with_capacity(keys.len() * 2);
        for &key in keys {
            inputs.push(build_virtual_key_input(key, false));
        }
        for &key in keys.iter().rev() {
            inputs.push(build_virtual_key_input(key, true));
        }

        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent != inputs.len() as u32 {
            return Err(format!(
                "SendInput failed for snap overlay: sent {}, expected {}",
                sent,
                inputs.len()
            ));
        }

        Ok(())
    }

    /// @description: 构造 Windows 虚拟键输入事件
    /// @param {VIRTUAL_KEY} key - 虚拟键码
    /// @param {boolean} is_release - 是否为释放事件
    /// @return {INPUT} Windows 输入事件
    fn build_virtual_key_input(key: VIRTUAL_KEY, is_release: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: if is_release {
                        KEYEVENTF_KEYUP
                    } else {
                        Default::default()
                    },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }
}

#[cfg(target_os = "windows")]
pub use platform::apply_windows_custom_titlebar;

#[cfg(target_os = "windows")]
/// @description: 显示 Windows 11 系统 Snap Layout 浮层
#[tauri::command]
pub fn show_windows_snap_overlay() -> Result<(), String> {
    platform::show_windows_snap_overlay()
}

#[cfg(target_os = "windows")]
/// @description: 隐藏 Windows 11 系统 Snap Layout 浮层
#[tauri::command]
pub fn hide_windows_snap_overlay() -> Result<(), String> {
    platform::hide_windows_snap_overlay()
}

#[cfg(not(target_os = "windows"))]
/// @description: 非 Windows 平台无需应用 Windows 自定义标题栏适配
pub fn apply_windows_custom_titlebar(_window: &tauri::WebviewWindow) {}

#[cfg(not(target_os = "windows"))]
/// @description: 非 Windows 平台无需显示 Windows Snap Layout 浮层
#[tauri::command]
pub fn show_windows_snap_overlay() -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
/// @description: 非 Windows 平台无需隐藏 Windows Snap Layout 浮层
#[tauri::command]
pub fn hide_windows_snap_overlay() -> Result<(), String> {
    Ok(())
}
