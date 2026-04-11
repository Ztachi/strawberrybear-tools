use crate::midi::parser::pitch_to_name;
use crate::types::{MelodyEvent, NoteEvent};
use std::collections::BTreeMap;

/// 从 NoteEvent 列表中提取单旋律
/// 策略：每个时刻只保留最高音，忽略鼓轨（channel 9）
pub fn extract_melody(events: &[NoteEvent], ticks_per_beat: u16, tempo: u64) -> Vec<MelodyEvent> {
    // 按 start_tick 分组
    let mut tick_groups: BTreeMap<u32, Vec<&NoteEvent>> = BTreeMap::new();
    for event in events {
        // 跳过鼓轨 (channel 9)
        if event.channel == 9 {
            continue;
        }
        tick_groups.entry(event.start_tick).or_default().push(event);
    }

    let mut melody = Vec::new();

    for (tick, group) in tick_groups {
        // 取最高音
        let highest = group.iter().max_by_key(|e| e.pitch);
        if let Some(e) = highest {
            let start_ms = tick_to_ms(tick, ticks_per_beat, tempo);
            let duration_ms = tick_to_ms(e.end_tick - e.start_tick, ticks_per_beat, tempo);

            melody.push(MelodyEvent {
                pitch: e.pitch,
                pitch_name: pitch_to_name(e.pitch),
                velocity: e.velocity,
                start_ms,
                duration_ms,
                track: 0, // 单旋律不保留音轨信息
            });
        }
    }

    melody.sort_by_key(|e| e.start_ms);
    melody
}

/// 从 NoteEvent 列表中提取所有音符（用于键盘映射）
/// 保留所有音轨的音符，仅跳过鼓轨
pub fn extract_all_notes(events: &[NoteEvent], ticks_per_beat: u16, tempo: u64) -> Vec<MelodyEvent> {
    let mut notes = Vec::new();

    for event in events {
        // 跳过鼓轨 (channel 9)
        if event.channel == 9 {
            continue;
        }

        let start_ms = tick_to_ms(event.start_tick, ticks_per_beat, tempo);
        let duration_ms = tick_to_ms(event.end_tick - event.start_tick, ticks_per_beat, tempo);

        notes.push(MelodyEvent {
            pitch: event.pitch,
            pitch_name: pitch_to_name(event.pitch),
            velocity: event.velocity,
            start_ms,
            duration_ms,
            track: event.track,
        });
    }

    notes.sort_by_key(|e| e.start_ms);
    notes
}

/// tick 转换为毫秒
fn tick_to_ms(tick: u32, ticks_per_beat: u16, tempo: u64) -> u64 {
    let ticks_per_ms = (ticks_per_beat as f64 * 1000.0) / (tempo as f64);
    (tick as f64 / ticks_per_ms) as u64
}
