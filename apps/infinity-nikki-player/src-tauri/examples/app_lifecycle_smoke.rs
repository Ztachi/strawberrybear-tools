//! 原生托盘冒烟：仅创建空白测试窗口，不读取用户设置、不启动播放器。
//! 执行 `cargo run --example app_lifecycle_smoke`，成功打印 APP_LIFECYCLE_SMOKE: ok。
#[path = "../src/app_lifecycle.rs"]
mod app_lifecycle;

use std::{sync::mpsc, time::Duration};
use tauri::{AppHandle, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

fn check(
    app: &AppHandle,
    close_events: mpsc::Receiver<()>,
    quit_events: mpsc::Receiver<()>,
) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Missing main")?;
    let editor = app
        .get_webview_window("midi-project-editor")
        .ok_or("Missing editor")?;
    let background = app
        .get_webview_window("piano-editor")
        .ok_or("Missing background editor")?;
    main.close().map_err(|error| error.to_string())?;
    close_events
        .recv_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    if app.get_webview_window("main").is_none()
        || !main.is_visible().map_err(|error| error.to_string())?
    {
        return Err("Native close destroyed or hid the main window before confirmation".into());
    }
    app_lifecycle::hide_to_tray(app.clone(), app.state())?;
    for window in [&main, &editor] {
        if window.is_visible().map_err(|error| error.to_string())? {
            return Err(format!("{} did not hide", window.label()));
        }
    }
    app_lifecycle::restore_windows(app)?;
    for window in [&main, &editor] {
        if !window.is_visible().map_err(|error| error.to_string())? {
            return Err(format!("{} did not restore", window.label()));
        }
    }
    if background.is_visible().map_err(|error| error.to_string())? {
        return Err("Restoring opened an originally hidden editor".into());
    }
    // 再次关闭仍走相同保护；恢复没有破坏窗口或原生关闭监听。
    main.close().map_err(|error| error.to_string())?;
    close_events
        .recv_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    if app.get_webview_window("midi-project-editor").is_none() {
        return Err("Closing main destroyed the editing session".into());
    }
    app_lifecycle::hide_to_tray(app.clone(), app.state())?;
    app_lifecycle::request_quit(app)?;
    quit_events
        .recv_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    if !main.is_visible().map_err(|error| error.to_string())? {
        return Err("Quit request left editing confirmation in a hidden window".into());
    }
    Ok(())
}

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .on_window_event(app_lifecycle::handle_window_event)
        .setup(|app| {
            app_lifecycle::initialize(app.handle(), false)?;
            let (send, receive) = mpsc::channel();
            app.listen("main-window-close-requested", move |_| {
                let _ = send.send(());
            });
            let (quit_send, quit_receive) = mpsc::channel();
            // 退出事件定向发往 main；Rust 的 app.listen 仅接收 App 目标，不接收窗口目标。
            app.listen_any("app-quit-requested", move |_| {
                let _ = quit_send.send(());
            });
            for (label, visible) in [
                ("main", true),
                ("midi-project-editor", true),
                ("piano-editor", false),
            ] {
                WebviewWindowBuilder::new(app, label, WebviewUrl::External("about:blank".parse()?))
                    .title(format!("Nikki lifecycle isolated smoke: {label}"))
                    .inner_size(400.0, 250.0)
                    .visible(visible)
                    .build()?;
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // 原生窗口首次呈现后才检查；所有操作由 Tauri 转发到主线程。
                std::thread::sleep(Duration::from_millis(500));
                match check(&handle, receive, quit_receive) {
                    Ok(()) => {
                        println!("APP_LIFECYCLE_SMOKE: ok");
                        app_lifecycle::quit_application(handle);
                    }
                    Err(error) => {
                        eprintln!("APP_LIFECYCLE_SMOKE: {error}");
                        handle.exit(1);
                    }
                }
            });
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(30));
                eprintln!("APP_LIFECYCLE_SMOKE: timeout");
                handle.exit(2);
            });
            Ok(())
        })
        .run(context)
        .expect("run isolated app lifecycle smoke test");
}
