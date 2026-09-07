//! @fileOverview MIDI 文件解析模块
//!
//! 提供 MIDI 文件解析、时间轴元数据和音符名称转换功能。

use crate::midi::melody::extract_melody;
use crate::types::{MidiInfo, MidiTrackInfo, NoteEvent, TempoPoint, TimeSignaturePoint};
use midly::{MetaMessage, MidiMessage, Smf, TrackEventKind};
use std::collections::HashMap;
use std::path::Path;

/// 解析 MIDI 文件。
pub fn parse_midi_file(path: &str) -> Result<(MidiInfo, Vec<NoteEvent>), String> {
    let path = Path::new(path);
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string();
    let data = std::fs::read(path).map_err(|error| format!("读取文件失败: {}", error))?;
    let smf = Smf::parse(&data).map_err(|error| format!("解析 MIDI 失败: {}", error))?;

    // format 2 各轨是独立歌曲，SMPTE 以帧计时；不能伪装为同一拍子时间轴。
    if smf.header.format == midly::Format::Sequential {
        return Err(
            "暂不支持 MIDI Format 2 独立序列；请转换为共享时间轴的 Format 0 或 Format 1 文件"
                .to_string(),
        );
    }
    let ticks_per_beat = match smf.header.timing {
        midly::Timing::Metrical(ticks) if ticks.as_int() > 0 => ticks.as_int(),
        midly::Timing::Metrical(_) => return Err("MIDI 每拍 tick 数必须大于 0".to_string()),
        midly::Timing::Timecode(_, _) => {
            return Err("暂不支持 SMPTE 帧计时；请转换为每拍 tick 计时的 MIDI 文件".to_string());
        }
    };
    let track_count = smf.tracks.len();
    let mut events = Vec::new();
    let mut current_tick = 0u32;
    // 旧 tempo 字段保持遍历中最后一次 tempo 值；精准试听只使用新 tempo_map。
    let mut legacy_tempo = 500000u32;
    let mut tempo_points = Vec::new();
    let mut time_signature_points = Vec::new();
    let mut tracks = Vec::with_capacity(track_count);

    for (track_idx, track) in smf.tracks.iter().enumerate() {
        let mut track_tick = 0u32;
        let mut track_name = String::new();
        let mut first_channel = None;
        let mut is_percussion = false;
        let mut note_count = 0usize;
        // 同一音高允许重叠，使用栈保证 NoteOff 关闭最近的 NoteOn。
        let mut open_notes: HashMap<(u8, u8), Vec<usize>> = HashMap::new();

        for event in track {
            track_tick = track_tick.saturating_add(event.delta.as_int() as u32);
            current_tick = current_tick.max(track_tick);

            match event.kind {
                TrackEventKind::Midi { channel, message } => {
                    let channel = channel.as_int() as u8;
                    first_channel.get_or_insert(channel);
                    is_percussion |= channel == 9;

                    match message {
                        MidiMessage::NoteOn { key, vel } if vel.as_int() > 0 => {
                            let pitch = key.as_int() as u8;
                            let id = format!("note-{}-{}-{}", track_idx, channel, note_count);
                            note_count += 1;
                            events.push(NoteEvent {
                                id,
                                pitch,
                                velocity: vel.as_int() as u8,
                                start_tick: track_tick,
                                end_tick: 0,
                                channel,
                                track: track_idx as u8,
                                source_track: Some(track_idx),
                            });
                            open_notes
                                .entry((channel, pitch))
                                .or_default()
                                .push(events.len() - 1);
                        }
                        MidiMessage::NoteOn { key, .. } | MidiMessage::NoteOff { key, .. } => {
                            close_note(
                                &mut events,
                                &mut open_notes,
                                channel,
                                key.as_int() as u8,
                                track_tick,
                            );
                        }
                        _ => {}
                    }
                }
                TrackEventKind::Meta(MetaMessage::TrackName(name)) => {
                    if track_name.is_empty() {
                        track_name = String::from_utf8_lossy(name).trim().to_string();
                    }
                }
                TrackEventKind::Meta(MetaMessage::Tempo(tempo)) => {
                    legacy_tempo = tempo.as_int();
                    tempo_points.push(TempoPoint {
                        tick: track_tick,
                        microseconds_per_quarter: tempo.as_int(),
                    });
                }
                TrackEventKind::Meta(MetaMessage::TimeSignature(
                    numerator,
                    denominator_power,
                    _,
                    _,
                )) => {
                    let denominator = if denominator_power < 8 {
                        1u8 << denominator_power
                    } else {
                        4
                    };
                    time_signature_points.push(TimeSignaturePoint {
                        tick: track_tick,
                        numerator,
                        denominator,
                    });
                }
                _ => {}
            }
        }

        tracks.push(MidiTrackInfo {
            id: format!("track-{}", track_idx),
            index: track_idx,
            name: track_name,
            channel: first_channel,
            is_percussion,
            note_count,
            enabled: true,
        });
    }

    // 缺失 NoteOff 的旧行为以全曲结束 tick 收尾，保持游戏按键提取字段兼容。
    for event in &mut events {
        if event.end_tick == 0 {
            event.end_tick = current_tick;
        }
    }
    normalize_tempo_points(&mut tempo_points);
    normalize_time_signature_points(&mut time_signature_points);
    let tempo = legacy_tempo;
    let duration_ms = ticks_to_millis(current_tick, ticks_per_beat, &tempo_points);
    // 音符提取接口仍使用旧的单 tempo 参数，保证键盘模拟播放协议不变。
    let melody_note_count = extract_melody(&events, ticks_per_beat, tempo as u64).len();

    let info = MidiInfo {
        filename,
        file_path: path.display().to_string(),
        title: None,
        author_name: None,
        description: None,
        online_song_id: None,
        online_sha256: None,
        duration_ms: duration_ms.max(0.0) as u64,
        track_count,
        melody_note_count,
        ticks_per_beat,
        tempo,
        duration_ticks: current_tick,
        tempo_map: tempo_points,
        time_signature_map: time_signature_points,
        tracks,
        events: events.clone(),
    };

    Ok((info, events))
}

