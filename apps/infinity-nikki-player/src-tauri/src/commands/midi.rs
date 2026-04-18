//! @fileOverview MIDI 文件管理命令模块
//!
//! 提供 MIDI 文件的导入、解析、库管理等功能

use crate::midi::{extract_melody as extract_melody_internal, extract_all_notes as extract_all_notes_internal, parse_midi_file as parse_midi_internal};
use crate::types::{MelodyEvent, MidiInfo, NoteEvent};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// MIDI 文件配置结构体
///
/// 包含 MIDI 文件的基本信息和缓存数据，用于加速下次加载
///
/// # Fields
///
/// * `filename` - 文件名
/// * `duration_ms` - 计算出的准确时长（毫秒）
/// * `track_count` - 音轨数量
/// * `melody_note_count` - 旋律音符数
/// * `ticks_per_beat` - 每拍的 tick 数
/// * `tempo` - 速度（微秒每拍）
/// * `disabled_tracks` - 禁用的音轨索引列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiConfig {
    /// 文件名
    pub filename: String,
    /// 计算出的准确时长（毫秒）
    pub duration_ms: u64,
    /// 音轨数量
    pub track_count: usize,
    /// 旋律音符数
    pub melody_note_count: usize,
    /// 每拍的 tick 数
    pub ticks_per_beat: u16,
    /// 速度（微秒每拍，默认 500000 = 120 BPM）
    pub tempo: u32,
    /// 禁用的音轨索引列表
    pub disabled_tracks: Vec<u8>,
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
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 库目录的 PathBuf，不存在则创建
fn get_midi_library_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let midi_dir = data_dir.join("midi_library");

    // 如果目录不存在，创建它
    if !midi_dir.exists() {
        fs::create_dir_all(&midi_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(midi_dir)
}

/// 解析 MIDI 文件
///
/// # Arguments
///
/// * `path` - MIDI 文件路径
///
/// # Returns
///
/// 元组 (MidiInfo, Vec<NoteEvent>) - MIDI 信息和音符事件列表
///
/// # Errors
///
/// 文件不存在或格式错误时返回错误
#[tauri::command]
pub fn parse_midi_file(path: String) -> Result<(MidiInfo, Vec<NoteEvent>), String> {
    parse_midi_internal(&path)
}

/// 读取 MIDI 文件的二进制数据
///
/// 从库目录读取文件，如果不存在则尝试直接作为路径读取
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `filename` - 库中的文件名
///
/// # Returns
///
/// 文件的字节数据
///
/// # Errors
///
/// 文件不存在或读取失败时返回错误
#[tauri::command]
pub fn read_midi_data(app: tauri::AppHandle, filename: String) -> Result<Vec<u8>, String> {
    let library_dir = get_midi_library_dir(&app)?;
    let stored_path = library_dir.join(&filename);

    if stored_path.exists() {
        // 优先从库目录读取
        fs::read(&stored_path).map_err(|e| format!("读取文件失败: {}", e))
    } else {
        // 兼容：直接用 filename 作为路径
        fs::read(&filename).map_err(|e| format!("读取文件失败: {}", e))
    }
}

/// 提取旋律事件
///
/// 将音符事件转换为带时间的旋律事件（用于播放）
///
/// # Arguments
///
/// * `events` - 音符事件列表
/// * `ticks_per_beat` - 每拍的 tick 数
/// * `tempo` - 速度（微秒每拍）
///
/// # Returns
///
/// 转换后的旋律事件列表
#[tauri::command]
pub fn extract_melody(
    events: Vec<NoteEvent>,
    ticks_per_beat: u16,
    tempo: u64,
) -> Result<Vec<MelodyEvent>, String> {
    Ok(extract_melody_internal(&events, ticks_per_beat, tempo))
}

/// 提取所有音符事件
///
/// 用于键盘映射，保留所有声部的音符
///
/// # Arguments
///
/// * `events` - 音符事件列表
/// * `ticks_per_beat` - 每拍的 tick 数
/// * `tempo` - 速度（微秒每拍）
///
/// # Returns
///
/// 所有音符事件的旋律事件列表
#[tauri::command]
pub fn extract_all_notes(
    events: Vec<NoteEvent>,
    ticks_per_beat: u16,
    tempo: u64,
) -> Result<Vec<MelodyEvent>, String> {
    Ok(extract_all_notes_internal(&events, ticks_per_beat, tempo))
}

/// 扫描文件夹中的所有 MIDI 文件
///
/// 仅解析文件获取信息，不返回文件内容
///
/// # Arguments
///
/// * `folder_path` - 文件夹路径
///
/// # Returns
///
/// 文件夹中所有 MIDI 文件的信息列表
///
/// # Errors
///
/// 路径无效或读取失败时返回错误
#[tauri::command]
pub fn scan_folder(folder_path: String) -> Result<Vec<MidiInfo>, String> {
    let path = Path::new(&folder_path);
    if !path.is_dir() {
        return Err("不是有效的文件夹".to_string());
    }

    let mut midi_files = Vec::new();

    // 遍历文件夹中的条目
    for entry in fs::read_dir(path).map_err(|e| format!("读取文件夹失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let file_path = entry.path();

        // 只处理文件
        if file_path.is_file() {
            // 检查扩展名
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

/// 导入 MIDI 文件到库
///
/// 将源文件复制到应用数据目录的 midi_library 文件夹
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `source_path` - 源文件路径
///
/// # Returns
///
/// 导入文件的 MIDI 信息
///
/// # Errors
///
/// 文件不存在或复制失败时返回错误
///
/// # Notes
///
/// 如果文件已存在于库中，直接返回现有文件的信息，不重复复制
#[tauri::command]
pub fn import_midi(app: tauri::AppHandle, source_path: String) -> Result<MidiInfo, String> {
    let library_dir = get_midi_library_dir(&app)?;

    // 保留原始文件名
    let source_filename = Path::new(&source_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.mid")
        .to_string();

    // 目标路径
    let dest_path = library_dir.join(&source_filename);

    // 如果文件已存在，直接返回信息
    if dest_path.exists() {
        let (info, _) = parse_midi_internal(&dest_path.to_str().unwrap_or(""))?;
        return Ok(info);
    }

    // 复制文件到库目录
    fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("复制文件失败: {}", e))?;

    // 解析文件获取信息
    let (info, _) = parse_midi_internal(&dest_path.to_str().unwrap_or(""))?;

    Ok(info)
}

/// 从 Buffer 导入 MIDI 文件
///
/// 用于处理拖拽导入的文件字节数据
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `filename` - 文件名
/// * `data` - 文件的字节数据
///
/// # Returns
///
/// 导入文件的 MIDI 信息
///
/// # Errors
///
/// 写入或解析失败时返回错误
///
/// # Notes
///
/// 与 import_midi 不同，这个方法直接写入字节数据而非复制文件
#[tauri::command]
pub fn import_midi_buffer(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<MidiInfo, String> {
    let library_dir = get_midi_library_dir(&app)?;

    // 获取安全的文件名
    let safe_filename = Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.mid")
        .to_string();

    let dest_path = library_dir.join(&safe_filename);

    // 如果已存在，直接返回
    if dest_path.exists() {
        let (info, _) = parse_midi_internal(dest_path.to_str().unwrap_or(""))?;
        return Ok(info);
    }

    // 写入文件
    fs::write(&dest_path, data).map_err(|e| format!("写入文件失败: {}", e))?;

    // 解析获取信息
    let (info, _) = parse_midi_internal(dest_path.to_str().unwrap_or(""))?;
    Ok(info)
}

/// 获取 MIDI 库列表
///
/// 扫描库目录，返回所有 MIDI 文件的信息
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 按文件名排序的 MIDI 信息列表
///
/// # Notes
///
/// 只处理 .mid 和 .midi 扩展名的文件，忽略配置文件
#[tauri::command]
pub fn get_midi_library(app: tauri::AppHandle) -> Result<Vec<MidiInfo>, String> {
    let library_dir = get_midi_library_dir(&app)?;

    let mut midi_files = Vec::new();

    // 遍历库目录
    for entry in fs::read_dir(&library_dir).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let file_path = entry.path();

        // 只处理 MIDI 文件
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

/// 从库中删除 MIDI 文件
///
/// 同时删除 MIDI 文件和对应的配置文件
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `filename` - 要删除的文件名
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 删除文件失败时返回错误
///
/// # Notes
///
/// 配置文件命名为 `{filename}.midi-config`
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

/// 加载 MIDI 配置
///
/// 从配置文件读取缓存的 MIDI 元数据
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `filename` - 文件名
///
/// # Returns
///
/// MIDI 配置，如果配置文件不存在返回默认值
///
/// # Notes
///
/// 配置文件命名为 `{filename}.midi-config`
#[tauri::command]
pub fn load_midi_config(app: tauri::AppHandle, filename: String) -> Result<MidiConfig, String> {
    let library_dir = get_midi_library_dir(&app)?;
    let config_path = library_dir.join(format!("{}.midi-config", filename));

    if config_path.exists() {
        // 读取并解析配置文件
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置失败: {}", e))?;
        let config: MidiConfig = serde_json::from_str(&content)
            .map_err(|e| format!("解析配置失败: {}", e))?;
        Ok(config)
    } else {
        // 没有配置文件，返回默认值
        Ok(MidiConfig::default())
    }
}

/// 保存 MIDI 配置
///
/// 将 MIDI 元数据写入配置文件
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `filename` - 文件名
/// * `duration_ms` - 时长（毫秒）
/// * `track_count` - 音轨数
/// * `melody_note_count` - 旋律音符数
/// * `ticks_per_beat` - 每拍 tick 数
/// * `tempo` - 速度
/// * `disabled_tracks` - 禁用的音轨列表
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 写入失败时返回错误
///
/// # Notes
///
/// 配置文件命名为 `{filename}.midi-config`
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

    // 构建配置对象
    let config = MidiConfig {
        filename: filename.clone(),
        duration_ms,
        track_count,
        melody_note_count,
        ticks_per_beat,
        tempo,
        disabled_tracks,
    };

    // 序列化为 JSON
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;

    // 写入文件
    fs::write(&config_path, content)
        .map_err(|e| format!("保存配置失败: {}", e))?;

    Ok(())
}
