//! 关闭窗口与退出应用分离；托盘隐藏保留独立编辑会话，恢复只打开此前可见的窗口。
use parking_lot::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

const TRAY_ID: &str = "nikki-main-tray";
#[derive(Default)]
pub struct HiddenWindows(Mutex<Vec<String>>);

/// 原生关闭先交给前端选择和编辑保护；用户确认之前主窗口仍然存在。
pub fn handle_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == "main" {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.emit("main-window-close-requested", ());
        }
    }
}

pub fn initialize(app: &AppHandle, chinese: bool) -> tauri::Result<()> {
    app.manage(HiddenWindows::default());
    let show = MenuItem::with_id(
        app,
        "tray-show",
        if chinese {
            "打开窗口"
        } else {
            "Open window"
        },
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        "tray-quit",
        if chinese {
            "退出应用"
        } else {
            "Quit application"
        },
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(if chinese {
            "无限暖暖自动演奏"
        } else {
            "Infinity Nikki Auto Player"
        })
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => {
                if let Err(error) = restore_windows(app) {
                    log::error!("恢复托盘窗口失败: {error}");
                }
            }
            "tray-quit" => {
                if let Err(error) = request_quit(app) {
                    log::error!("请求退出失败: {error}");
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                if let Err(error) = restore_windows(tray.app_handle()) {
                    log::error!("恢复托盘窗口失败: {error}");
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn hide_to_tray(app: AppHandle, state: State<HiddenWindows>) -> Result<(), String> {
    // 托盘创建失败时不隐藏，避免后台应用失去可恢复的入口。
    if app.tray_by_id(TRAY_ID).is_none() {
        return Err("System tray is unavailable".into());
    }
    // 先完成可见性查询，再隐藏窗口；查询失败不会留下已隐藏的半完成状态。
    let mut visible = Vec::new();
    for (label, window) in app.webview_windows() {
        if !matches!(
            label.as_str(),
            "main" | "piano-editor" | "midi-project-editor"
        ) || !window.is_visible().map_err(|error| error.to_string())?
        {
            continue;
        }
        visible.push((label, window));
    }
    let mut hidden = state.0.lock();
    for (label, window) in visible {
        if let Err(error) = window.hide() {
            for prior in hidden.iter() {
                if let Some(window) = app.get_webview_window(prior) {
                    let _ = window.show();
                }
            }
            hidden.clear();
            return Err(error.to_string());
        }
        if !hidden.contains(&label) {
            hidden.push(label);
        }
    }
    Ok(())
}

pub fn restore_windows(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<HiddenWindows>();
    let mut hidden = state.0.lock();
    // 展示失败保留列表供下一次重试，且不会唤醒原本就在后台的编辑窗口。
    for label in hidden.iter() {
        if let Some(window) = app.get_webview_window(label) {
            window.show().map_err(|error| error.to_string())?;
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|error| error.to_string())?;
        main.unminimize().map_err(|error| error.to_string())?;
        main.set_focus().map_err(|error| error.to_string())?;
    }
    hidden.clear();
    Ok(())
}

#[tauri::command]
pub fn quit_application(app: AppHandle) {
    // 前端已完成所有编辑确认和停止播放；显式退出码与系统菜单的退出请求区分。
    app.exit(0);
}

/// 从托盘退出时先恢复窗口，否则未保存项目的确认会被隐藏在后台。
pub fn request_quit(app: &AppHandle) -> Result<(), String> {
    restore_windows(app)?;
    app.emit_to("main", "app-quit-requested", ())
        .map_err(|error| error.to_string())
}
