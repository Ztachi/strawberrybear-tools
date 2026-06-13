//! @fileOverview 自建歌单管理命令模块
//!
//! 歌单只保存本地 MIDI 文件名索引，导入导出时才把 MIDI 文件一起打包。

use crate::midi::parse_midi_file as parse_midi_internal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const SONG_LIST_NAME_MAX_CHARS: usize = 20;
const SONG_LIST_DESCRIPTION_MAX_CHARS: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongList {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cover_filename: Option<String>,
    pub song_filenames: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn get_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败: {}", error))
}

fn get_song_lists_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = get_data_dir(app)?.join("song_lists");
    fs::create_dir_all(&dir).map_err(|error| format!("创建歌单目录失败: {}", error))?;
    Ok(dir)
}

fn get_song_list_covers_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = get_data_dir(app)?.join("song_list_covers");
    fs::create_dir_all(&dir).map_err(|error| format!("创建歌单封面目录失败: {}", error))?;
    Ok(dir)
}

fn get_midi_library_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = get_data_dir(app)?.join("midi_library");
    fs::create_dir_all(&dir).map_err(|error| format!("创建 MIDI 目录失败: {}", error))?;
    Ok(dir)
}

fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
}

fn song_list_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !is_safe_id(id) {
        return Err("歌单 ID 不合法".to_string());
    }
    Ok(get_song_lists_dir(app)?.join(format!("{}.json", id)))
}

fn validate_song_list(song_list: &SongList) -> Result<(), String> {
    if !is_safe_id(&song_list.id) {
        return Err("歌单 ID 不合法".to_string());
    }
    if song_list.name.trim().is_empty() {
        return Err("歌单名称不能为空".to_string());
    }
    if song_list.name.chars().count() > SONG_LIST_NAME_MAX_CHARS {
        return Err("歌单名称最多 20 个字符".to_string());
    }
    if song_list.description.chars().count() > SONG_LIST_DESCRIPTION_MAX_CHARS {
        return Err("歌单描述最多 1000 个字符".to_string());
    }
    Ok(())
}

fn normalize_song_filenames(filenames: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for filename in filenames {
        let basename = Path::new(filename)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .trim();
        if basename.is_empty() || !seen.insert(basename.to_string()) {
            continue;
        }
        normalized.push(basename.to_string());
    }
    normalized
}

fn normalize_song_list(mut song_list: SongList) -> SongList {
    song_list.name = song_list.name.trim().to_string();
    song_list.description = song_list.description.trim().to_string();
    song_list.song_filenames = normalize_song_filenames(&song_list.song_filenames);
    song_list
}

fn read_song_list_file(path: &Path) -> Result<SongList, String> {
    let content = fs::read_to_string(path).map_err(|error| format!("读取歌单失败: {}", error))?;
    serde_json::from_str(&content).map_err(|error| format!("解析歌单失败: {}", error))
}

fn read_song_lists_from_dir(app: &tauri::AppHandle) -> Result<Vec<SongList>, String> {
    let dir = get_song_lists_dir(app)?;
    let mut song_lists = Vec::new();

    for entry in fs::read_dir(&dir).map_err(|error| format!("读取歌单目录失败: {}", error))? {
        let entry = entry.map_err(|error| format!("读取歌单条目失败: {}", error))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        match read_song_list_file(&path) {
            Ok(song_list) => song_lists.push(song_list),
            Err(error) => log::warn!("跳过损坏歌单 {}: {}", path.display(), error),
        }
    }

    song_lists.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.updated_at.cmp(&a.updated_at))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(song_lists)
}

fn validate_unique_name(
    app: &tauri::AppHandle,
    name: &str,
    current_id: Option<&str>,
) -> Result<(), String> {
    for existing in read_song_lists_from_dir(app)? {
        if Some(existing.id.as_str()) == current_id {
            continue;
        }
        if existing.name == name {
            return Err("歌单名称不能重复".to_string());
        }
    }
    Ok(())
}

fn make_unique_song_list_name(app: &tauri::AppHandle, preferred_name: &str) -> Result<String, String> {
    let base_name = if preferred_name.trim().is_empty() {
        "Playlist"
    } else {
        preferred_name.trim()
    };
    let existing_names: HashSet<String> = read_song_lists_from_dir(app)?
        .into_iter()
        .map(|song_list| song_list.name)
        .collect();

    if !existing_names.contains(base_name) {
        return Ok(base_name.to_string());
    }

    let mut suffix = 1;
    loop {
        let candidate = format!("{}{}", base_name, suffix);
        if !existing_names.contains(&candidate) {
            return Ok(candidate);
        }
        suffix += 1;
    }
}

