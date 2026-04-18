//! @fileOverview MIDI 文件解析模块
//!
//! 提供 MIDI 文件解析和音符名称转换功能

use crate::types::{MidiInfo, NoteEvent};
use midly::{MidiMessage, MetaMessage, Smf, TrackEventKind};
use std::path::Path;

/// 解析 MIDI 文件
///
/// 读取文件并解析为 MidiInfo 和音符事件列表
///
/// # Arguments
///
/// * `path` - MIDI 文件路径
///
/// # Returns
///
/// 元组 (MidiInfo, Vec<NoteEvent>>)
///
/// # Errors
///
/// 文件不存在或格式错误时返回错误
///
/// # Processing
///
/// 1. 解析 SMF 格式
/// 2. 遍历所有轨道提取 NoteOn/NoteOff 事件
/// 3. 计算音符的起始和结束 tick
/// 4. 提取 tempo 事件用于计算时长
pub fn parse_midi_file(path: &str) -> Result<(MidiInfo, Vec<NoteEvent>), String> {
    let path = Path::new(path);

    // 从路径提取文件名
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // 读取文件
    let data = std::fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 解析 SMF
    let smf = Smf::parse(&data).map_err(|e| format!("解析 MIDI 失败: {}", e))?;

    // 获取每拍 tick 数
    let ticks_per_beat = match smf.header.timing {
        midly::Timing::Metrical(tpb) => tpb.as_int(),
        midly::Timing::Timecode(_fps, subdivisions) => {
            log::warn!("SMPTE timing, subdivisions: {}", subdivisions);
            480 // 回退到默认 480
        }
    };
    let track_count = smf.tracks.len();

    let mut events = Vec::new();
    let mut current_tick: u32 = 0;
    let mut tempo = 500000u32; // 默认 120 BPM

    // 遍历所有轨道
    for (track_idx, track) in smf.tracks.iter().enumerate() {
        let mut track_tick: u32 = 0;
        for event in track {
            // 累加 delta tick
            track_tick += event.delta.as_int() as u32;

            match event.kind {
                TrackEventKind::Midi { channel, message } => {
                    match message {
                        // Note On 事件（力度 > 0）
                        MidiMessage::NoteOn { key: note, vel } => {
                            if vel.as_int() > 0 {
                                events.push(NoteEvent {
                                    pitch: note.as_int() as u8,
                                    velocity: vel.as_int() as u8,
                                    start_tick: track_tick,
                                    end_tick: 0, // 暂时未知，等待 NoteOff
                                    channel: channel.as_int() as u8,
                                    track: track_idx as u8,
                                });
                            } else {
                                // 力度为 0 等同于 NoteOff
                                if let Some(idx) = events.iter().rposition(|e| {
                                    e.pitch == note.as_int() as u8
                                        && e.channel == channel.as_int() as u8
                                        && e.track == track_idx as u8
                                        && e.end_tick == 0
                                }) {
                                    events[idx].end_tick = track_tick;
                                }
                            }
                        }
                        // Note Off 事件
                        MidiMessage::NoteOff { key: note, .. } => {
                            if let Some(idx) = events.iter().rposition(|e| {
                                e.pitch == note.as_int() as u8
                                    && e.channel == channel.as_int() as u8
                                    && e.track == track_idx as u8
                                    && e.end_tick == 0
                            }) {
                                events[idx].end_tick = track_tick;
                            }
                        }
                        _ => {}
                    }
                }
                // Tempo 事件
                TrackEventKind::Meta(MetaMessage::Tempo(t)) => {
                    tempo = t.as_int();
                }
                _ => {}
            }
            current_tick = current_tick.max(track_tick);
        }
    }

    // 处理没有对应 NoteOff 的 NoteOn
    for event in &mut events {
        if event.end_tick == 0 {
            event.end_tick = current_tick;
        }
    }

    // 计算总时长（毫秒）
    let duration_ms = (current_tick as f64 / ticks_per_beat as f64) * (tempo as f64 / 1000.0);

    // 构建 MIDI 信息
    let info = MidiInfo {
        filename,
        file_path: path.display().to_string(),
        duration_ms: duration_ms as u64,
        track_count,
        ticks_per_beat,
        tempo,
        events: events.clone(),
    };

    Ok((info, events))
}

/// 将 MIDI 音符号转换为音符名称
///
/// 例如：60 -> "C4"，69 -> "A4"
///
/// # Arguments
///
/// * `pitch` - MIDI 音符号 (0-127)
///
/// # Returns
///
/// 音符名称字符串（如 "C4"、"F#5"）
pub fn pitch_to_name(pitch: u8) -> String {
    const NOTES: [&str; 12] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    let octave = (pitch / 12) as i32 - 1;
    let note = NOTES[(pitch % 12) as usize];
    format!("{}{}", note, octave)
}
