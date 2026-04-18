//! @fileOverview 窗口管理命令模块
//!
//! 提供进入/退出悬浮模式、窗口状态保存与恢复等功能

use tauri::{AppHandle, Manager, LogicalSize, LogicalPosition};

/// 保存进入悬浮窗前的窗口状态
///
/// 在进入悬浮模式前保存窗口的大小和位置，退出时恢复
static SAVED_WINDOW_STATE: std::sync::Mutex<Option<(LogicalSize<f64>, LogicalPosition<f64>)>> =
    std::sync::Mutex::new(None);

/// 进入悬浮模式
///
/// 将主窗口转换为紧凑的悬浮模式：
/// - 隐藏窗口装饰（标题栏）
/// - 隐藏菜单栏
/// - 设置窗口置顶
/// - 锁定窗口尺寸为 360x110
/// - 窗口居中显示
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 成功返回 Ok(())，失败返回错误字符串
///
/// # Notes
///
/// 悬浮模式下的窗口配置：
/// - decorations: false（无标题栏）
/// - always_on_top: true（置顶）
/// - resizable: false（不可调整大小）
/// - minimizable: false（不可最小化）
/// - size: 360x110
/// - shadow: false（无阴影）
#[tauri::command]
pub async fn enter_overlay_mode(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_fullscreen = window.is_fullscreen().unwrap_or(false);

        if is_fullscreen {
            // 全屏状态下进入悬浮窗：先退出全屏
            window.set_fullscreen(false).map_err(|e| format!("退出全屏失败: {}", e))?;
            // macOS 恢复窗口后，获取新的 outer_size/position 保存
            if let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) {
                let scale_factor = window.scale_factor().unwrap_or(1.0);
                let mut saved = SAVED_WINDOW_STATE.lock().unwrap();
                *saved = Some((
                    size.to_logical(scale_factor),
                    pos.to_logical(scale_factor),
                ));
            }
        } else {
            // 正常窗口状态，直接保存当前窗口大小和位置
            if let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) {
                let scale_factor = window.scale_factor().unwrap_or(1.0);
                let mut saved = SAVED_WINDOW_STATE.lock().unwrap();
                *saved = Some((
                    size.to_logical(scale_factor),
                    pos.to_logical(scale_factor),
                ));
            }
        }

        // 隐藏窗口装饰（标题栏、菜单栏等）
        window.set_decorations(false).map_err(|e| format!("设置窗口样式失败: {}", e))?;
        // 隐藏菜单栏
        window.hide_menu().map_err(|e| format!("隐藏菜单栏失败: {}", e))?;
        // 设置置顶
        window.set_always_on_top(true).map_err(|e| format!("设置置顶失败: {}", e))?;
        // 禁止调整大小
        window.set_resizable(false).map_err(|e| format!("设置不可调整大小失败: {}", e))?;
        // 禁止最小化
        window.set_minimizable(false).map_err(|e| format!("设置不可最小化失败: {}", e))?;
        // 锁定窗口尺寸：同时设置 min 和 max 为相同值
        window.set_min_size(Some(LogicalSize { width: 360.0, height: 110.0 }))
            .map_err(|e| format!("设置最小尺寸失败: {}", e))?;
        window.set_max_size(Some(LogicalSize { width: 360.0, height: 110.0 }))
            .map_err(|e| format!("设置最大尺寸失败: {}", e))?;
        // 移除窗口阴影
        window.set_shadow(false).ok();
        // 设置窗口尺寸
        window.set_size(LogicalSize { width: 360.0, height: 110.0 })
            .map_err(|e| format!("调整窗口大小失败: {}", e))?;
        // 窗口居中
        window.center().map_err(|e| format!("居中窗口失败: {}", e))?;

        log::info!("Entered overlay mode");
    }
    Ok(())
}

/// 退出悬浮模式
///
/// 恢复主窗口到进入悬浮模式前的状态：
/// - 恢复窗口装饰
/// - 显示菜单栏
/// - 取消置顶
/// - 恢复可调整大小
/// - 恢复原始窗口尺寸和位置
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 成功返回 Ok(())，失败返回错误字符串
///
/// # Notes
///
/// 如果没有保存的窗口状态（如首次启动直接退出），窗口将保持当前尺寸
#[tauri::command]
pub async fn exit_overlay_mode(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        // 获取保存的状态
        let saved = {
            let guard = SAVED_WINDOW_STATE.lock().unwrap();
            guard.clone()
        };

        if let Some((saved_size, saved_pos)) = saved {
            // 先恢复窗口大小
            window.set_size(saved_size).map_err(|e| format!("恢复窗口大小失败: {}", e))?;

            // 恢复窗口属性
            window.set_resizable(true).map_err(|e| format!("设置可调整大小失败: {}", e))?;
            window.set_minimizable(true).map_err(|e| format!("设置可最小化失败: {}", e))?;
            window.set_always_on_top(false).map_err(|e| format!("取消置顶失败: {}", e))?;

            // 恢复主窗口的尺寸限制
            window.set_min_size(Some(LogicalSize { width: 800.0, height: 640.0 }))
                .map_err(|e| format!("恢复最小尺寸失败: {}", e))?;
            window.set_max_size(Some(LogicalSize { width: 1440.0, height: 900.0 }))
                .map_err(|e| format!("恢复最大尺寸失败: {}", e))?;
            // 恢复窗口阴影
            window.set_shadow(true).ok();
            // 恢复菜单栏
            window.show_menu().map_err(|e| format!("显示菜单栏失败: {}", e))?;
            // 恢复窗口装饰
            window.set_decorations(true).map_err(|e| format!("恢复窗口样式失败: {}", e))?;

            // 恢复保存的位置
            window.set_position(saved_pos).map_err(|e| format!("恢复窗口位置失败: {}", e))?;

            // 强制刷新窗口焦点状态
            window.set_focus().map_err(|e| format!("设置焦点失败: {}", e))?;
        }

        // 清除保存的状态
        let mut guard = SAVED_WINDOW_STATE.lock().unwrap();
        *guard = None;

        log::info!("Exited overlay mode");
    }
    Ok(())
}
