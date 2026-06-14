//! @fileOverview 窗口管理命令模块
//!
//! 提供进入/退出悬浮模式、窗口状态保存与恢复等功能

#[cfg(target_os = "windows")]
use super::window_controls;
use crate::window_state::{self, WindowStateSnapshot};
use tauri::{AppHandle, LogicalSize, Manager};

const OVERLAY_WIDTH: f64 = 360.0;
const OVERLAY_COLLAPSED_HEIGHT: f64 = 156.0;
const OVERLAY_EXPANDED_HEIGHT: f64 = 320.0;
/// 主窗口尺寸下限（退出悬浮后恢复）
const MAIN_MIN_WIDTH: f64 = 980.0;
const MAIN_MIN_HEIGHT: f64 = 640.0;
/// 退出悬浮后等待 set_decorations 异步 styleMask 落地的时间
#[cfg(target_os = "macos")]
const DECORATION_SETTLE_MS: u64 = 80;
/// 还原窗口几何后、再进入全屏前的稳定时间
const FULLSCREEN_RESTORE_SETTLE_MS: u64 = 60;

#[cfg(target_os = "macos")]
pub fn apply_immersive_titlebar(window: &tauri::WebviewWindow) {
    if let Err(e) = window.set_title_bar_style(tauri::TitleBarStyle::Overlay) {
        log::warn!("应用沉浸式标题栏失败: {}", e);
    }
    if let Err(e) = window.set_title("") {
        log::warn!("隐藏原生标题文字失败: {}", e);
    }
}

#[cfg(target_os = "macos")]
async fn restore_main_window_chrome(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .show_menu()
        .map_err(|e| format!("显示菜单栏失败: {}", e))?;
    window
        .set_decorations(true)
        .map_err(|e| format!("恢复窗口样式失败: {}", e))?;

    // macOS 上 set_decorations(true) 异步修改 styleMask，需等待落地后再补回沉浸式标题栏。
    tokio::time::sleep(std::time::Duration::from_millis(DECORATION_SETTLE_MS)).await;
    apply_immersive_titlebar(window);
    Ok(())
}

