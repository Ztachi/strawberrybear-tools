//! @fileOverview MIDI 编辑器项目持久化命令
//!
//! 项目以 `app_data_dir/midi_projects/{id}.json` 存储，草稿存于 `midi_projects/drafts/{key}.json`。
//! `document` 字段由前端定义并透传，后端只负责校验 ID/名称、去重与文件读写。

use crate::commands::templates::{
    has_extension, is_safe_template_id, is_safe_zip_template_entry, is_valid_template_file_name,
    template_name_validation_message,
};
use crate::types::{MidiProject, MidiProjectSummary};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// 草稿子目录名
const DRAFTS_DIR: &str = "drafts";

/// @description: 获取项目目录，不存在时创建
fn projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?
        .join("midi_projects");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(dir)
}

/// @description: 获取草稿目录，不存在时创建
fn drafts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = projects_dir(app)?.join(DRAFTS_DIR);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(dir)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// @description: 项目文件路径；ID 必须为文件名安全字符
fn project_file_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !is_safe_template_id(id) {
        return Err("项目 ID 只能包含英文字母、数字、横线和下划线".to_string());
    }
    Ok(projects_dir(app)?.join(format!("{}.json", id)))
}

/// @description: 草稿文件路径；key 同样按 ID 规则校验
fn draft_file_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    if !is_safe_template_id(key) {
        return Err("草稿键只能包含英文字母、数字、横线和下划线".to_string());
    }
    Ok(drafts_dir(app)?.join(format!("{}.json", key)))
}

fn validate_project_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("项目名称不能为空".to_string());
    }
    if !is_valid_template_file_name(name) {
        return Err(template_name_validation_message());
    }
    Ok(())
}

/// @description: 校验项目结构；文档必须是对象
fn validate_project(project: &MidiProject) -> Result<(), String> {
    if !is_safe_template_id(&project.id) {
        return Err("项目 ID 只能包含英文字母、数字、横线和下划线".to_string());
    }
    validate_project_name(&project.name)?;
    if !project.document.is_object() {
        return Err("项目文档格式无效".to_string());
    }
    Ok(())
}

fn normalize_project(mut project: MidiProject) -> MidiProject {
    project.id = project.id.trim().to_string();
    project.name = project.name.trim().to_string();
    if project.schema_version == 0 {
        project.schema_version = 1;
    }
    let now = now_millis();
    if project.created_at == 0 {
        project.created_at = now;
    }
    project.updated_at = now;
    project
}

fn read_project_file(path: &Path) -> Result<MidiProject, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("读取项目文件失败: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("解析项目失败: {}", e))
}

fn write_project_file(path: &Path, project: &MidiProject) -> Result<(), String> {
    // 项目文件可能很大，使用紧凑 JSON 减少磁盘占用与 IO。
    let content = serde_json::to_string(project).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| format!("写入项目失败: {}", e))
}

fn summarize(project: &MidiProject) -> MidiProjectSummary {
    MidiProjectSummary {
        id: project.id.clone(),
        name: project.name.clone(),
        created_at: project.created_at,
        updated_at: project.updated_at,
        source: project.source.clone(),
        meta: project.meta.clone(),
    }
}

/// @description: 读取全部项目，损坏文件跳过
fn read_all_projects(app: &tauri::AppHandle) -> Result<Vec<MidiProject>, String> {
    let dir = projects_dir(app)?;
    let mut projects = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || !has_extension(&path, "json") {
                continue;
            }
            match read_project_file(&path) {
                Ok(project) => projects.push(project),
                Err(error) => log::warn!("Skipped invalid MIDI project {:?}: {}", path, error),
            }
        }
    }
    Ok(projects)
}

/// @description: 名称唯一校验，同一项目重复保存允许
fn validate_unique_name(app: &tauri::AppHandle, project: &MidiProject) -> Result<(), String> {
    for existing in read_all_projects(app)? {
        if existing.id != project.id && existing.name.trim() == project.name {
            return Err(format!("项目名称已存在: {}", project.name));
        }
    }
    Ok(())
}

fn generate_project_id() -> String {
    format!("project-{}", now_millis())
}

/// @description: 为导入项目生成不覆盖现有文件的 ID
fn make_unique_id(app: &tauri::AppHandle, preferred: &str) -> Result<String, String> {
    let mut candidate = if is_safe_template_id(preferred) {
        preferred.to_string()
    } else {
        generate_project_id()
    };
    let mut suffix = 1;
    while project_file_path(app, &candidate)?.exists() {
        candidate = format!("{}-{}", generate_project_id(), suffix);
        suffix += 1;
    }
    Ok(candidate)
}