/// 关闭指定通道和音高的最近一个未关闭音符。
fn close_note(
    events: &mut [NoteEvent],
    open_notes: &mut HashMap<(u8, u8), Vec<usize>>,
    channel: u8,
    pitch: u8,
    end_tick: u32,
) {
    let key = (channel, pitch);
    let Some(indexes) = open_notes.get_mut(&key) else {
        return;
    };
    let Some(index) = indexes.pop() else { return };
    if let Some(event) = events.get_mut(index) {
        event.end_tick = end_tick;
    }
    if indexes.is_empty() {
        open_notes.remove(&key);
    }
}

fn normalize_tempo_points(points: &mut Vec<TempoPoint>) {
    points.sort_by_key(|point| point.tick);
    if points.first().is_none_or(|point| point.tick != 0) {
        points.insert(
            0,
            TempoPoint {
                tick: 0,
                microseconds_per_quarter: 500000,
            },
        );
    }
}

fn normalize_time_signature_points(points: &mut Vec<TimeSignaturePoint>) {
    points.sort_by_key(|point| point.tick);
    if points.first().is_none_or(|point| point.tick != 0) {
        points.insert(
            0,
            TimeSignaturePoint {
                tick: 0,
                numerator: 4,
                denominator: 4,
            },
        );
    }
}

/// 将绝对 tick 按 tempo map 分段转换为毫秒。
fn ticks_to_millis(tick: u32, ticks_per_beat: u16, tempo_map: &[TempoPoint]) -> f64 {
    if tick == 0 || ticks_per_beat == 0 {
        return 0.0;
    }

    let mut elapsed_ms = 0.0;
    let mut segment_start = 0u32;
    let mut microseconds_per_quarter = 500000u32;

    for point in tempo_map {
        if point.tick > tick {
            break;
        }
        if point.tick > segment_start {
            let segment_ticks = point.tick - segment_start;
            elapsed_ms += segment_ticks as f64 * microseconds_per_quarter as f64
                / (ticks_per_beat as f64 * 1000.0);
            segment_start = point.tick;
        }
        microseconds_per_quarter = point.microseconds_per_quarter;
    }

    if tick > segment_start {
        elapsed_ms += (tick - segment_start) as f64 * microseconds_per_quarter as f64
            / (ticks_per_beat as f64 * 1000.0);
    }
    elapsed_ms
}

/// 将 MIDI 音符号转换为音符名称。
pub fn pitch_to_name(pitch: u8) -> String {
    const NOTES: [&str; 12] = [
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
    ];
    let octave = (pitch / 12) as i32 - 1;
    let note = NOTES[(pitch % 12) as usize];
    format!("{}{}", note, octave)
}

#[cfg(test)]
mod tests {
    use super::{ticks_to_millis, TempoPoint};

