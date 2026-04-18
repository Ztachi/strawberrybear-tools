//! @fileOverview InfinityNikkiPlayer Tauri 应用入口
//!
//! 负责初始化 Tauri 应用、窗口配置、菜单设置和插件管理

mod commands;
mod midi;
mod keyboard;
mod types;

use commands::player::PlayerControl;
use types::AppState;
use std::env;
use tauri::{Manager, Emitter};

/// 检测是否以管理员权限运行（仅 Windows）
///
/// Windows 上驱动级键盘模拟需要管理员权限
#[cfg(target_os = "windows")]
fn is_running_as_admin() -> bool {
    check_elevation::is_elevated().unwrap_or(false)
}

/// 获取系统语言 - 调用 macOS 系统命令获取真实语言偏好
///
/// 优先使用 `AppleLanguages` 系统偏好，其次使用环境变量
fn get_system_lang() -> String {
    // 尝试读取 macOS 系统语言偏好
    if let Ok(output) = std::process::Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        log::info!("AppleLanguages: {}", stdout);

        // 提取第一个语言代码（如 "en-CN" 或 "zh-Hans"）
        if let Some(start) = stdout.find('"') {
            if let Some(end) = stdout[start + 1..].find('"') {
                let lang = &stdout[start + 1..start + 1 + end];
                let lang = lang.trim();

                // 根据语言代码前缀判断
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

/// 将打包资源中的 midi 目录文件首次复制到用户数据目录
///
/// 已存在同名文件的不会覆盖，确保用户数据安全
///
/// # Arguments
///
/// * `app` - Tauri 应用实例
fn seed_bundled_midi(app: &tauri::App) {
    use std::fs;
    use tauri::Manager;

    // 获取打包资源目录
    let resource_dir = match app.path().resource_dir() {
        Ok(d) => d,
        Err(e) => {
            log::warn!("seed_bundled_midi: 获取资源目录失败: {}", e);
            return;
        }
    };
    let bundled_midi_dir = resource_dir.join("midi");

    // 如果没有捆绑的 MIDI 目录，跳过
    if !bundled_midi_dir.is_dir() {
        log::info!("seed_bundled_midi: 无捆绑 MIDI 目录，跳过");
        return;
    }

    // 获取应用数据目录
    let data_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            log::warn!("seed_bundled_midi: 获取数据目录失败: {}", e);
            return;
        }
    };
    let library_dir = data_dir.join("midi_library");

    // 创建 midi_library 目录
    if let Err(e) = fs::create_dir_all(&library_dir) {
        log::warn!("seed_bundled_midi: 创建 midi_library 失败: {}", e);
        return;
    }

    // 读取资源目录中的 MIDI 文件
    let entries = match fs::read_dir(&bundled_midi_dir) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("seed_bundled_midi: 读取资源目录失败: {}", e);
            return;
        }
    };

    // 复制每个 MIDI 文件（如果不存在）
    for entry in entries.flatten() {
        let src = entry.path();

        // 只处理文件
        if !src.is_file() {
            continue;
        }

        // 只处理 MIDI 文件
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "mid" && ext != "midi" {
            continue;
        }

        let filename = match src.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let dest = library_dir.join(&filename);

        // 如果目标已存在，跳过
        if dest.exists() {
            log::info!("seed_bundled_midi: 已存在 {}，跳过", filename);
            continue;
        }

        // 复制文件
        match fs::copy(&src, &dest) {
            Ok(_) => log::info!("seed_bundled_midi: 导入默认 MIDI: {}", filename),
            Err(e) => log::warn!("seed_bundled_midi: 复制 {} 失败: {}", filename, e),
        }
    }
}