/// @description: 为导入项目生成不重复的名称（追加 (n)）
fn make_unique_name(app: &tauri::AppHandle, project: &MidiProject) -> Result<String, String> {
    let existing: Vec<String> = read_all_projects(app)?
        .into_iter()
        .filter(|item| item.id != project.id)
        .map(|item| item.name.trim().to_string())
        .collect();
    let base = project.name.trim().to_string();
    if !existing.contains(&base) {
        return Ok(base);
    }
    for index in 2..1000 {
        let candidate = format!("{} ({})", base, index);
        if candidate.chars().count() <= 30 && !existing.contains(&candidate) {
            return Ok(candidate);
        }
    }
    Err("无法为导入项目生成唯一名称".to_string())
}

/// @description: 保存导入的项目：重分配 ID、名称去重
fn save_imported_project(
    app: &tauri::AppHandle,
    project: MidiProject,
) -> Result<MidiProjectSummary, String> {
    validate_project_name(&project.name)?;
    let mut project = normalize_project(project);
    project.id = make_unique_id(app, &project.id)?;
    project.name = make_unique_name(app, &project)?;
    validate_project(&project)?;
    write_project_file(&project_file_path(app, &project.id)?, &project)?;
    Ok(summarize(&project))
}

fn parse_project_json(content: &str, label: &str) -> Result<MidiProject, String> {
    serde_json::from_str(content).map_err(|e| format!("解析项目失败({}): {}", label, e))
}

/// 获取全部项目摘要，按更新时间倒序
#[tauri::command]
pub fn get_midi_projects(app: tauri::AppHandle) -> Result<Vec<MidiProjectSummary>, String> {
    let mut projects = read_all_projects(&app)?;
    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| b.id.cmp(&a.id)));
    Ok(projects.iter().map(summarize).collect())
}

/// 载入完整项目
#[tauri::command]
pub fn load_midi_project(app: tauri::AppHandle, id: String) -> Result<MidiProject, String> {
    let path = project_file_path(&app, &id)?;
    if !path.exists() {
        return Err("项目不存在".to_string());
    }
    read_project_file(&path)
}

/// 保存项目（新建或覆盖），返回写盘后的项目摘要（含 updated_at）
#[tauri::command]
pub fn save_midi_project(
    app: tauri::AppHandle,
    project: MidiProject,
) -> Result<MidiProjectSummary, String> {
    validate_project_name(&project.name)?;
    let project = normalize_project(project);
    validate_project(&project)?;
    validate_unique_name(&app, &project)?;
    write_project_file(&project_file_path(&app, &project.id)?, &project)?;
    log::info!("Saved MIDI project {}", project.id);
    Ok(summarize(&project))
}

/// 删除项目；文件不存在视为成功
#[tauri::command]
pub fn delete_midi_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = project_file_path(&app, &id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    // 同步清理对应编辑草稿。
    let draft = draft_file_path(&app, &format!("edit-{}", id))?;
    if draft.exists() {
        let _ = fs::remove_file(&draft);
    }
    Ok(())
}

/// 重命名项目
#[tauri::command]
pub fn rename_midi_project(
    app: tauri::AppHandle,
    id: String,
    new_name: String,
) -> Result<MidiProjectSummary, String> {
    validate_project_name(&new_name)?;
    let path = project_file_path(&app, &id)?;
    let mut project = read_project_file(&path)?;
    project.name = new_name.trim().to_string();
    project.updated_at = now_millis();
    validate_project(&project)?;
    validate_unique_name(&app, &project)?;
    write_project_file(&path, &project)?;
    Ok(summarize(&project))
}

/// 导入 .json（单项目）或 .zip（多项目）
#[tauri::command]
pub fn import_midi_projects(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<Vec<MidiProjectSummary>, String> {
    let source = PathBuf::from(&source_path);
    if has_extension(&source, "json") {
        let content = fs::read_to_string(&source).map_err(|e| format!("读取文件失败: {}", e))?;
        let label = source
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("project.json");
        let project = parse_project_json(&content, label)?;
        return Ok(vec![save_imported_project(&app, project)?]);
    }
    if has_extension(&source, "zip") {
        let file = File::open(&source).map_err(|e| format!("读取 ZIP 失败: {}", e))?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("解析 ZIP 失败: {}", e))?;
        let mut parsed = Vec::new();
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
            let name = entry.name().to_string();
            if !is_safe_zip_template_entry(&name) {
                continue;
            }
            let mut content = String::new();
            if entry.read_to_string(&mut content).is_err() {
                log::warn!("Skipped unreadable ZIP project entry: {}", name);
                continue;
            }
            match parse_project_json(&content, &name) {
                Ok(project) => parsed.push(project),
                Err(error) => log::warn!("Skipped invalid ZIP project entry {}: {}", name, error),
            }
        }
        let mut saved = Vec::new();
        for project in parsed {
            match save_imported_project(&app, project) {
                Ok(summary) => saved.push(summary),
                Err(error) => log::warn!("Skipped invalid ZIP project: {}", error),
            }
        }
        return Ok(saved);
    }
    Err("只支持导入 .json 或 .zip 项目文件".to_string())
}

