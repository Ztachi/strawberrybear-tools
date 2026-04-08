mod commands;
mod midi;
mod keyboard;
mod types;

use commands::player::PlayerControl;
use types::AppState;
use std::env;
use tauri::Manager;

/// 获取系统语言 - 调用 macOS 系统命令获取真实语言偏好
fn get_system_lang() -> String {
    if let Ok(output) = std::process::Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        log::info!("AppleLanguages: {}", stdout);
        // 提取第一个语言代码
        if let Some(start) = stdout.find('"') {
            if let Some(end) = stdout[start + 1..].find('"') {
                let lang = &stdout[start + 1..start + 1 + end];
                let lang = lang.trim();
                if lang.starts_with("zh") {
                    return "zh_CN".to_string();
                }
                if lang.starts_with("en") {
                    return "en_US".to_string();
                }
            }
        }
    }
    // 回退：使用环境变量
    env::var("LC_MESSAGES")
        .or_else(|_| env::var("LANG"))
        .unwrap_or_default()
        .to_lowercase()
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    log::info!("Starting InfinityNikkiPlayer...");

    let is_zh = get_system_lang().starts_with("zh");
    log::info!("is_zh = {}", is_zh);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_mcp_bridge::init())
        .manage(AppState::default())
        .manage(PlayerControl::default())
        .setup(move |app| {
            let menu = if is_zh {
                let app_name = "无限暖暖自动演奏";
                tauri::menu::Menu::with_items(app, &[
                    &tauri::menu::Submenu::with_items(app, app_name, true, &[
                        &tauri::menu::MenuItem::with_id(app, "about", &format!("关于 {app_name}"), true, None::<&str>)?,
                        &tauri::menu::PredefinedMenuItem::separator(app)?,
                        &tauri::menu::MenuItem::with_id(app, "hide", "隐藏", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "quit", &format!("退出 {app_name}"), true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "文件", true, &[
                        &tauri::menu::MenuItem::with_id(app, "close", "关闭", true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "编辑", true, &[
                        &tauri::menu::MenuItem::with_id(app, "undo", "撤销", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "redo", "重做", true, None::<&str>)?,
                        &tauri::menu::PredefinedMenuItem::separator(app)?,
                        &tauri::menu::MenuItem::with_id(app, "cut", "剪切", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "copy", "复制", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "paste", "粘贴", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "select_all", "全选", true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "窗口", true, &[
                        &tauri::menu::MenuItem::with_id(app, "minimize", "最小化", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "zoom", "缩放", true, None::<&str>)?,
                        &tauri::menu::PredefinedMenuItem::separator(app)?,
                        &tauri::menu::MenuItem::with_id(app, "fullscreen", "切换到全屏幕", true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "帮助", true, &[
                        &tauri::menu::MenuItem::with_id(app, "help_about", &format!("关于 {app_name}"), true, None::<&str>)?,
                    ])?,
                ])?
            } else {
                tauri::menu::Menu::with_items(app, &[
                    &tauri::menu::Submenu::with_items(app, "InfinityNikkiPlayer", true, &[
                        &tauri::menu::MenuItem::with_id(app, "about", "About InfinityNikkiPlayer...", true, None::<&str>)?,
                        &tauri::menu::PredefinedMenuItem::separator(app)?,
                        &tauri::menu::MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "quit", "Quit InfinityNikkiPlayer", true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "File", true, &[
                        &tauri::menu::MenuItem::with_id(app, "close", "Close", true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "Edit", true, &[
                        &tauri::menu::MenuItem::with_id(app, "undo", "Undo", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "redo", "Redo", true, None::<&str>)?,
                        &tauri::menu::PredefinedMenuItem::separator(app)?,
                        &tauri::menu::MenuItem::with_id(app, "cut", "Cut", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "copy", "Copy", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "paste", "Paste", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "select_all", "Select All", true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "Window", true, &[
                        &tauri::menu::MenuItem::with_id(app, "minimize", "Minimize", true, None::<&str>)?,
                        &tauri::menu::MenuItem::with_id(app, "zoom", "Zoom", true, None::<&str>)?,
                        &tauri::menu::PredefinedMenuItem::separator(app)?,
                        &tauri::menu::MenuItem::with_id(app, "fullscreen", "Enter Full Screen", true, None::<&str>)?,
                    ])?,
                    &tauri::menu::Submenu::with_items(app, "Help", true, &[
                        &tauri::menu::MenuItem::with_id(app, "help_about", "About InfinityNikkiPlayer", true, None::<&str>)?,
                    ])?,
                ])?
            };

            app.set_menu(menu)?;

            // 动态设置窗口标题
            let window_title = if is_zh { "无限暖暖自动演奏" } else { "InfinityNikkiPlayer" };
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = window.set_title(window_title) {
                    log::error!("Failed to set window title: {}", e);
                }
            }

            // 菜单事件处理
            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref();
                log::info!("Menu event: {}", id);

                match id {
                    "quit" => {
                        // 退出应用
                        app_handle.exit(0);
                    }
                    "hide" => {
                        // 隐藏应用
                        if let Some(window) = app_handle.get_webview_window("main") {
                            window.hide().ok();
                        }
                    }
                    "close" => {
                        // 关闭主窗口
                        if let Some(window) = app_handle.get_webview_window("main") {
                            window.close().ok();
                        }
                    }
                    "minimize" => {
                        // 最小化
                        if let Some(window) = app_handle.get_webview_window("main") {
                            window.minimize().ok();
                        }
                    }
                    "zoom" => {
                        // 缩放/最大化
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if window.is_maximized().unwrap_or(false) {
                                window.unmaximize().ok();
                            } else {
                                window.maximize().ok();
                            }
                        }
                    }
                    "fullscreen" => {
                        // 全屏切换
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                            window.set_fullscreen(!is_fullscreen).ok();
                        }
                    }
                    "about" | "help_about" => {
                        // 关于对话框 - 简化处理
                        let msg = if is_zh {
                            "无限暖暖自动演奏 v0.0.1\n\n一款自动演奏MIDI音乐的应用。"
                        } else {
                            "InfinityNikkiPlayer v0.0.1\n\nAn auto-play MIDI music application."
                        };
                        let _ = msg;
                        // macOS 标准关于窗口由系统处理，菜单的 About 暂时跳过
                    }
                    _ => {}
                }
            });

            log::info!("App setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_system_locale,
            commands::midi::parse_midi_file,
            commands::midi::extract_melody,
            commands::midi::scan_folder,
            commands::midi::read_midi_data,
            commands::player::start_playback,
            commands::player::pause_playback,
            commands::player::resume_playback,
            commands::player::stop_playback,
            commands::player::get_playback_state,
            commands::player::set_speed,
            commands::keyboard::get_key_logs,
            commands::keyboard::clear_key_logs,
            commands::window::create_overlay_window,
            commands::window::close_overlay_window,
            commands::templates::get_templates,
            commands::templates::save_template,
            commands::templates::delete_template,
            commands::check_accessibility,
            commands::open_accessibility_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
