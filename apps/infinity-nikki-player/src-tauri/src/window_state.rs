//! @fileOverview 通用窗口状态快照机制
//!
//! 提供「进入特殊形态前记录窗口状态 / 退出时精确还原」的复用能力。
//!
//! 悬浮模式即基于此机制实现：进入前快照窗口状态（含全屏），退出全屏到窗口化基线后
//! 变形为定宽浮窗，退出时还原几何并恢复全屏。这样悬浮窗与主窗口状态完全隔离、互不影响。
//! 未来其它需要临时改变窗口形态的功能（如画中画、迷你模式）可直接复用本模块的原语。
//!
//! 核心难点在于 macOS 的 `set_fullscreen` 是【异步动画】：退出全屏后必须等动画结束，
//! 才能读到真实的窗口化几何、并安全地把窗口缩小成浮窗，否则会读到/残留全屏尺寸。

use std::time::{Duration, Instant};
use tauri::{LogicalPosition, LogicalSize, Runtime, WebviewWindow};

/// 等待全屏切换动画完成的最大时长（macOS `set_fullscreen` 为异步动画）
const FULLSCREEN_TRANSITION_TIMEOUT: Duration = Duration::from_millis(1500);

/// 轮询窗口全屏状态的间隔
const FULLSCREEN_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// 动画完成后的额外稳定时间，确保 `outer_size`/`outer_position` 已是最终窗口几何
const SETTLE_DELAY: Duration = Duration::from_millis(150);

/// 主窗口在进入特殊形态前的状态快照
#[derive(Clone, Debug)]
pub struct WindowStateSnapshot {
    /// 窗口逻辑尺寸（窗口化几何，非全屏尺寸）
    pub size: LogicalSize<f64>,
    /// 窗口逻辑位置（窗口化几何）
    pub position: LogicalPosition<f64>,
    /// 进入特殊形态前是否处于全屏，退出时据此决定是否恢复全屏
    pub fullscreen: bool,
}

/// @description: 退出全屏并等待动画结束（仅当前为全屏时）
/// @param {WebviewWindow} window - 目标窗口
/// @return {Result<bool, String>} 进入特殊形态前是否处于全屏
pub async fn leave_fullscreen<R: Runtime>(window: &WebviewWindow<R>) -> Result<bool, String> {
    let was_fullscreen = window.is_fullscreen().unwrap_or(false);
    if !was_fullscreen {
        return Ok(false);
    }

    window
        .set_fullscreen(false)
        .map_err(|e| format!("退出全屏失败: {}", e))?;

    // 轮询等待 macOS 全屏退出动画结束，再额外稳定一小段时间
    let start = Instant::now();
    while window.is_fullscreen().unwrap_or(false) && start.elapsed() < FULLSCREEN_TRANSITION_TIMEOUT {
        tokio::time::sleep(FULLSCREEN_POLL_INTERVAL).await;
    }
    tokio::time::sleep(SETTLE_DELAY).await;

    Ok(true)
}

/// @description: 捕获窗口当前的窗口化几何并记录全屏标记
/// @param {WebviewWindow} window - 目标窗口（应已处于窗口化状态）
/// @param {bool} fullscreen - 进入特殊形态前是否处于全屏
/// @return {WindowStateSnapshot} 状态快照
pub fn snapshot<R: Runtime>(window: &WebviewWindow<R>, fullscreen: bool) -> WindowStateSnapshot {
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window
        .outer_size()
        .map(|s| s.to_logical(scale))
        .unwrap_or(LogicalSize::new(960.0, 640.0));
    let position = window
        .outer_position()
        .map(|p| p.to_logical(scale))
        .unwrap_or(LogicalPosition::new(0.0, 0.0));

    WindowStateSnapshot {
        size,
        position,
        fullscreen,
    }
}

/// @description: 还原窗口化几何（尺寸 + 位置）
/// @param {WebviewWindow} window - 目标窗口
/// @param {WindowStateSnapshot} snapshot - 进入前的状态快照
/// @return {Result<(), String>} 还原结果
pub fn restore_geometry<R: Runtime>(
    window: &WebviewWindow<R>,
    snapshot: &WindowStateSnapshot,
) -> Result<(), String> {
    window
        .set_size(snapshot.size)
        .map_err(|e| format!("恢复窗口大小失败: {}", e))?;
    window
        .set_position(snapshot.position)
        .map_err(|e| format!("恢复窗口位置失败: {}", e))?;
    Ok(())
}

/// @description: 若快照标记为全屏，则恢复全屏
/// @param {WebviewWindow} window - 目标窗口
/// @param {WindowStateSnapshot} snapshot - 进入前的状态快照
/// @return {Result<(), String>} 还原结果
///
/// 注意：调用前应先 `restore_geometry` 还原窗口化几何，macOS 才会把该几何记为
/// 全屏的「还原帧」，保证用户日后手动退出全屏时回到正确尺寸。
pub fn restore_fullscreen<R: Runtime>(
    window: &WebviewWindow<R>,
    snapshot: &WindowStateSnapshot,
) -> Result<(), String> {
    if snapshot.fullscreen {
        window
            .set_fullscreen(true)
            .map_err(|e| format!("恢复全屏失败: {}", e))?;
    }
    Ok(())
}
