use crate::midi::{extract_melody, parse_midi_file};
use crate::types::{MelodyEvent, MidiInfo, NoteEvent};
use std::fs;
use std::path::Path;

/// 解析 MIDI 文件
#[tauri::command]
pub fn parse_midi_file_cmd(path: String) -> Result<(MidiInfo, Vec<NoteEvent>), String> {
    parse_midi_file(&path)
}

/// 提取旋律
#[tauri::command]
pub fn extract_melody_cmd(
    events: Vec<NoteEvent>,
    ticks_per_beat: u16,
    tempo: u64,
) -> Result<Vec<MelodyEvent>, String> {
    Ok(extract_melody(&events, ticks_per_beat, tempo))
}

/// 扫描文件夹中的 MIDI 文件
#[tauri::command]
pub fn scan_folder(folder_path: String) -> Result<Vec<MidiInfo>, String> {
    let path = Path::new(&folder_path);
    if !path.is_dir() {
        return Err("不是有效的文件夹".to_string());
    }

    let mut midi_files = Vec::new();

    for entry in fs::read_dir(path).map_err(|e| format!("读取文件夹失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let file_path = entry.path();

        if file_path.is_file() {
            if let Some(ext) = file_path.extension() {
                if ext.eq_ignore_ascii_case("mid") || ext.eq_ignore_ascii_case("midi") {
                    match parse_midi_file(file_path.to_str().unwrap_or("")) {
                        Ok((info, _)) => midi_files.push(info),
                        Err(e) => log::warn!("解析失败 {}: {}", file_path.display(), e),
                    }
                }
            }
        }
    }

    Ok(midi_files)
}