fn save_song_list_file(app: &tauri::AppHandle, song_list: &SongList) -> Result<(), String> {
    validate_song_list(song_list)?;
    let path = song_list_path(app, &song_list.id)?;
    let content = serde_json::to_string_pretty(song_list)
        .map_err(|error| format!("序列化歌单失败: {}", error))?;
    fs::write(path, content).map_err(|error| format!("保存歌单失败: {}", error))
}

fn get_song_list_by_id(app: &tauri::AppHandle, id: &str) -> Result<SongList, String> {
    read_song_list_file(&song_list_path(app, id)?)
}

fn is_midi_filename(filename: &str) -> bool {
    Path::new(filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("mid") || ext.eq_ignore_ascii_case("midi"))
        .unwrap_or(false)
}

fn safe_basename(name: &str) -> Option<String> {
    Path::new(name)
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .map(|file_name| file_name.trim().to_string())
        .filter(|file_name| !file_name.is_empty())
}

fn unique_midi_filename(library_dir: &Path, preferred_filename: &str) -> String {
    let preferred = safe_basename(preferred_filename).unwrap_or_else(|| "imported.mid".to_string());
    if !library_dir.join(&preferred).exists() {
        return preferred;
    }

    let path = Path::new(&preferred);
    let stem = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("imported");
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("mid");
    let mut suffix = 1;
    loop {
        let candidate = format!("{}-{}.{}", stem, suffix, extension);
        if !library_dir.join(&candidate).exists() {
            return candidate;
        }
        suffix += 1;
    }
}

fn import_midi_bytes_dedup(
    app: &tauri::AppHandle,
    preferred_filename: &str,
    data: &[u8],
) -> Result<String, String> {
    let library_dir = get_midi_library_dir(app)?;

    for entry in fs::read_dir(&library_dir).map_err(|error| format!("读取 MIDI 目录失败: {}", error))? {
        let entry = entry.map_err(|error| format!("读取 MIDI 条目失败: {}", error))?;
        let path = entry.path();
        if !path.is_file() || !is_midi_filename(path.to_string_lossy().as_ref()) {
            continue;
        }
        if fs::read(&path).map(|existing| existing == data).unwrap_or(false) {
            if let Some(filename) = path.file_name().and_then(|name| name.to_str()) {
                return Ok(filename.to_string());
            }
        }
    }

    let filename = unique_midi_filename(&library_dir, preferred_filename);
    let target_path = library_dir.join(&filename);
    fs::write(&target_path, data).map_err(|error| format!("写入 MIDI 失败: {}", error))?;

    if let Err(error) = parse_midi_internal(target_path.to_string_lossy().as_ref()) {
        let _ = fs::remove_file(&target_path);
        return Err(format!("MIDI 文件无效: {}", error));
    }

    Ok(filename)
}

fn zip_entry_basename(entry_name: &str) -> Option<String> {
    entry_name
        .replace('\\', "/")
        .split('/')
        .last()
        .and_then(safe_basename)
}

#[tauri::command]
pub fn get_song_lists(app: tauri::AppHandle) -> Result<Vec<SongList>, String> {
    read_song_lists_from_dir(&app)
}

