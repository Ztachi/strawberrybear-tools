use crate::types::{MidiInfo, NoteEvent};
use midly::{MidiMessage, MetaMessage, Smf, TrackEventKind};
use std::path::Path;

pub fn parse_midi_file(path: &str) -> Result<(MidiInfo, Vec<NoteEvent>), String> {
    let path = Path::new(path);
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let data = std::fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;
    let smf = Smf::parse(&data).map_err(|e| format!("解析 MIDI 失败: {}", e))?;

    let ticks_per_beat = match smf.header.timing {
        midly::Timing::Metrical(tpb) => tpb.as_int(),
        midly::Timing::Timecode(_fps, subdivisions) => {
            log::warn!("SMPTE timing, subdivisions: {}", subdivisions);
            480
        }
    };
    let track_count = smf.tracks.len();

    let mut events = Vec::new();
    let mut current_tick: u32 = 0;
    let mut tempo = 500000u32;

    for track in &smf.tracks {
        let mut track_tick: u32 = 0;
        for event in track {
            track_tick += event.delta.as_int() as u32;
            match event.kind {
                TrackEventKind::Midi { channel, message } => {
                    match message {
                        MidiMessage::NoteOn { key: note, vel } => {
                            if vel.as_int() > 0 {
                                events.push(NoteEvent {
                                    pitch: note.as_int() as u8,
                                    velocity: vel.as_int() as u8,
                                    start_tick: track_tick,
                                    end_tick: 0,
                                    channel: channel.as_int() as u8,
                                });
                            } else if let Some(idx) = events.iter().rposition(|e| {
                                e.pitch == note.as_int() as u8
                                    && e.channel == channel.as_int() as u8
                                    && e.end_tick == 0
                            }) {
                                events[idx].end_tick = track_tick;
                            }
                        }
                        MidiMessage::NoteOff { key: note, .. } => {
                            if let Some(idx) = events.iter().rposition(|e| {
                                e.pitch == note.as_int() as u8
                                    && e.channel == channel.as_int() as u8
                                    && e.end_tick == 0
                            }) {
                                events[idx].end_tick = track_tick;
                            }
                        }
                        _ => {}
                    }
                }
                TrackEventKind::Meta(MetaMessage::Tempo(t)) => {
                    tempo = t.as_int();
                }
                _ => {}
            }
            current_tick = current_tick.max(track_tick);
        }
    }

    for event in &mut events {
        if event.end_tick == 0 {
            event.end_tick = current_tick;
        }
    }

    let duration_ms = (current_tick as f64 / ticks_per_beat as f64) * (tempo as f64 / 1000.0);

    let info = MidiInfo {
        filename,
        duration_ms: duration_ms as u64,
        track_count,
        ticks_per_beat,
    };

    Ok((info, events))
}

pub fn pitch_to_name(pitch: u8) -> String {
    const NOTES: [&str; 12] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    let octave = (pitch / 12) as i32 - 1;
    let note = NOTES[(pitch % 12) as usize];
    format!("{}{}", note, octave)
}