/// 应用入口函数
///
/// 初始化日志、检测权限、配置菜单、注册命令和插件
pub fn run() {
    // 初始化日志系统（从环境变量读取日志级别）
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    log::info!("Starting InfinityNikkiPlayer...");

    // Windows 管理员权限检测
    #[cfg(target_os = "windows")]
    {
        if !is_running_as_admin() {
            log::warn!("应用未以管理员权限运行，驱动级键盘模拟可能无法工作");
            log::warn!("建议：以管理员权限运行以启用完整的键盘模拟功能");
        } else {
            log::info!("管理员权限检测: 已获得");
        }
    }

    // 检测系统语言
    let is_zh = get_system_lang().starts_with("zh");
    log::info!("is_zh = {}", is_zh);

    // 构建并运行 Tauri 应用
    tauri::Builder::default()
        // 注册 shell 插件（用于打开 URL 等）
        .plugin(tauri_plugin_shell::init())
        // 注册 dialog 插件（用于文件选择对话框）
        .plugin(tauri_plugin_dialog::init())
        // 注册 MCP 桥接插件
        .plugin(tauri_plugin_mcp_bridge::init())
        // 管理应用状态
        .manage(AppState::default())
        // 管理播放控制状态
        .manage(PlayerControl::default())
        // 应用初始化设置
        .setup(move |app| {
            // 根据语言生成菜单
            let menu = if is_zh {
                let app_name = "无限暖暖自动演奏";
                tauri::menu::Menu::with_items(
                    app,
                    &[
                        // 应用菜单
                        &tauri::menu::Submenu::with_items(
                            app,
                            app_name,
                            true,
                            &[
                                &tauri::menu::MenuItem::with_id(
                                    app,
                                    "quit",
                                    &format!("退出 {app_name}"),
                                    true,
                                    None::<&str>,
                                )?,
                            ],
                        )?,
                        // 帮助菜单
                        &tauri::menu::Submenu::with_items(
                            app,
                            "帮助",
                            true,
                            &[
                                &tauri::menu::MenuItem::with_id(
                                    app,
                                    "help_about",
                                    &format!("关于 {app_name}"),
                                    true,
                                    None::<&str>,
                                )?,
                            ],
                        )?,
                    ],
                )?
            } else {
                // 英文菜单
                tauri::menu::Menu::with_items(
                    app,
                    &[
                        &tauri::menu::Submenu::with_items(
                            app,
                            "InfinityNikkiPlayer",
                            true,
                            &[
                                &tauri::menu::MenuItem::with_id(
                                    app,
                                    "quit",
                                    "Quit InfinityNikkiPlayer",
                                    true,
                                    None::<&str>,
                                )?,
                            ],
                        )?,
                        &tauri::menu::Submenu::with_items(
                            app,
                            "Help",
                            true,
                            &[
                                &tauri::menu::MenuItem::with_id(
                                    app,
                                    "help_about",
                                    "About InfinityNikkiPlayer",
                                    true,
                                    None::<&str>,
                                )?,
                            ],
                        )?,
                    ],
                )?
            };

            // 设置应用菜单
            app.set_menu(menu)?;

            // 动态设置窗口标题
            let window_title = if is_zh {
                "无限暖暖自动演奏"
            } else {
                "InfinityNikkiPlayer"
            };
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
                    "help_about" => {
                        // 显示关于对话框
                        let _ = app_handle.emit("show_about", ());
                    }
                    _ => {}
                }
            });

            // 将打包的默认 MIDI 文件复制到用户库（仅首次）
            seed_bundled_midi(app);

            log::info!("App setup complete");
            Ok(())
        })
        // 注册所有 Tauri 命令
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_system_locale,
            commands::open_url,
            commands::midi::parse_midi_file,
            commands::midi::extract_melody,
            commands::midi::extract_all_notes,
            commands::midi::scan_folder,
            commands::midi::read_midi_data,
            commands::midi::import_midi,
            commands::midi::import_midi_buffer,
            commands::midi::get_midi_library,
            commands::midi::delete_midi_from_library,
            commands::midi::load_midi_config,
            commands::midi::save_midi_config,
            commands::player::start_playback,
            commands::player::pause_playback,
            commands::player::resume_playback,
            commands::player::stop_playback,
            commands::player::get_playback_state,
            commands::player::set_speed,
            commands::keyboard::get_key_logs,
            commands::keyboard::clear_key_logs,
            commands::keyboard::simulate_key_down,
            commands::keyboard::simulate_key_up,
            commands::window::enter_overlay_mode,
            commands::window::exit_overlay_mode,
            commands::templates::get_templates,
            commands::templates::save_template,
            commands::templates::delete_template,
            commands::templates::import_template,
            commands::templates::rename_template,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::check_accessibility,
            commands::open_accessibility_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
