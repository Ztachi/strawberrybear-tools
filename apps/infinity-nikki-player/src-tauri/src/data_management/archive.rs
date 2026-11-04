//! 资料快照的唯一格式；分享导入不参与恢复，避免重写标识和破坏引用。

use super::{now_millis, SnapshotCounts, SnapshotKind, SnapshotSummary, CONTENT_DIRS};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub(super) const MAX_ARCHIVE_BYTES: usize = 512 * 1024 * 1024;
const MAX_FILES: usize = 50_000;
const MAX_DRAFT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    summary: SnapshotSummary,
    files: BTreeMap<String, u64>,
}

pub(super) struct ArchiveContents {
    pub summary: SnapshotSummary,
    pub files: BTreeMap<String, Vec<u8>>,
    pub drafts: HashMap<String, String>,
}

/// 同步指纹只描述资料内容，忽略每次打包产生的时间和压缩元数据。
pub(super) fn content_fingerprint(contents: &ArchiveContents) -> String {
    let mut digest = Sha256::new();
    for (name, bytes) in &contents.files {
        digest.update((name.len() as u64).to_be_bytes());
        digest.update(name.as_bytes());
        digest.update((bytes.len() as u64).to_be_bytes());
        digest.update(bytes);
    }
    format!("{:x}", digest.finalize())
}

/// 只接收模板草稿，绝不把设备身份、偏好或凭据作为浏览器存储导入。
pub fn validate_template_drafts(drafts: &HashMap<String, String>) -> Result<(), String> {
    let mut size = 0usize;
    for (key, value) in drafts {
        if !(key == "infinity-nikki-player.template-draft.create"
            || key == "infinity-nikki-player.new-template-draft"
            || key
                .strip_prefix("infinity-nikki-player.template-draft.edit.")
                .is_some_and(|suffix| !suffix.is_empty()))
        {
            return Err("备份含有不允许恢复的浏览器存储键".into());
        }
        size = size.saturating_add(key.len()).saturating_add(value.len());
        if size > MAX_DRAFT_BYTES || drafts.len() > 1000 {
            return Err("模板草稿超过备份允许的大小".into());
        }
        let template: crate::types::KeyTemplate =
            serde_json::from_str(value).map_err(|error| format!("模板草稿格式无效：{error}"))?;
        // 草稿允许空名称等尚未通过表单校验的中间状态，恢复后仍由原表单校验。
        if template.id.is_empty() {
            return Err("模板草稿缺少标识".into());
        }
    }
    Ok(())
}

fn safe_basename(value: &str) -> bool {
    let reserved = value.split('.').next().unwrap_or("").to_ascii_uppercase();
    !matches!(
        reserved.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) && !value.is_empty()
        && value != "."
        && value != ".."
        && !value.ends_with(['.', ' '])
        && !value.chars().any(|c| {
            c.is_control() || matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*')
        })
}

fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// 归档路径固定为相对路径和白名单层级，不跟随软链接。
fn allowed_file(name: &str, local: bool) -> bool {
    let path = Path::new(name);
    if path
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
        || name.contains('\\')
    {
        return false;
    }
    let parts: Vec<_> = name.split('/').collect();
    match parts.as_slice() {
        ["midi_library", file] => {
            safe_basename(file)
                && (file.to_ascii_lowercase().ends_with(".mid")
                    || file.to_ascii_lowercase().ends_with(".midi")
                    || file.ends_with(".midi-config"))
        }
        ["song_lists" | "templates" | "midi_projects", file] => {
            if parts[0] == "templates" && *file == ".defaults_seeded" {
                return true;
            }
            file.strip_suffix(".json").is_some_and(safe_id)
        }
        ["song_list_covers", file] => safe_basename(file) && file.ends_with(".png"),
        ["midi_projects", "drafts", file] => {
            local && file.strip_suffix(".json").is_some_and(safe_id)
        }
        _ => false,
    }
}

