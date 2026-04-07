use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// 创建悬浮窗口
#[tauri::command]
pub async fn create_overlay_window(app: AppHandle) -> Result<(), String> {
    // 检查是否已存在
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }

    let overlay = WebviewWindowBuilder::new(
        &app,
        "overlay",
        WebviewUrl::App("index.html?windowLabel=overlay".into()),
    )
    .title("Overlay")
    .inner_size(320.0, 68.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible(false)
    .resizable(false)
    .focusable(true)
    .skip_taskbar(true)
    .build()
    .map_err(|e| format!("创建悬浮窗口失败: {}", e))?;

    overlay.show().map_err(|e| format!("显示悬浮窗口失败: {}", e))?;

    log::info!("Overlay window created");
    Ok(())
}

/// 关闭悬浮窗口
#[tauri::command]
pub async fn close_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.close().map_err(|e| format!("关闭悬浮窗口失败: {}", e))?;
        log::info!("Overlay window closed");
    }
    Ok(())
}
