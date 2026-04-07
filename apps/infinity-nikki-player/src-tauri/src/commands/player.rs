use crate::midi::parser::pitch_to_name;
use crate::types::{KeyLogEntry, KeyMapping, MelodyEvent, PlaybackState, PlaybackStatus};
use crate::AppState;
use parking_lot::Mutex;
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

pub struct PlayerControl {
    pub is_playing: Arc<Mutex<bool>>,
    pub is_paused: Arc<Mutex<bool>>,
    pub should_stop: Arc<Mutex<bool>>,
    pub current_tick: Arc<Mutex<u32>>,
    pub speed: Arc<Mutex<f64>>,
}

impl Default for PlayerControl {
    fn default() -> Self {
        Self {
            is_playing: Arc::new(Mutex::new(false)),
            is_paused: Arc::new(Mutex::new(false)),
            should_stop: Arc::new(Mutex::new(false)),
            current_tick: Arc::new(Mutex::new(0)),
            speed: Arc::new(Mutex::new(1.0)),
        }
    }
}

#[tauri::command]
pub async fn start_playback(
    state: State<'_, AppState>,
    player: State<'_, PlayerControl>,
    midi_path: String,
    melody: Vec<MelodyEvent>,
    template: Vec<KeyMapping>,
    speed: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if !crate::commands::check_accessibility_impl() {
            return Err("需要辅助功能权限才能模拟按键".to_string());
        }
    }

    *player.is_playing.lock() = true;
    *player.is_paused.lock() = false;
    *player.should_stop.lock() = false;
    *player.speed.lock() = speed;

    {
        let mut playback = state.playback.lock();
        playback.status = PlaybackStatus::Playing;
        playback.midi_name = Some(
            std::path::Path::new(&midi_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string(),
        );
        playback.speed = speed;
    }

    let is_paused = player.is_paused.clone();
    let should_stop = player.should_stop.clone();
    let current_tick = player.current_tick.clone();
    let is_playing = player.is_playing.clone();
    let logs = state.key_logs.clone();

    // 在阻塞线程中运行（使用 thread scope，Enigo 在线程内创建）
    std::thread::scope(|s| {
        s.spawn(|| {
            // 在线程内部创建 Enigo，避免 Send/Sync 问题
            let simulator = match crate::keyboard::KeySimulator::new() {
                Ok(sim) => sim,
                Err(e) => {
                    log::error!("创建键盘模拟器失败: {}", e);
                    *is_playing.lock() = false;
                    return;
                }
            };

            let _tempo = 500000u64;
            let mut last_time = std::time::Instant::now();

            for event in &melody {
                if *should_stop.lock() {
                    break;
                }

                while *is_paused.lock() {
                    if *should_stop.lock() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }

                let delay_ms = ((event.start_ms as f64 / speed) as u64)
                    .saturating_sub(last_time.elapsed().as_millis() as u64);
                if delay_ms > 0 {
                    std::thread::sleep(Duration::from_millis(delay_ms));
                }
                last_time = std::time::Instant::now();

                if let Some(mapping) = template.iter().find(|m| m.pitch == event.pitch) {
                    simulator.press_key_sync(event.pitch, mapping);
                    *current_tick.lock() = event.start_ms as u32;

                    {
                        let mut logs_guard = logs.lock();
                        let entry = KeyLogEntry {
                            id: logs_guard.len() as u64,
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                            pitch: event.pitch,
                            pitch_name: pitch_to_name(event.pitch),
                            mapped_key: mapping.key.clone(),
                            velocity: event.velocity,
                            action: "press".to_string(),
                        };
                        logs_guard.push(entry);
                        if logs_guard.len() > 50 {
                            logs_guard.remove(0);
                        }
                    }

                    let duration_ms = (event.duration_ms as f64 / speed) as u64;
                    std::thread::sleep(Duration::from_millis(duration_ms.max(50)));

                    simulator.release_key_sync(event.pitch, mapping);

                    {
                        let mut logs_guard = logs.lock();
                        let entry = KeyLogEntry {
                            id: logs_guard.len() as u64,
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                            pitch: event.pitch,
                            pitch_name: pitch_to_name(event.pitch),
                            mapped_key: mapping.key.clone(),
                            velocity: event.velocity,
                            action: "release".to_string(),
                        };
                        logs_guard.push(entry);
                        if logs_guard.len() > 50 {
                            logs_guard.remove(0);
                        }
                    }
                }
            }

            *is_playing.lock() = false;
        });
    });

    {
        let mut playback = state.playback.lock();
        playback.status = PlaybackStatus::Idle;
        playback.current_tick = 0;
    }

    Ok(())
}

#[tauri::command]
pub fn pause_playback(player: State<'_, PlayerControl>) -> Result<(), String> {
    *player.is_paused.lock() = true;
    Ok(())
}

#[tauri::command]
pub fn resume_playback(player: State<'_, PlayerControl>) -> Result<(), String> {
    *player.is_paused.lock() = false;
    Ok(())
}

#[tauri::command]
pub fn stop_playback(player: State<'_, PlayerControl>, state: State<'_, AppState>) -> Result<(), String> {
    *player.should_stop.lock() = true;
    *player.is_paused.lock() = false;
    {
        let mut playback = state.playback.lock();
        playback.status = PlaybackStatus::Idle;
        playback.current_tick = 0;
    }
    Ok(())
}

#[tauri::command]
pub fn get_playback_state(state: State<'_, AppState>) -> PlaybackState {
    state.playback.lock().clone()
}

#[tauri::command]
pub fn set_speed(player: State<'_, PlayerControl>, speed: f64) -> Result<(), String> {
    *player.speed.lock() = speed;
    Ok(())
}