fn counts(files: &BTreeMap<String, Vec<u8>>, drafts: usize) -> SnapshotCounts {
    let mut counts = SnapshotCounts {
        drafts,
        ..Default::default()
    };
    for name in files.keys() {
        if name.starts_with("midi_library/") && !name.ends_with(".midi-config") {
            counts.midi += 1;
        } else if name.starts_with("song_lists/") {
            counts.song_lists += 1;
        } else if name.starts_with("templates/") && name.ends_with(".json") {
            counts.templates += 1;
        } else if name.starts_with("midi_projects/drafts/") {
            counts.drafts += 1;
        } else if name.starts_with("midi_projects/") {
            counts.projects += 1;
        }
    }
    counts
}

fn collect(
    root: &Path,
    dir: &Path,
    local: bool,
    files: &mut BTreeMap<String, Vec<u8>>,
    size: &mut usize,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    if fs::symlink_metadata(dir)
        .map_err(|error| format!("读取资料目录属性失败：{error}"))?
        .file_type()
        .is_symlink()
    {
        return Err("资料目录包含软链接，不能创建备份".into());
    }
    for entry in fs::read_dir(dir).map_err(|error| format!("读取资料目录失败：{error}"))? {
        let entry = entry.map_err(|error| format!("读取资料条目失败：{error}"))?;
        let kind = entry
            .file_type()
            .map_err(|error| format!("读取资料属性失败：{error}"))?;
        if kind.is_symlink() {
            return Err("资料目录包含软链接，不能创建备份".into());
        }
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "资料路径超出目录")?
            .to_str()
            .ok_or("资料文件名不是有效文本")?
            .replace('\\', "/");
        if kind.is_dir() {
            if relative == "midi_projects/drafts" && local {
                collect(root, &path, local, files, size)?;
            }
            continue;
        }
        if !kind.is_file() {
            continue;
        }
        if !allowed_file(&relative, local) {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if matches!(
                extension.as_str(),
                "mid" | "midi" | "midi-config" | "json" | "png"
            ) {
                return Err(format!(
                    "资料文件名不适合跨平台备份，请重命名后重试：{relative}"
                ));
            }
            continue;
        }
        let length = entry
            .metadata()
            .map_err(|error| format!("读取资料大小失败：{error}"))?
            .len();
        if length > MAX_ARCHIVE_BYTES as u64 || files.len() >= MAX_FILES {
            return Err("资料超过备份允许的大小或文件数量".into());
        }
        *size = size.saturating_add(length as usize);
        if *size > MAX_ARCHIVE_BYTES {
            return Err("资料超过备份允许的大小".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(path)
            .map_err(|error| format!("打开资料失败：{error}"))?
            .take(length + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("读取资料失败：{error}"))?;
        if bytes.len() as u64 != length {
            return Err("资料文件在备份期间发生外部修改，请重试".into());
        }
        files.insert(relative, bytes);
    }
    Ok(())
}

pub(super) fn capture(
    root: &Path,
    version: &str,
    device: &str,
    kind: SnapshotKind,
    drafts: HashMap<String, String>,
) -> Result<ArchiveContents, String> {
    validate_template_drafts(&drafts)?;
    if kind == SnapshotKind::Cloud && !drafts.is_empty() {
        return Err("云端快照不能包含草稿".into());
    }
    let local = kind == SnapshotKind::Local;
    let mut files = BTreeMap::new();
    let mut size = 0;
    for directory in CONTENT_DIRS {
        collect(root, &root.join(directory), local, &mut files, &mut size)?;
    }
    let mut portable_names = HashSet::new();
    if files
        .keys()
        .any(|name| !portable_names.insert(name.to_lowercase()))
    {
        return Err("资料中有仅大小写不同的同名文件，无法安全跨平台恢复".into());
    }
    let summary = SnapshotSummary {
        format_version: 1,
        app_version: version.into(),
        created_at: now_millis(),
        device_name: device.into(),
        kind,
        counts: counts(&files, drafts.len()),
    };
    Ok(ArchiveContents {
        summary,
        files,
        drafts,
    })
}

/// 文件字节已经固定，压缩不再持有资料写锁。
pub(super) fn encode(contents: ArchiveContents) -> Result<(Vec<u8>, SnapshotSummary), String> {
    let ArchiveContents {
        summary,
        files,
        drafts,
    } = contents;
    let local = summary.kind == SnapshotKind::Local;
    let manifest = Manifest {
        summary: summary.clone(),
        files: files
            .iter()
            .map(|(name, bytes)| (name.clone(), bytes.len() as u64))
            .collect(),
    };
    let manifest_bytes = serde_json::to_vec(&manifest).map_err(|error| error.to_string())?;
    let draft_bytes = if local {
        serde_json::to_vec(&drafts).map_err(|error| error.to_string())?
    } else {
        Vec::new()
    };
    let total = files.values().fold(
        manifest_bytes.len().saturating_add(draft_bytes.len()),
        |size, bytes| size.saturating_add(bytes.len()),
    );
    if total > MAX_ARCHIVE_BYTES {
        return Err("资料及备份清单超过允许的大小".into());
    }
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file("manifest.json", options)
        .map_err(|error| format!("创建备份清单失败：{error}"))?;
    zip.write_all(&manifest_bytes)
        .map_err(|error| format!("写入备份清单失败：{error}"))?;
    if local {
        zip.start_file("template-drafts.json", options)
            .map_err(|error| error.to_string())?;
        zip.write_all(&draft_bytes)
            .map_err(|error| error.to_string())?;
    }
    for (name, bytes) in files {
        zip.start_file(format!("content/{name}"), options)
            .map_err(|error| format!("创建备份条目失败：{error}"))?;
        zip.write_all(&bytes)
            .map_err(|error| format!("写入备份条目失败：{error}"))?;
    }
    let bytes = zip
        .finish()
        .map_err(|error| format!("完成备份失败：{error}"))?
        .into_inner();
    if bytes.len() > MAX_ARCHIVE_BYTES {
        return Err("备份文件超过允许的大小".into());
    }
    Ok((bytes, summary))
}

pub(super) fn build(
    root: &Path,
    version: &str,
    device: &str,
    kind: SnapshotKind,
    drafts: HashMap<String, String>,
) -> Result<(Vec<u8>, SnapshotSummary), String> {
    encode(capture(root, version, device, kind, drafts)?)
}

pub(super) fn read(bytes: &[u8], cloud_only: bool) -> Result<ArchiveContents, String> {
    if bytes.len() > MAX_ARCHIVE_BYTES {
        return Err("备份文件超过允许的大小".into());
    }
    let mut zip =
        ZipArchive::new(Cursor::new(bytes)).map_err(|error| format!("备份文件无效：{error}"))?;
    if zip.len() > MAX_FILES + 2 {
        return Err("备份文件数量超过限制".into());
    }
    let mut seen = HashSet::new();
    let mut total = 0u64;
    let mut raw = BTreeMap::new();
    for index in 0..zip.len() {
        let mut file = zip
            .by_index(index)
            .map_err(|error| format!("读取备份条目失败：{error}"))?;
        let name = file.name().to_string();
        if file.is_dir()
            || !seen.insert(name.to_lowercase())
            || file
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("备份包含重复路径、目录或软链接".into());
        }
        if name != "manifest.json"
            && name != "template-drafts.json"
            && !name
                .strip_prefix("content/")
                .is_some_and(|path| allowed_file(path, true))
        {
            return Err("备份包含不允许恢复的文件路径".into());
        }
        total = total.saturating_add(file.size());
        if total > MAX_ARCHIVE_BYTES as u64 {
            return Err("备份解压后超过允许的大小".into());
        }
        let mut content = Vec::new();
        file.by_ref()
            .take(MAX_ARCHIVE_BYTES as u64 + 1)
            .read_to_end(&mut content)
            .map_err(|error| format!("读取备份内容失败：{error}"))?;
        if content.len() as u64 != file.size() {
            return Err("备份条目大小不匹配".into());
        }
        raw.insert(name, content);
    }
    let manifest: Manifest =
        serde_json::from_slice(&raw.remove("manifest.json").ok_or("备份缺少格式清单")?)
            .map_err(|error| format!("备份格式清单无效：{error}"))?;
    if manifest.summary.format_version != 1 {
        return Err("不支持此备份格式版本，请使用兼容的应用版本".into());
    }
    let local = manifest.summary.kind == SnapshotKind::Local;
    if cloud_only && local {
        return Err("云端文件不是云同步快照".into());
    }
    let drafts = match raw.remove("template-drafts.json") {
        Some(bytes) if local => serde_json::from_slice::<HashMap<String, String>>(&bytes)
            .map_err(|error| format!("模板草稿格式无效：{error}"))?,
        Some(_) => return Err("云端快照含有草稿".into()),
        None if local => return Err("本地备份缺少模板草稿清单".into()),
        None => HashMap::new(),
    };
    validate_template_drafts(&drafts)?;
    let mut files = BTreeMap::new();
    for (name, bytes) in raw {
        let relative = name
            .strip_prefix("content/")
            .ok_or("备份路径无效")?
            .to_string();
        if !allowed_file(&relative, local)
            || manifest.files.get(&relative) != Some(&(bytes.len() as u64))
        {
            return Err("备份内容与格式清单不一致".into());
        }
        validate_content(&relative, &bytes)?;
        files.insert(relative, bytes);
    }
    if files.len() != manifest.files.len()
        || counts(&files, drafts.len()) != manifest.summary.counts
    {
        return Err("备份内容数量与格式清单不一致".into());
    }
    Ok(ArchiveContents {
        summary: manifest.summary,
        files,
        drafts,
    })
}