#[tauri::command]
pub fn create_song_list(app: tauri::AppHandle, name: String) -> Result<SongList, String> {
    let now = now_millis();
    let song_list = SongList {
        id: Uuid::new_v4().to_string(),
        name: make_unique_song_list_name(&app, &name)?,
        description: String::new(),
        cover_filename: None,
        song_filenames: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    save_song_list_file(&app, &song_list)?;
    Ok(song_list)
}

#[tauri::command]
pub fn save_song_list(app: tauri::AppHandle, song_list: SongList) -> Result<SongList, String> {
    let mut next_song_list = normalize_song_list(song_list);
    validate_unique_name(&app, &next_song_list.name, Some(&next_song_list.id))?;
    if next_song_list.created_at == 0 {
        next_song_list.created_at = now_millis();
    }
    next_song_list.updated_at = now_millis();
    save_song_list_file(&app, &next_song_list)?;
    Ok(next_song_list)
}

#[tauri::command]
pub fn rename_song_list(
    app: tauri::AppHandle,
    song_list_id: String,
    new_name: String,
) -> Result<SongList, String> {
    let mut song_list = get_song_list_by_id(&app, &song_list_id)?;
    song_list.name = new_name.trim().to_string();
    validate_unique_name(&app, &song_list.name, Some(&song_list.id))?;
    song_list.updated_at = now_millis();
    save_song_list_file(&app, &song_list)?;
    Ok(song_list)
}

#[tauri::command]
pub fn delete_song_list(app: tauri::AppHandle, song_list_id: String) -> Result<(), String> {
    let song_list = get_song_list_by_id(&app, &song_list_id).ok();
    let path = song_list_path(&app, &song_list_id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("删除歌单失败: {}", error))?;
    }
    if let Some(cover_filename) = song_list.and_then(|item| item.cover_filename) {
        let cover_path = get_song_list_covers_dir(&app)?.join(cover_filename);
        if cover_path.exists() {
            fs::remove_file(cover_path).map_err(|error| format!("删除封面失败: {}", error))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn add_songs_to_song_list(
    app: tauri::AppHandle,
    song_list_id: String,
    filenames: Vec<String>,
) -> Result<SongList, String> {
    let mut song_list = get_song_list_by_id(&app, &song_list_id)?;
    let library_dir = get_midi_library_dir(&app)?;
    let mut existing = song_list
        .song_filenames
        .iter()
        .cloned()
        .collect::<HashSet<String>>();

    for filename in normalize_song_filenames(&filenames) {
        if existing.contains(&filename) || !library_dir.join(&filename).exists() {
            continue;
        }
        existing.insert(filename.clone());
        song_list.song_filenames.push(filename);
    }

    song_list.updated_at = now_millis();
    save_song_list_file(&app, &song_list)?;
    Ok(song_list)
}

#[tauri::command]
pub fn remove_songs_from_song_list(
    app: tauri::AppHandle,
    song_list_id: String,
    filenames: Vec<String>,
) -> Result<SongList, String> {
    let mut song_list = get_song_list_by_id(&app, &song_list_id)?;
    let remove_set = normalize_song_filenames(&filenames)
        .into_iter()
        .collect::<HashSet<String>>();
    song_list
        .song_filenames
        .retain(|filename| !remove_set.contains(filename));
    song_list.updated_at = now_millis();
    save_song_list_file(&app, &song_list)?;
    Ok(song_list)
}

#[tauri::command]
pub fn save_song_list_cover(
    app: tauri::AppHandle,
    song_list_id: String,
    data: Vec<u8>,
) -> Result<String, String> {
    if !is_safe_id(&song_list_id) {
        return Err("歌单 ID 不合法".to_string());
    }
    let cover_filename = format!("{}.png", song_list_id);
    let cover_path = get_song_list_covers_dir(&app)?.join(&cover_filename);
    fs::write(cover_path, data).map_err(|error| format!("保存封面失败: {}", error))?;
    Ok(cover_filename)
}

#[tauri::command]
pub fn read_song_list_cover(app: tauri::AppHandle, cover_filename: String) -> Result<Vec<u8>, String> {
    let basename = safe_basename(&cover_filename).ok_or_else(|| "封面文件名不合法".to_string())?;
    let cover_path = get_song_list_covers_dir(&app)?.join(basename);
    fs::read(cover_path).map_err(|error| format!("读取封面失败: {}", error))
}

#[tauri::command]
pub fn export_song_lists_archive(
    app: tauri::AppHandle,
    song_list_ids: Vec<String>,
    target_path: String,
) -> Result<(), String> {
    let all_song_lists = read_song_lists_from_dir(&app)?;
    let selected_song_lists: Vec<SongList> = if song_list_ids.is_empty() {
        all_song_lists
    } else {
        let selected_ids = song_list_ids.into_iter().collect::<HashSet<String>>();
        all_song_lists
            .into_iter()
            .filter(|song_list| selected_ids.contains(&song_list.id))
            .collect()
    };

    if selected_song_lists.is_empty() {
        return Err("没有可导出的歌单".to_string());
    }

    let target_file = File::create(&target_path).map_err(|error| format!("创建 ZIP 失败: {}", error))?;
    let mut zip = ZipWriter::new(target_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let cover_dir = get_song_list_covers_dir(&app)?;
    let midi_dir = get_midi_library_dir(&app)?;
    let mut exported_musics = HashSet::new();

    for song_list in &selected_song_lists {
        zip.start_file(format!("songList/{}/playlist.json", song_list.id), options)
            .map_err(|error| format!("写入歌单信息失败: {}", error))?;
        let content = serde_json::to_string_pretty(song_list)
            .map_err(|error| format!("序列化歌单失败: {}", error))?;
        zip.write_all(content.as_bytes())
            .map_err(|error| format!("写入歌单信息失败: {}", error))?;

        if let Some(cover_filename) = &song_list.cover_filename {
            let cover_path = cover_dir.join(cover_filename);
            if cover_path.exists() {
                zip.start_file(format!("songList/{}/cover.png", song_list.id), options)
                    .map_err(|error| format!("写入封面失败: {}", error))?;
                let cover_data = fs::read(cover_path).map_err(|error| format!("读取封面失败: {}", error))?;
                zip.write_all(&cover_data)
                    .map_err(|error| format!("写入封面失败: {}", error))?;
            }
        }

        for filename in &song_list.song_filenames {
            if !exported_musics.insert(filename.clone()) {
                continue;
            }
            let midi_path = midi_dir.join(filename);
            if !midi_path.exists() {
                continue;
            }
            zip.start_file(format!("musics/{}", filename), options)
                .map_err(|error| format!("写入 MIDI 失败: {}", error))?;
            let midi_data = fs::read(midi_path).map_err(|error| format!("读取 MIDI 失败: {}", error))?;
            zip.write_all(&midi_data)
                .map_err(|error| format!("写入 MIDI 失败: {}", error))?;
        }
    }

    zip.finish()
        .map_err(|error| format!("完成 ZIP 导出失败: {}", error))?;
    Ok(())
}

#[tauri::command]
pub fn import_song_lists_archive(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<Vec<SongList>, String> {
    let file = File::open(&source_path).map_err(|error| format!("读取 ZIP 失败: {}", error))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("解析 ZIP 失败: {}", error))?;
    let mut playlist_json_by_id: HashMap<String, String> = HashMap::new();
    let mut cover_by_id: HashMap<String, Vec<u8>> = HashMap::new();
    let mut music_bytes_by_name: HashMap<String, Vec<u8>> = HashMap::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("读取 ZIP 条目失败: {}", error))?;
        let normalized_name = entry.name().replace('\\', "/");
        if entry.is_dir() || normalized_name.contains("..") {
            continue;
        }
        let parts: Vec<&str> = normalized_name.split('/').collect();

        if parts.len() == 3 && parts[0] == "songList" && parts[2] == "playlist.json" {
            let mut content = String::new();
            entry
                .read_to_string(&mut content)
                .map_err(|error| format!("读取歌单信息失败: {}", error))?;
            playlist_json_by_id.insert(parts[1].to_string(), content);
            continue;
        }

        if parts.len() == 3 && parts[0] == "songList" && parts[2] == "cover.png" {
            let mut data = Vec::new();
            entry
                .read_to_end(&mut data)
                .map_err(|error| format!("读取封面失败: {}", error))?;
            cover_by_id.insert(parts[1].to_string(), data);
            continue;
        }

        if parts.len() == 2 && parts[0] == "musics" && is_midi_filename(parts[1]) {
            let Some(filename) = zip_entry_basename(&normalized_name) else {
                continue;
            };
            let mut data = Vec::new();
            entry
                .read_to_end(&mut data)
                .map_err(|error| format!("读取 MIDI 失败: {}", error))?;
            music_bytes_by_name.insert(filename, data);
        }
    }

    let mut filename_map = HashMap::new();
    for (filename, data) in music_bytes_by_name {
        match import_midi_bytes_dedup(&app, &filename, &data) {
            Ok(actual_filename) => {
                filename_map.insert(filename, actual_filename);
            }
            Err(error) => log::warn!("跳过无效 MIDI {}: {}", filename, error),
        }
    }

    let mut imported_song_lists = Vec::new();
    for (source_id, content) in playlist_json_by_id {
        let Ok(mut imported) = serde_json::from_str::<SongList>(&content) else {
            log::warn!("跳过无效歌单 {}", source_id);
            continue;
        };

        let now = now_millis();
        imported.id = Uuid::new_v4().to_string();
        imported.name = make_unique_song_list_name(&app, &imported.name)?;
        imported.created_at = now;
        imported.updated_at = now;
        imported.song_filenames = normalize_song_filenames(&imported.song_filenames)
            .into_iter()
            .filter_map(|filename| filename_map.get(&filename).cloned())
            .collect();

        if let Some(cover_data) = cover_by_id.remove(&source_id) {
            let cover_filename = format!("{}.png", imported.id);
            fs::write(get_song_list_covers_dir(&app)?.join(&cover_filename), cover_data)
                .map_err(|error| format!("保存封面失败: {}", error))?;
            imported.cover_filename = Some(cover_filename);
        } else {
            imported.cover_filename = None;
        }

        imported = normalize_song_list(imported);
        if let Err(error) = validate_song_list(&imported) {
            log::warn!("跳过无效歌单: {}", error);
            continue;
        }
        save_song_list_file(&app, &imported)?;
        imported_song_lists.push(imported);
    }

    Ok(imported_song_lists)
}

pub(crate) fn remove_filename_from_all_song_lists(
    app: &tauri::AppHandle,
    filename: &str,
) -> Result<(), String> {
    let normalized_filename = safe_basename(filename).ok_or_else(|| "MIDI 文件名不合法".to_string())?;
    for mut song_list in read_song_lists_from_dir(app)? {
        let original_len = song_list.song_filenames.len();
        song_list
            .song_filenames
            .retain(|item| item != &normalized_filename);
        if song_list.song_filenames.len() == original_len {
            continue;
        }
        song_list.updated_at = now_millis();
        save_song_list_file(app, &song_list)?;
    }
    Ok(())
}
