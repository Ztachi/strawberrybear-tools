use serde::{Deserialize, Serialize};

/// MIDI 文件基本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiInfo {
    pub filename: String,
    pub duration_ms: u64,
    pub track_count: usize,
    pub ticks_per_beat: u16,
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
    pub templates: parking_lot::Mutex<Vec<KeyTemplate>>,
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
            templates: parking_lot::Mutex::new(get_builtin_templates()),
        }
    }
}

/// 获取内置模板
fn get_builtin_templates() -> Vec<KeyTemplate> {
    vec![
        KeyTemplate {
            id: "piano".to_string(),
            name: "钢琴映射".to_string(),
            is_builtin: true,
            mappings: vec![
                (60, "a"), (61, "w"), (62, "s"), (63, "e"), (64, "d"),
                (65, "f"), (66, "t"), (67, "g"), (68, "y"), (69, "h"),
                (70, "u"), (71, "j"), (72, "k"),
            ].iter().map(|(p, k)| KeyMapping { pitch: *p, key: k.to_string() }).collect(),
        },
        KeyTemplate {
            id: "game".to_string(),
            name: "游戏键位".to_string(),
            is_builtin: true,
            mappings: vec![
                (60, "z"), (62, "x"), (64, "c"), (65, "v"),
                (67, "b"), (69, "n"), (71, "m"),
            ].iter().map(|(p, k)| KeyMapping { pitch: *p, key: k.to_string() }).collect(),
        },
    ]
}