fn validate_content(name: &str, bytes: &[u8]) -> Result<(), String> {
    let invalid = |error: String| format!("备份中的 {name} 无效：{error}");
    if name.starts_with("templates/") && name.ends_with(".json") {
        let value: crate::types::KeyTemplate =
            serde_json::from_slice(bytes).map_err(|error| invalid(error.to_string()))?;
        crate::commands::templates::validate_template(&value).map_err(invalid)?;
        if name != format!("templates/{}.json", value.id) || value.name.trim().is_empty() {
            return Err(invalid("模板标识或名称不匹配".into()));
        }
    } else if name.starts_with("song_lists/") {
        let value: crate::commands::song_lists::SongList =
            serde_json::from_slice(bytes).map_err(|error| invalid(error.to_string()))?;
        crate::commands::song_lists::validate_song_list(&value).map_err(invalid)?;
        if name != format!("song_lists/{}.json", value.id)
            || value.name.trim().is_empty()
            || value.song_filenames.iter().any(|name| !safe_basename(name))
            || value
                .cover_filename
                .as_deref()
                .is_some_and(|name| !safe_basename(name))
        {
            return Err(invalid("歌单标识或引用不合法".into()));
        }
    } else if name.starts_with("midi_projects/") {
        let value: crate::types::MidiProject =
            serde_json::from_slice(bytes).map_err(|error| invalid(error.to_string()))?;
        if !name.starts_with("midi_projects/drafts/") {
            crate::commands::midi_projects::validate_project(&value).map_err(invalid)?;
        }
        if !value.document.is_object()
            || !safe_id(&value.id)
            || (!name.starts_with("midi_projects/drafts/")
                && name != format!("midi_projects/{}.json", value.id))
        {
            return Err(invalid("项目标识或文档格式不合法".into()));
        }
    } else if let Some(filename) = name
        .strip_prefix("midi_library/")
        .and_then(|name| name.strip_suffix(".midi-config"))
    {
        let value: crate::commands::midi::MidiConfig =
            serde_json::from_slice(bytes).map_err(|error| invalid(error.to_string()))?;
        if value.filename != filename {
            return Err(invalid("MIDI 配置文件名不匹配".into()));
        }
    } else if name.starts_with("midi_library/") {
        midly::Smf::parse(bytes).map_err(|error| invalid(error.to_string()))?;
    }
    Ok(())
}