#[cfg(target_os = "windows")]
async fn restore_main_window_chrome(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .hide_menu()
        .map_err(|e| format!("隐藏菜单栏失败: {}", e))?;
    window
        .set_decorations(false)
        .map_err(|e| format!("恢复 Windows 自定义标题栏失败: {}", e))?;
    window_controls::apply_windows_custom_titlebar(window);
    Ok(())
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
async fn restore_main_window_chrome(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .show_menu()
        .map_err(|e| format!("显示菜单栏失败: {}", e))?;
    window
        .set_decorations(true)
        .map_err(|e| format!("恢复窗口样式失败: {}", e))?;
    Ok(())
}

/// 保存进入悬浮窗前的窗口状态快照（含全屏标记），退出时据此精确还原
static SAVED_WINDOW_STATE: std::sync::Mutex<Option<WindowStateSnapshot>> =
    std::sync::Mutex::new(None);

/// 进入悬浮模式
///
/// 将主窗口转换为紧凑的悬浮模式：
/// - 隐藏窗口装饰（标题栏）
/// - 隐藏菜单栏
/// - 设置窗口置顶
/// - 设置窗口尺寸为 360x156
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
/// - size: 360x156
/// - shadow: false（无阴影）
#[tauri::command]
pub async fn enter_overlay_mode(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        // 1) 复用窗口状态机制：若处于全屏，先退出并等待动画结束（macOS 异步），
        //    再读取真实窗口化几何，避免悬浮窗残留全屏尺寸（整屏宽）。
        let was_fullscreen = window_state::leave_fullscreen(&window).await?;
        // 2) 快照进入前的窗口化几何与全屏标记，退出时据此精确还原
        let snapshot = window_state::snapshot(&window, was_fullscreen);
        window_state::persist_snapshot(&app, &snapshot)?;
        *SAVED_WINDOW_STATE.lock().unwrap() = Some(snapshot);

        // 3) 变形为悬浮窗
        // 隐藏窗口装饰（标题栏、菜单栏等）
        window
            .set_decorations(false)
            .map_err(|e| format!("设置窗口样式失败: {}", e))?;
        // 隐藏菜单栏
        window
            .hide_menu()
            .map_err(|e| format!("隐藏菜单栏失败: {}", e))?;
        // 设置置顶
        window
            .set_always_on_top(true)
            .map_err(|e| format!("设置置顶失败: {}", e))?;
        // 禁止调整大小
        window
            .set_resizable(false)
            .map_err(|e| format!("设置不可调整大小失败: {}", e))?;
        // 禁止最小化
        window
            .set_minimizable(false)
            .map_err(|e| format!("设置不可最小化失败: {}", e))?;
        // 限制悬浮窗尺寸：收起高度 156，展开播放列表高度 320。
        window
            .set_min_size(Some(LogicalSize {
                width: OVERLAY_WIDTH,
                height: OVERLAY_COLLAPSED_HEIGHT,
            }))
            .map_err(|e| format!("设置最小尺寸失败: {}", e))?;
        window
            .set_max_size(Some(LogicalSize {
                width: OVERLAY_WIDTH,
                height: OVERLAY_EXPANDED_HEIGHT,
            }))
            .map_err(|e| format!("设置最大尺寸失败: {}", e))?;
        // 移除窗口阴影
        window.set_shadow(false).ok();
        // 设置窗口尺寸
        window
            .set_size(LogicalSize {
                width: OVERLAY_WIDTH,
                height: OVERLAY_COLLAPSED_HEIGHT,
            })
            .map_err(|e| format!("调整窗口大小失败: {}", e))?;
        // 窗口居中
        window
            .center()
            .map_err(|e| format!("居中窗口失败: {}", e))?;

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
        // 取出进入前的状态快照（lock 立即 clone 释放，避免跨 await 持锁）
        let saved = SAVED_WINDOW_STATE.lock().unwrap().clone().or_else(|| {
            match window_state::load_persisted_snapshot(&app) {
                Ok(snapshot) => snapshot,
                Err(e) => {
                    log::warn!("读取持久化悬浮窗口状态失败: {}", e);
                    None
                }
            }
        });

        if let Some(snapshot) = saved {
            // 1) 恢复主窗口属性
            window
                .set_resizable(true)
                .map_err(|e| format!("设置可调整大小失败: {}", e))?;
            window
                .set_minimizable(true)
                .map_err(|e| format!("设置可最小化失败: {}", e))?;
            window
                .set_always_on_top(false)
                .map_err(|e| format!("取消置顶失败: {}", e))?;
            window
                .set_min_size(Some(LogicalSize {
                    width: MAIN_MIN_WIDTH,
                    height: MAIN_MIN_HEIGHT,
                }))
                .map_err(|e| format!("恢复最小尺寸失败: {}", e))?;
            window
                .set_max_size(None::<LogicalSize<f64>>)
                .map_err(|e| format!("恢复最大尺寸失败: {}", e))?;
            // 保持与 tauri.conf.json 一致：始终不开启系统阴影。
            // Tauri 2.10.x 在 undecorated + shadow 时会限制窗口只能从顶部 4px 调整大小，
            // 与本应用的全边可拖拽需求冲突。这里显式关闭即可。
            window.set_shadow(false).ok();
            restore_main_window_chrome(&window).await?;

            // 2) 复用窗口状态机制：还原窗口化几何（尺寸 + 位置）
            window_state::restore_geometry(&window, &snapshot)?;

            // 3) 按需恢复全屏：在窗口化几何就绪后再进入，确保日后手动退出全屏回到正确尺寸。
            //    非全屏场景则重新聚焦，保证退出悬浮后 hover 立即可用。
            if snapshot.fullscreen {
                tokio::time::sleep(std::time::Duration::from_millis(
                    FULLSCREEN_RESTORE_SETTLE_MS,
                ))
                .await;
                window_state::restore_fullscreen(&window, &snapshot)?;
            } else if let Err(e) = window.set_focus() {
                log::warn!("退出悬浮模式后聚焦失败: {}", e);
            }
        }

        // 清除保存的状态
        *SAVED_WINDOW_STATE.lock().unwrap() = None;
        if let Err(e) = window_state::clear_persisted_snapshot(&app) {
            log::warn!("清理持久化悬浮窗口状态失败: {}", e);
        }

        log::info!("Exited overlay mode");
    }
    Ok(())
}

/// @description: 查询是否存在待恢复的悬浮窗口状态。
/// @param {AppHandle} app - Tauri 应用句柄
/// @return {boolean} 是否仍处于悬浮窗口生命周期中
#[tauri::command]
pub fn has_saved_overlay_window_state(app: AppHandle) -> bool {
    SAVED_WINDOW_STATE.lock().unwrap().is_some() || window_state::has_persisted_snapshot(&app)
}