    #[test]
    fn preserves_legacy_events_while_adding_complete_timeline() {
        // 轨道 0 含重叠同音高与缺失 NoteOff；轨道 1 的 tempo 和 EOT 延长全曲。
        let first_track: Vec<u8> = vec![
            0, 255, 81, 3, 7, 161, 33, 0, 144, 60, 100, 120, 144, 60, 90, 120, 128, 60, 0, 120,
            128, 60, 0, 120, 144, 64, 80, 0, 255, 47, 0,
        ];
        let second_track: Vec<u8> = vec![135, 64, 255, 81, 3, 5, 22, 21, 135, 64, 255, 47, 0];
        let mut bytes = vec![77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, 2, 1, 224];
        for track in [first_track, second_track] {
            bytes.extend_from_slice(b"MTrk");
            bytes.extend_from_slice(&(track.len() as u32).to_be_bytes());
            bytes.extend_from_slice(&track);
        }
        let path =
            std::env::temp_dir().join(format!("nikki-piano-roll-{}.mid", std::process::id()));
        std::fs::write(&path, bytes).unwrap();
        let (info, events) = super::parse_midi_file(path.to_str().unwrap()).unwrap();
        std::fs::remove_file(path).unwrap();

        let legacy_fields: Vec<_> = events
            .iter()
            .map(|note| {
                (
                    note.pitch,
                    note.velocity,
                    note.start_tick,
                    note.end_tick,
                    note.channel,
                    note.track,
                )
            })
            .collect();
        assert_eq!(
            legacy_fields,
            vec![
                (60, 100, 0, 360, 0, 0),
                (60, 90, 120, 240, 0, 0),
                (64, 80, 480, 1920, 0, 0),
            ]
        );
        assert_eq!(info.tempo, 333333);
        assert_eq!(info.duration_ticks, 1920);
        assert_eq!(info.duration_ms, 1666);
        assert_eq!(info.tracks.len(), 2);
        assert_eq!(info.tracks[1].note_count, 0);
        assert_eq!(info.tempo_map[0].microseconds_per_quarter, 500001);
        assert_eq!(events[0].id, "note-0-0-0");
        assert_eq!(events[1].id, "note-0-0-1");
    }

    /// 使用独立临时文件测试公开解析入口，原样保留 SMF header 的格式与 timing。
    fn parse_fixture(
        format: u8,
        division: [u8; 2],
        tracks: Vec<Vec<u8>>,
    ) -> Result<(crate::types::MidiInfo, Vec<crate::types::NoteEvent>), String> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);
        let mut bytes = vec![77, 84, 104, 100, 0, 0, 0, 6, 0, format];
        bytes.extend_from_slice(&(tracks.len() as u16).to_be_bytes());
        bytes.extend_from_slice(&division);
        for track in tracks {
            bytes.extend_from_slice(b"MTrk");
            bytes.extend_from_slice(&(track.len() as u32).to_be_bytes());
            bytes.extend_from_slice(&track);
        }
        let path = std::env::temp_dir().join(format!(
            "nikki-timeline-fixture-{}-{}.mid",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::write(&path, bytes).unwrap();
        let result = super::parse_midi_file(path.to_str().unwrap());
        std::fs::remove_file(path).unwrap();
        result
    }

    #[test]
    fn retains_full_source_track_without_changing_legacy_track_field() {
        let mut tracks = vec![vec![0, 255, 47, 0]; 256];
        tracks.push(vec![0, 144, 60, 100, 120, 128, 60, 0, 0, 255, 47, 0]);
        let (info, events) = parse_fixture(1, [1, 224], tracks).unwrap();
        assert_eq!(events[0].source_track, Some(256));
        assert_eq!(events[0].track, 0);
        assert_eq!(info.tracks[256].index, 256);
        assert_eq!(events[0].id, "note-256-0-0");
    }

    #[test]
    fn rejects_timing_without_a_supported_shared_beat_axis() {
        let empty_track = vec![vec![0, 255, 47, 0]];
        assert!(parse_fixture(2, [1, 224], empty_track.clone())
            .unwrap_err()
            .contains("Format 2"));
        assert!(parse_fixture(0, [232, 40], empty_track.clone())
            .unwrap_err()
            .contains("SMPTE"));
        assert!(parse_fixture(0, [0, 0], empty_track)
            .unwrap_err()
            .contains("tick"));
    }

    #[test]
    fn converts_ticks_with_constant_tempo() {
        let tempo_map = vec![TempoPoint {
            tick: 0,
            microseconds_per_quarter: 500_000,
        }];
        assert!((ticks_to_millis(480, 480, &tempo_map) - 500.0).abs() < f64::EPSILON);
    }

    #[test]
    fn converts_ticks_across_tempo_changes() {
        let tempo_map = vec![
            TempoPoint {
                tick: 0,
                microseconds_per_quarter: 500_000,
            },
            TempoPoint {
                tick: 480,
                microseconds_per_quarter: 1_000_000,
            },
        ];
        assert!((ticks_to_millis(960, 480, &tempo_map) - 1_500.0).abs() < f64::EPSILON);
    }
}
