mod commands;
mod midi;
mod keyboard;
mod types;

use commands::player::PlayerControl;
use types::AppState;

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    log::info!("Starting InfinityNikkiPlayer...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_mcp_bridge::init())
        .manage(AppState::default())
        .manage(PlayerControl::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::midi::parse_midi_file,
            commands::midi::extract_melody,
            commands::midi::scan_folder,
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
        .setup(|app| {
            log::info!("App setup complete");
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
