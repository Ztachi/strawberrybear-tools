use tauri::{AppHandle, Manager, LogicalSize};

/// 进入悬浮模式 - 将主窗口转换为悬浮模式
#[tauri::command]
pub async fn enter_overlay_mode(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_decorations(false).map_err(|e| format!("设置窗口样式失败: {}", e))?;
        window.set_always_on_top(true).map_err(|e| format!("设置置顶失败: {}", e))?;
        window.set_resizable(false).map_err(|e| format!("设置不可调整大小失败: {}", e))?;
        window.set_shadow(false).ok();
        window.set_size(LogicalSize { width: 360.0, height: 110.0 })
            .map_err(|e| format!("调整窗口大小失败: {}", e))?;
        window.center().map_err(|e| format!("居中窗口失败: {}", e))?;

        log::info!("Entered overlay mode");
    }
    Ok(())
}

/// 退出悬浮模式 - 恢复主窗口
#[tauri::command]
pub async fn exit_overlay_mode(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_shadow(true).ok();
        window.set_decorations(true).map_err(|e| format!("恢复窗口样式失败: {}", e))?;
        window.set_always_on_top(false).map_err(|e| format!("取消置顶失败: {}", e))?;
        window.set_resizable(true).map_err(|e| format!("设置可调整大小失败: {}", e))?;
        window.set_size(LogicalSize { width: 960.0, height: 640.0 })
            .map_err(|e| format!("恢复窗口大小失败: {}", e))?;
        window.center().map_err(|e| format!("居中窗口失败: {}", e))?;

        log::info!("Exited overlay mode");
    }
    Ok(())
}
