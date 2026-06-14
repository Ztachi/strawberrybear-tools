//! @fileOverview 帧率采集命令模块
//!
//! 将 frame-rate-capture 公共库包装成 Tauri command，前端不直接关心平台 provider 细节。

use frame_rate_capture::{
    CaptureStatus, FrameRateCapture, FrameRateCaptureCapability, FrameRateCaptureOptions,
    FrameRateSnapshot,
};
use parking_lot::Mutex;
use std::path::PathBuf;
use tauri::Manager;

/// 帧率采集共享状态。
///
/// capture 懒初始化是为了在启动时拿到 Tauri resource_dir，并允许开发环境通过环境变量或 PATH
/// 提供 PresentMon，而不是把平台资源路径写死在公共库里。
#[derive(Default)]
pub struct FrameRateCaptureState {
    /// 当前 provider 实例。
    capture: Mutex<Option<FrameRateCapture>>,
}

/// 获取当前平台自动 FPS 采集能力。
#[tauri::command]
pub fn get_frame_rate_capture_capability() -> FrameRateCaptureCapability {
    FrameRateCapture::capability()
}

/// 启动自动 FPS 采集。
///
/// UnsupportedPlatform / PresentMonMissing 这类可回退状态会作为快照返回，避免前端把它当作致命错误。
#[tauri::command]
pub fn start_frame_rate_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, FrameRateCaptureState>,
) -> Result<FrameRateSnapshot, String> {
    let mut capture = state.capture.lock();
    if capture.is_none() {
        *capture = Some(FrameRateCapture::new(build_capture_options(&app)));
    }

    let capture = capture
        .as_mut()
        .ok_or_else(|| "初始化 FPS 采集器失败".to_string())?;

    match capture.start() {
        Ok(()) => Ok(capture.snapshot()),
        Err(error) => {
            let mut snapshot = capture.snapshot();
            snapshot.status = error.status;
            snapshot.message = Some(error.message);
            Ok(snapshot)
        }
    }
}

/// 获取当前 FPS 快照。
#[tauri::command]
pub fn get_frame_rate_snapshot(
    state: tauri::State<'_, FrameRateCaptureState>,
) -> Result<FrameRateSnapshot, String> {
    let mut capture = state.capture.lock();
    if let Some(capture) = capture.as_mut() {
        return Ok(capture.snapshot());
    }

    Ok(FrameRateSnapshot::empty(
        CaptureStatus::Idle,
        frame_rate_capture::FrameRateSource::Unsupported,
        Some("FPS 采集器尚未启动".to_string()),
    ))
}

/// 停止自动 FPS 采集。
#[tauri::command]
pub fn stop_frame_rate_capture(state: tauri::State<'_, FrameRateCaptureState>) {
    let mut capture = state.capture.lock();
    if let Some(capture) = capture.as_mut() {
        capture.stop();
    }
}

fn build_capture_options(app: &tauri::AppHandle) -> FrameRateCaptureOptions {
    let mut options = FrameRateCaptureOptions::default();

    // 打包资源路径：src-tauri/tauri.conf.json 的 bundle.resources 应包含 presentmon。
    if let Ok(resource_dir) = app.path().resource_dir() {
        options
            .presentmon_search_dirs
            .push(resource_dir.join("presentmon"));
    }

    // 开发模式常用路径，方便不打包时本地验证。
    options
        .presentmon_search_dirs
        .push(PathBuf::from("presentmon"));
    options
        .presentmon_search_dirs
        .push(PathBuf::from("src-tauri/presentmon"));

    options
}
