//! @fileOverview 应用数据类型定义模块
//!
//! 定义所有跨模块共享的数据结构

use serde::{Deserialize, Serialize};

// ============================================================================
// MIDI 相关类型
// ============================================================================

/// MIDI 文件基本信息
///
/// 包含文件的元数据和所有音符事件
///
/// # Fields
///
/// * `filename` - 文件名
/// * `file_path` - 文件完整路径
/// * `duration_ms` - 时长（毫秒）
/// * `track_count` - 音轨数量
/// * `ticks_per_beat` - 每拍的 tick 数
/// * `tempo` - 速度（微秒每拍）
/// * `events` - 音符事件列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiInfo {
    /// 文件名
    pub filename: String,
    /// 文件完整路径
    pub file_path: String,
    /// 时长（毫秒）
    pub duration_ms: u64,
    /// 音轨数量
    pub track_count: usize,
    /// 每拍的 tick 数
    pub ticks_per_beat: u16,
    /// 速度（微秒每拍）
    pub tempo: u32,
    /// 音符事件列表
    pub events: Vec<NoteEvent>,
}

/// MIDI 音符事件
///
/// 表示一个音符的开始和结束
///
/// # Fields
///
/// * `pitch` - 音高 (0-127)
/// * `velocity` - 力度 (0-127)
/// * `start_tick` - 起始 tick
/// * `end_tick` - 结束 tick
/// * `channel` - MIDI 通道 (0-15)
/// * `track` - 音轨索引
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteEvent {
    /// 音高 (0-127)
    pub pitch: u8,
    /// 力度 (0-127)
    pub velocity: u8,
    /// 起始 tick
    pub start_tick: u32,
    /// 结束 tick
    pub end_tick: u32,
    /// MIDI 通道 (0-15)
    pub channel: u8,
    /// 音轨索引
    pub track: u8,
}

/// 提取后的旋律事件
///
/// 用于播放的时间解析后的事件
///
/// # Fields
///
/// * `pitch` - 音高 (0-127)
/// * `pitch_name` - 音高名称（如 "C4"）
/// * `velocity` - 力度 (0-127)
/// * `start_ms` - 开始时间（毫秒）
/// * `duration_ms` - 持续时间（毫秒）
/// * `track` - 音轨索引
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MelodyEvent {
    /// 音高 (0-127)
    pub pitch: u8,
    /// 音高名称
    pub pitch_name: String,
    /// 力度 (0-127)
    pub velocity: u8,
    /// 开始时间（毫秒）
    pub start_ms: u64,
    /// 持续时间（毫秒）
    pub duration_ms: u64,
    /// 音轨索引
    pub track: u8,
}

// ============================================================================
// 按键日志
// ============================================================================

/// 按键日志条目
///
/// 记录一次按键的按下或释放
///
/// # Fields
///
/// * `id` - 日志 ID
/// * `timestamp` - 时间戳（毫秒）
/// * `pitch` - MIDI 音高
/// * `pitch_name` - 音高名称
/// * `mapped_key` - 映射的键盘按键
/// * `velocity` - 力度
/// * `action` - 动作 ("press" | "release")
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyLogEntry {
    /// 日志 ID
    pub id: u64,
    /// 时间戳（毫秒，Unix epoch）
    pub timestamp: u64,
    /// MIDI 音高
    pub pitch: u8,
    /// 音高名称
    pub pitch_name: String,
    /// 映射的键盘按键
    pub mapped_key: String,
    /// 力度
    pub velocity: u8,
    /// 动作：按下或释放
    pub action: String,
}

// ============================================================================
// 播放状态
// ============================================================================

/// 播放状态枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    /// 空闲状态
    Idle,
    /// 正在播放
    Playing,
    /// 已暂停
    Paused,
}

/// 播放状态结构
///
/// # Fields
///
/// * `status` - 当前状态
/// * `midi_name` - 当前 MIDI 文件名
/// * `current_tick` - 当前 tick 位置
/// * `speed` - 播放速度倍率
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackState {
    /// 当前状态
    pub status: PlaybackStatus,
    /// 当前 MIDI 文件名
    pub midi_name: Option<String>,
    /// 当前 tick 位置
    pub current_tick: u32,
    /// 播放速度倍率
    pub speed: f64,
}

// ============================================================================
// 键盘模板
// ============================================================================

/// 键盘模板
///
/// 定义一组音高到键盘按键的映射
///
/// # Fields
///
/// * `id` - 模板 ID
/// * `name` - 显示名称
/// * `is_builtin` - 是否为内置模板
/// * `mappings` - 映射列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyTemplate {
    /// 模板 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 是否为内置模板
    pub is_builtin: bool,
    /// 音高到按键的映射列表
    pub mappings: Vec<KeyMapping>,
}

/// 键位映射
///
/// 表示一个音高对应一个键盘按键
///
/// # Fields
///
/// * `pitch` - MIDI 音高 (0-127)
/// * `key` - 键盘按键名称
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyMapping {
    /// MIDI 音高 (0-127)
    pub pitch: u8,
    /// 键盘按键名称
    pub key: String,
}

// ============================================================================
// 应用状态
// ============================================================================

/// 应用全局状态
///
/// 用于跨命令共享数据
///
/// # Fields
///
/// * `playback` - 播放状态
/// * `key_logs` - 按键日志
pub struct AppState {
    /// 播放状态
    pub playback: parking_lot::Mutex<PlaybackState>,
    /// 按键日志（线程安全）
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
