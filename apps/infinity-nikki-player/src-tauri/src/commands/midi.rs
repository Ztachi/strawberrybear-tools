use crate::midi::{extract_melody as extract_melody_internal, extract_all_notes as extract_all_notes_internal, parse_midi_file as parse_midi_internal};
use crate::types::{MelodyEvent, MidiInfo, NoteEvent};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// MIDI 文件配置（包含基本信息、时长和音轨禁用状态）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiConfig {
    pub filename: String,
    pub duration_ms: u64, // 计算出的准确时长
    pub track_count: usize,
    pub melody_note_count: usize, // 旋律音符数
    pub ticks_per_beat: u16,
    pub tempo: u32,
    pub disabled_tracks: Vec<u8>, // 禁用的音轨索引列表
}

impl Default for MidiConfig {
    fn default() -> Self {
        Self {
            filename: String::new(),
            duration_ms: 0,
            track_count: 0,
            melody_note_count: 0,
            ticks_per_beat: 480,
            tempo: 500000,
            disabled_tracks: Vec::new(),
        }
    }
}

/// 获取 MIDI 库目录路径
fn get_midi_library_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let midi_dir = data_dir.join("midi_library");
    if !midi_dir.exists() {
        fs::create_dir_all(&midi_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(midi_dir)
}

/// 解析 MIDI 文件
#[tauri::command]
pub fn parse_midi_file(path: String) -> Result<(MidiInfo, Vec<NoteEvent>), String> {
    parse_midi_internal(&path)
}

/// 读取 MIDI 文件的二进制数据
#[tauri::command]
pub fn read_midi_data(app: tauri::AppHandle, filename: String) -> Result<Vec<u8>, String> {
    let library_dir = get_midi_library_dir(&app)?;
    let stored_path = library_dir.join(&filename);

    if stored_path.exists() {
        fs::read(&stored_path).map_err(|e| format!("读取文件失败: {}", e))
    } else {
        // 兼容：直接用 filename 作为路径
        fs::read(&filename).map_err(|e| format!("读取文件失败: {}", e))
    }
}

/// 提取旋律
#[tauri::command]
pub fn extract_melody(
    events: Vec<NoteEvent>,
    ticks_per_beat: u16,
    tempo: u64,
) -> Result<Vec<MelodyEvent>, String> {
    Ok(extract_melody_internal(&events, ticks_per_beat, tempo))
}

/// 提取所有音符（用于键盘映射，保留所有声部）
#[tauri::command]
pub fn extract_all_notes(
    events: Vec<NoteEvent>,
    ticks_per_beat: u16,
    tempo: u64,
) -> Result<Vec<MelodyEvent>, String> {
    Ok(extract_all_notes_internal(&events, ticks_per_beat, tempo))
}

/// 扫描文件夹中的 MIDI 文件（仅用于导入，不返回文件内容）
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
                    match parse_midi_internal(file_path.to_str().unwrap_or("")) {
                        Ok((info, _)) => midi_files.push(info),
                        Err(e) => log::warn!("解析失败 {}: {}", file_path.display(), e),
                    }
                }
            }
        }
    }

    Ok(midi_files)
}

/// 导入 MIDI 文件到库（复制到应用数据目录）
#[tauri::command]
pub fn import_midi(app: tauri::AppHandle, source_path: String) -> Result<MidiInfo, String> {
    let library_dir = get_midi_library_dir(&app)?;

    // 保留原始文件名
    let source_filename = Path::new(&source_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.mid")
        .to_string();

    // 检查文件是否已存在于库目录
    let dest_path = library_dir.join(&source_filename);
    if dest_path.exists() {
        return Err("文件已存在".to_string());
    }

    // 复制文件
    fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("复制文件失败: {}", e))?;

    // 解析文件获取信息
    let (info, _events) = parse_midi_internal(&dest_path.to_str().unwrap_or(""))?;

    Ok(info)
}

/// 获取 MIDI 库列表（从应用数据目录加载）
#[tauri::command]
pub fn get_midi_library(app: tauri::AppHandle) -> Result<Vec<MidiInfo>, String> {
    let library_dir = get_midi_library_dir(&app)?;

    let mut midi_files = Vec::new();

    for entry in fs::read_dir(&library_dir).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let file_path = entry.path();

        // 只处理 .mid 和 .midi 文件，不处理配置文件
        if file_path.is_file() {
            if let Some(ext) = file_path.extension() {
                if ext.eq_ignore_ascii_case("mid") || ext.eq_ignore_ascii_case("midi") {
                    match parse_midi_internal(file_path.to_str().unwrap_or("")) {
                        Ok((info, _)) => midi_files.push(info),
                        Err(e) => log::warn!("解析失败 {}: {}", file_path.display(), e),
                    }
                }
            }
        }
    }

    // 按文件名排序
    midi_files.sort_by(|a, b| a.filename.cmp(&b.filename));

    Ok(midi_files)
}

/// 从库中删除 MIDI 文件及其配置
#[tauri::command]
pub fn delete_midi_from_library(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    let library_dir = get_midi_library_dir(&app)?;
    let file_path = library_dir.join(&filename);

    // 删除 MIDI 文件
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("删除文件失败: {}", e))?;
    }

    // 删除对应的配置文件
    let config_path = library_dir.join(format!("{}.midi-config", filename));
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("删除配置文件失败: {}", e))?;
    }

    Ok(())
}

/// 读取完整的 MIDI 配置（包含时长和禁用状态）
#[tauri::command]
pub fn load_midi_config(app: tauri::AppHandle, filename: String) -> Result<MidiConfig, String> {
    let library_dir = get_midi_library_dir(&app)?;
    let config_path = library_dir.join(format!("{}.midi-config", filename));

    if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置失败: {}", e))?;
        let config: MidiConfig = serde_json::from_str(&content)
            .map_err(|e| format!("解析配置失败: {}", e))?;
        Ok(config)
    } else {
        // 如果没有配置文件，返回默认值
        Ok(MidiConfig::default())
    }
}

/// 保存完整的 MIDI 配置（包含时长和禁用状态）
#[tauri::command]
pub fn save_midi_config(
    app: tauri::AppHandle,
    filename: String,
    duration_ms: u64,
    track_count: usize,
    melody_note_count: usize,
    ticks_per_beat: u16,
    tempo: u32,
    disabled_tracks: Vec<u8>,
) -> Result<(), String> {
    let library_dir = get_midi_library_dir(&app)?;
    let config_path = library_dir.join(format!("{}.midi-config", filename));

    let config = MidiConfig {
        filename: filename.clone(),
        duration_ms,
        track_count,
        melody_note_count,
        ticks_per_beat,
        tempo,
        disabled_tracks,
    };

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(&config_path, content)
        .map_err(|e| format!("保存配置失败: {}", e))?;

    Ok(())
}
