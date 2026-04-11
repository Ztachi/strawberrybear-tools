use serde::{Deserialize, Serialize};

/// MIDI 文件基本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiInfo {
    pub filename: String,
    pub file_path: String, // 文件完整路径
    pub duration_ms: u64,
    pub track_count: usize,
    pub ticks_per_beat: u16,
    pub tempo: u32, // 微秒每拍
    pub events: Vec<NoteEvent>,
}

/// MIDI 音符事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteEvent {
    pub pitch: u8,
    pub velocity: u8,
    pub start_tick: u32,
    pub end_tick: u32,
    pub channel: u8,
    pub track: u8, // 音轨索引
}

/// 提取后的旋律事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MelodyEvent {
    pub pitch: u8,
    pub pitch_name: String,
    pub velocity: u8,
    pub start_ms: u64,
    pub duration_ms: u64,
}

/// 按键日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyLogEntry {
    pub id: u64,
    pub timestamp: u64,
    pub pitch: u8,
    pub pitch_name: String,
    pub mapped_key: String,
    pub velocity: u8,
    pub action: String,
}

/// 播放状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    Idle,
    Playing,
    Paused,
}

/// 播放状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackState {
    pub status: PlaybackStatus,
    pub midi_name: Option<String>,
    pub current_tick: u32,
    pub speed: f64,
}

/// 映射模板
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyTemplate {
    pub id: String,
    pub name: String,
    pub is_builtin: bool,
    pub mappings: Vec<KeyMapping>,
}

/// 键位映射
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyMapping {
    pub pitch: u8,
    pub key: String,
}

/// 应用状态
pub struct AppState {
    pub playback: parking_lot::Mutex<PlaybackState>,
    pub key_logs: std::sync::Arc<parking_lot::Mutex<Vec<KeyLogEntry>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            playback: parking_lot::Mutex::new(PlaybackState {
                status: PlaybackStatus::Idle,
                midi_name: None,
                current_tick: 0,
                speed: 1.0,
            }),
            key_logs: std::sync::Arc::new(parking_lot::Mutex::new(Vec::new())),
        }
    }
}