/// 导出单个项目为 JSON
#[tauri::command]
pub fn export_midi_project(
    app: tauri::AppHandle,
    id: String,
    target_path: String,
) -> Result<(), String> {
    let project = read_project_file(&project_file_path(&app, &id)?)?;
    let content = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(&target_path, content).map_err(|e| format!("导出项目失败: {}", e))
}

/// 批量导出项目 ZIP，条目以项目名命名
#[tauri::command]
pub fn export_midi_projects_archive(
    app: tauri::AppHandle,
    ids: Vec<String>,
    target_path: String,
) -> Result<(), String> {
    if ids.is_empty() {
        return Err("请选择要导出的项目".to_string());
    }
    let target = File::create(&target_path).map_err(|e| format!("创建 ZIP 失败: {}", e))?;
    let mut zip = ZipWriter::new(target);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for id in ids {
        let project = read_project_file(&project_file_path(&app, &id)?)?;
        if !is_valid_template_file_name(&project.name) {
            return Err(template_name_validation_message());
        }
        let content = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
        zip.start_file(format!("{}.json", project.name.trim()), options)
            .map_err(|e| format!("写入 ZIP 条目失败: {}", e))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("写入 ZIP 内容失败: {}", e))?;
    }
    zip.finish().map_err(|e| format!("完成 ZIP 导出失败: {}", e))?;
    Ok(())
}

/// 保存草稿；不校验名称唯一，只要求结构合法
#[tauri::command]
pub fn save_midi_project_draft(
    app: tauri::AppHandle,
    key: String,
    project: MidiProject,
) -> Result<(), String> {
    if !project.document.is_object() {
        return Err("项目文档格式无效".to_string());
    }
    let mut project = project;
    project.updated_at = now_millis();
    write_project_file(&draft_file_path(&app, &key)?, &project)
}

/// 读取草稿；不存在返回 None
#[tauri::command]
pub fn load_midi_project_draft(
    app: tauri::AppHandle,
    key: String,
) -> Result<Option<MidiProject>, String> {
    let path = draft_file_path(&app, &key)?;
    if !path.exists() {
        return Ok(None);
    }
    match read_project_file(&path) {
        Ok(project) => Ok(Some(project)),
        Err(error) => {
            // 损坏草稿直接清理，避免每次打开都弹恢复框。
            log::warn!("Discarded corrupt MIDI project draft {:?}: {}", path, error);
            let _ = fs::remove_file(&path);
            Ok(None)
        }
    }
}

/// 删除草稿
#[tauri::command]
pub fn delete_midi_project_draft(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = draft_file_path(&app, &key)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 将前端生成的二进制内容写入用户选定的路径（导出 .mid）
#[tauri::command]
pub fn save_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("目标路径不能为空".to_string());
    }
    fs::write(&path, data).map_err(|e| format!("写入文件失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(id: &str, name: &str) -> MidiProject {
        MidiProject {
            schema_version: 1,
            id: id.to_string(),
            name: name.to_string(),
            created_at: 0,
            updated_at: 0,
            source: None,
            meta: Default::default(),
            r#loop: None,
            document: serde_json::json!({ "notes": [] }),
        }
    }

    #[test]
    fn validates_project_structure() {
        assert!(validate_project(&project("project-1", "My Song")).is_ok());
        assert!(validate_project(&project("../x", "My Song")).is_err());
        assert!(validate_project(&project("project-1", "bad/name")).is_err());
        let mut invalid = project("project-1", "ok");
        invalid.document = serde_json::json!([]);
        assert!(validate_project(&invalid).is_err());
    }

    #[test]
    fn normalizes_timestamps_and_whitespace() {
        let normalized = normalize_project(project(" project-2 ", "  Name  "));
        assert_eq!(normalized.id, "project-2");
        assert_eq!(normalized.name, "Name");
        assert!(normalized.created_at > 0);
        assert!(normalized.updated_at >= normalized.created_at);
    }

    #[test]
    fn serializes_camel_case() {
        let json = serde_json::to_value(project("p", "n")).unwrap();
        assert!(json.get("schemaVersion").is_some());
        assert!(json.get("createdAt").is_some());
        assert!(json.get("loop").is_some());
        assert_eq!(json["meta"]["trackCount"], 0);
    }
}
