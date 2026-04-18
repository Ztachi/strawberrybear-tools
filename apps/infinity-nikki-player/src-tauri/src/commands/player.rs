//! @fileOverview 播放控制命令模块
//!
//! 提供游戏内演奏的播放控制功能，包括开始、暂停、恢复、停止等

use crate::midi::parser::pitch_to_name;
use crate::types::{KeyLogEntry, KeyMapping, MelodyEvent, PlaybackState, PlaybackStatus};
use crate::AppState;
use parking_lot::Mutex;
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

/// 播放控制状态
///
/// 使用 Arc<Mutex<>> 实现线程安全的可共享状态
pub struct PlayerControl {
    /// 是否正在播放
    pub is_playing: Arc<Mutex<bool>>,
    /// 是否暂停
    pub is_paused: Arc<Mutex<bool>>,
    /// 是否请求停止
    pub should_stop: Arc<Mutex<bool>>,
    /// 当前播放位置（tick）
    pub current_tick: Arc<Mutex<u32>>,
    /// 播放速度倍率
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

/// 开始播放
///
/// 在后台线程中执行播放，使用模板映射进行按键模拟
///
/// # Arguments
///
/// * `state` - 应用状态（包含日志等）
/// * `player` - 播放控制状态
/// * `midi_path` - MIDI 文件路径
/// * `melody` - 旋律事件列表
/// * `template` - 键盘映射模板
/// * `speed` - 播放速度倍率
///
/// # Returns
///
/// 成功返回 Ok(())，需要权限或创建模拟器失败返回错误
///
/// # Platform
///
/// macOS 需要辅助功能权限
#[tauri::command]
pub async fn start_playback(
    state: State<'_, AppState>,
    player: State<'_, PlayerControl>,
    midi_path: String,
    melody: Vec<MelodyEvent>,
    template: Vec<KeyMapping>,
    speed: f64,
) -> Result<(), String> {
    // macOS 需要辅助功能权限
    #[cfg(target_os = "macos")]
    {
        if !crate::commands::check_accessibility_impl() {
            return Err("需要辅助功能权限才能模拟按键".to_string());
        }
    }

    // 初始化播放状态
    *player.is_playing.lock() = true;
    *player.is_paused.lock() = false;
    *player.should_stop.lock() = false;
    *player.speed.lock() = speed;

    // 更新全局播放状态
    {
        let mut playback = state.playback.lock();
        playback.status = PlaybackStatus::Playing;
        // 从路径中提取文件名
        playback.midi_name = Some(
            std::path::Path::new(&midi_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string(),
        );
        playback.speed = speed;
    }

    // 克隆引用供线程使用
    let is_paused = player.is_paused.clone();
    let should_stop = player.should_stop.clone();
    let current_tick = player.current_tick.clone();
    let is_playing = player.is_playing.clone();
    let logs = state.key_logs.clone();

    // 在阻塞线程中运行（使用 thread scope，Enigo 在线程内创建）
    std::thread::scope(|s| {
        s.spawn(|| {
            // 在线程内部创建 Enigo 键盘模拟器
            let simulator = match crate::keyboard::KeySimulator::new() {
                Ok(sim) => sim,
                Err(e) => {
                    log::error!("创建键盘模拟器失败: {}", e);
                    *is_playing.lock() = false;
                    return;
                }
            };

            let mut last_time = std::time::Instant::now();

            // 遍历旋律事件，按时间顺序执行按键
            for event in &melody {
                // 检查停止请求
                if *should_stop.lock() {
                    break;
                }

                // 等待暂停解除
                while *is_paused.lock() {
                    if *should_stop.lock() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }

                // 计算并等待下一个音符的延迟
                let delay_ms = ((event.start_ms as f64 / speed) as u64)
                    .saturating_sub(last_time.elapsed().as_millis() as u64);
                if delay_ms > 0 {
                    std::thread::sleep(Duration::from_millis(delay_ms));
                }
                last_time = std::time::Instant::now();

                // 查找该音高对应的键盘映射
                if let Some(mapping) = template.iter().find(|m| m.pitch == event.pitch) {
                    // 按下按键
                    simulator.press_key_sync(event.pitch, mapping);
                    *current_tick.lock() = event.start_ms as u32;

                    // 记录按键日志
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
                        // 保持最多 50 条日志
                        if logs_guard.len() > 50 {
                            logs_guard.remove(0);
                        }
                    }

                    // 等待音符时长
                    let duration_ms = (event.duration_ms as f64 / speed) as u64;
                    std::thread::sleep(Duration::from_millis(duration_ms.max(50)));

                    // 释放按键
                    simulator.release_key_sync(event.pitch, mapping);

                    // 记录释放日志
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

            // 播放结束
            *is_playing.lock() = false;
        });
    });

    // 重置播放状态
    {
        let mut playback = state.playback.lock();
        playback.status = PlaybackStatus::Idle;
        playback.current_tick = 0;
    }

    Ok(())
}

/// 暂停播放
///
/// # Arguments
///
/// * `player` - 播放控制状态
///
/// # Returns
///
/// 成功返回 Ok(())
#[tauri::command]
pub fn pause_playback(player: State<'_, PlayerControl>) -> Result<(), String> {
    *player.is_paused.lock() = true;
    Ok(())
}

/// 恢复播放
///
/// # Arguments
///
/// * `player` - 播放控制状态
///
/// # Returns
///
/// 成功返回 Ok(())
#[tauri::command]
pub fn resume_playback(player: State<'_, PlayerControl>) -> Result<(), String> {
    *player.is_paused.lock() = false;
    Ok(())
}

/// 停止播放
///
/// # Arguments
///
/// * `player` - 播放控制状态
/// * `state` - 应用状态
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Notes
///
/// 设置 should_stop 标志，播放线程会在下一个检查点退出
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

/// 获取播放状态
///
/// # Arguments
///
/// * `state` - 应用状态
///
/// # Returns
///
/// 当前播放状态的克隆
#[tauri::command]
pub fn get_playback_state(state: State<'_, AppState>) -> PlaybackState {
    state.playback.lock().clone()
}

/// 设置播放速度
///
/// # Arguments
///
/// * `player` - 播放控制状态
/// * `speed` - 新的速度倍率
///
/// # Returns
///
/// 成功返回 Ok(())
#[tauri::command]
pub fn set_speed(player: State<'_, PlayerControl>, speed: f64) -> Result<(), String> {
    *player.speed.lock() = speed;
    Ok(())
}
