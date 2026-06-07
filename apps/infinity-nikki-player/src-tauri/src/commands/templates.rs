//! @fileOverview 键盘模板管理命令模块
//!
//! 提供模板的加载、保存、删除等管理功能

use crate::types::KeyTemplate;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// 默认模板 ID 列表
///
/// 这些模板仅用于首次初始化，后续与用户模板没有差别
const BUILTIN_TEMPLATE_IDS: &[&str] = &["piano", "game-4rows", "21keys", "14keys"];
/// 默认模板已种子初始化的标记文件名
const DEFAULT_TEMPLATES_SEEDED_MARKER: &str = ".defaults_seeded";
/// 模板名称最大字符数，和前端输入框计数上限保持一致。
const TEMPLATE_NAME_MAX_CHARS: usize = 30;

struct TemplateFileEntry {
    template: KeyTemplate,
    modified_millis: u128,
}

/// 获取模板目录路径
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 模板目录的 PathBuf
fn get_templates_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let templates_dir = data_dir.join("templates");

    // 如果目录不存在，创建它
    if !templates_dir.exists() {
        fs::create_dir_all(&templates_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(templates_dir)
}

/// 获取内置模板 ID 列表
///
/// # Returns
///
/// 内置模板 ID 的静态切片
fn get_builtin_template_ids() -> Vec<&'static str> {
    BUILTIN_TEMPLATE_IDS.to_vec()
}

/// @description: 判断模板 ID 是否属于内置模板
///
/// # Arguments
///
/// * `template_id` - 待检查模板 ID
///
/// # Returns
///
/// true 表示该 ID 是内置模板 ID
fn is_builtin_template_id(template_id: &str) -> bool {
    BUILTIN_TEMPLATE_IDS.contains(&template_id)
}

fn builtin_template_order(template_id: &str) -> Option<usize> {
    BUILTIN_TEMPLATE_IDS
        .iter()
        .position(|builtin_id| *builtin_id == template_id)
}

/// @description: 判断模板 ID 是否可安全用于文件名
///
/// # Arguments
///
/// * `template_id` - 待检查模板 ID
///
/// # Returns
///
/// true 表示只包含 ASCII 字母、数字、横线或下划线，可安全拼接为模板文件名
fn is_safe_template_id(template_id: &str) -> bool {
    // 空 ID 会生成 ".json" 这类不可辨识文件名，必须拒绝。
    !template_id.is_empty()
        && template_id
            .chars()
            // 只允许文件名安全字符，避免路径穿越或跨平台非法文件名。
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// @description: 判断模板名称是否符合 Windows/macOS 文件名规范
///
/// # Arguments
///
/// * `template_name` - 待检查模板名称
///
/// # Returns
///
/// true 表示模板名称可直接作为跨平台文件名主体使用
fn is_valid_template_file_name(template_name: &str) -> bool {
    let name = template_name;
    if name.is_empty() || name.chars().count() > TEMPLATE_NAME_MAX_CHARS {
        return false;
    }

    // Windows 不允许这些字符，macOS/POSIX 不允许路径分隔符；统一拒绝控制字符。
    if name.chars().any(|c| {
        c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
    }) {
        return false;
    }

    // Windows 不允许文件名以空格或点结尾。
    if name.ends_with(' ') || name.ends_with('.') {
        return false;
    }

    // Windows 设备保留名即使带扩展名也不可作为文件名主体。
    let upper_name = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    !matches!(
        upper_name.as_str(),
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
    )
}

fn validate_template_name(template_name: &str) -> Result<(), String> {
    if template_name.trim().is_empty() {
        return Err("模板名称不能为空".to_string());
    }

    if !is_valid_template_file_name(template_name) {
        return Err(template_name_validation_message());
    }

    Ok(())
}

fn template_name_validation_message() -> String {
    "模板名称必须符合 Windows 和 macOS 文件名规范，不能包含 <>:\"/\\|?* 或控制字符，不能以空格或点结尾，也不能使用 CON、PRN、AUX、NUL、COM1-COM9、LPT1-LPT9 等保留名称".to_string()
}

fn template_export_entry_name(template: &KeyTemplate) -> Result<String, String> {
    if !is_valid_template_file_name(&template.name) {
        return Err(template_name_validation_message());
    }
    Ok(format!("{}.json", template.name.trim()))
}

/// @description: 归一化模板按键名
///
/// # Arguments
///
/// * `key` - 原始按键名
///
/// # Returns
///
/// 去除首尾空格并转换为大写后的按键名
fn normalize_mapping_key(key: &str) -> String {
    key.trim().to_ascii_uppercase()
}

/// @description: 判断按键名是否为当前键盘模拟器支持的映射键
///
/// # Arguments
///
/// * `key` - 待检查按键名
///
/// # Returns
///
/// true 表示按键属于 A-Z、0-9、F1-F12、常用标点或非系统控制键
fn is_supported_mapping_key(key: &str) -> bool {
    // 先归一化，保证 a/A、f1/F1 按同一个物理按键校验。
    let normalized = normalize_mapping_key(key);
    // 白名单必须和 mac_input.rs / win_input.rs 当前支持的模拟按键保持一致。
    matches!(
        normalized.as_str(),
        "A" | "B"
            | "C"
            | "D"
            | "E"
            | "F"
            | "G"
            | "H"
            | "I"
            | "J"
            | "K"
            | "L"
            | "M"
            | "N"
            | "O"
            | "P"
            | "Q"
            | "R"
            | "S"
            | "T"
            | "U"
            | "V"
            | "W"
            | "X"
            | "Y"
            | "Z"
            | "0"
            | "1"
            | "2"
            | "3"
            | "4"
            | "5"
            | "6"
            | "7"
            | "8"
            | "9"
            | "F1"
            | "F2"
            | "F3"
            | "F4"
            | "F5"
            | "F6"
            | "F7"
            | "F8"
            | "F9"
            | "F10"
            | "F11"
            | "F12"
            | "`"
            | "-"
            | "="
            | "["
            | "]"
            | "\\"
            | ";"
            | "'"
            | ","
            | "."
            | "/"
            | "SPACE"
            | "TAB"
            | "ENTER"
            | "BACKSPACE"
            | "DELETE"
            | "ARROWLEFT"
            | "ARROWUP"
            | "ARROWRIGHT"
            | "ARROWDOWN"
    )
}

/// @description: 校验自定义模板是否允许保存
///
/// # Arguments
///
/// * `template` - 待校验模板
///
/// # Returns
///
/// 校验通过返回 Ok(())；失败返回用户可读错误信息
///
/// # Notes
///
/// 模板中同一音高和同一物理按键都不允许重复。
fn validate_template(template: &KeyTemplate) -> Result<(), String> {
    // 模板 ID 会参与文件路径拼接，必须先做安全字符校验。
    if !is_safe_template_id(&template.id) {
        return Err("模板 ID 只能包含英文字母、数字、横线和下划线".to_string());
    }

    // 模板名称会参与导出文件命名，必须符合跨平台文件名规范。
    validate_template_name(&template.name)?;

    // pitches 用于拒绝一个音高对应多个按键。
    let mut pitches = std::collections::HashSet::new();
    // keys 用于拒绝一个物理按键对应多个音高。
    let mut keys = std::collections::HashSet::new();
    for mapping in &template.mappings {
        // 重复 pitch 会导致播放时 find() 命中不稳定，因此后端直接拒绝。
        if !pitches.insert(mapping.pitch) {
            return Err(format!("音高 {} 存在重复映射", mapping.pitch));
        }

        // key 在保存前归一化，避免大小写绕过重复按键校验。
        let key = normalize_mapping_key(&mapping.key);
        // Rust 键盘模拟器不支持的键不能进入模板文件。
        if !is_supported_mapping_key(&key) {
            return Err(format!("不支持的映射按键: {}", mapping.key));
        }

        // 同一物理键映射多个音高会导致按键释放/高亮语义不明确。
        if !keys.insert(key.clone()) {
            return Err(format!("按键 {} 已映射到其他音高", key));
        }
    }

    Ok(())
}

/// @description: 读取模板目录中的所有模板
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 成功解析出的模板列表
fn read_templates_from_dir(app: &tauri::AppHandle) -> Result<Vec<KeyTemplate>, String> {
    Ok(read_template_file_entries_from_dir(app)?
        .into_iter()
        .map(|entry| entry.template)
        .collect())
}

fn read_template_file_entries_from_dir(
    app: &tauri::AppHandle,
) -> Result<Vec<TemplateFileEntry>, String> {
    let templates_dir = get_templates_dir(app)?;
    let mut templates = Vec::new();

    // 读取 templates 目录下的所有 .json 文件，忽略损坏文件以保持旧行为。
    if let Ok(entries) = fs::read_dir(&templates_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            // 只加载 JSON 模板文件，跳过 marker 或其他临时文件。
            if !has_extension(&path, "json") {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(template) = serde_json::from_str::<KeyTemplate>(&content) {
                    let modified_millis = entry
                        .metadata()
                        .ok()
                        .and_then(|metadata| metadata.modified().ok())
                        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                        .map(|duration| duration.as_millis())
                        .unwrap_or(0);
                    templates.push(TemplateFileEntry {
                        template,
                        modified_millis,
                    });
                }
            }
        }
    }

    Ok(templates)
}

fn custom_template_sort_key(template: &KeyTemplate, modified_millis: u128) -> u128 {
    template
        .id
        .strip_prefix("custom-")
        .and_then(|suffix| suffix.split('-').next())
        .and_then(|timestamp| timestamp.parse::<u128>().ok())
        .unwrap_or(modified_millis)
}

fn sort_template_file_entries(entries: &mut [TemplateFileEntry]) {
    entries.sort_by(|a, b| {
        let a_builtin_order = a
            .template
            .is_builtin
            .then(|| builtin_template_order(&a.template.id))
            .flatten();
        let b_builtin_order = b
            .template
            .is_builtin
            .then(|| builtin_template_order(&b.template.id))
            .flatten();

        match (a_builtin_order, b_builtin_order) {
            (None, None) => custom_template_sort_key(&b.template, b.modified_millis)
                .cmp(&custom_template_sort_key(&a.template, a.modified_millis))
                .then_with(|| b.modified_millis.cmp(&a.modified_millis))
                .then_with(|| b.template.id.cmp(&a.template.id)),
            (Some(a_order), Some(b_order)) => a_order.cmp(&b_order),
            (None, Some(_)) => std::cmp::Ordering::Less,
            (Some(_), None) => std::cmp::Ordering::Greater,
        }
    });
}

/// @description: 校验模板名称是否与现有模板重复
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template` - 待保存模板
///
/// # Returns
///
/// 名称唯一返回 Ok(())；重复返回用户可读错误
fn validate_unique_template_name(
    app: &tauri::AppHandle,
    template: &KeyTemplate,
) -> Result<(), String> {
    let name = template.name.trim();
    for existing in read_templates_from_dir(app)? {
        // 保存同一个模板时允许名称保持不变。
        if existing.id == template.id {
            continue;
        }
        // 名称唯一规则按 trim 后原样比较，不额外做大小写折叠。
        if existing.name.trim() == name {
            return Err(format!("模板名称已存在: {}", name));
        }
    }
    Ok(())
}

/// @description: 归一化自定义模板字段
///
/// # Arguments
///
/// * `template` - 原始模板对象
///
/// # Returns
///
/// 标记为自定义、名称和 ID 去除空格、按键转大写并按音高排序后的模板
fn normalize_custom_template(mut template: KeyTemplate) -> KeyTemplate {
    // ID 只去除首尾空格；非法字符保留给 validate_template 报出明确错误。
    template.id = template.id.trim().to_string();
    // 名称去除首尾空格，避免列表中出现不可见差异。
    template.name = template.name.trim().to_string();
    // 所有通过前端/导入保存的模板都必须作为自定义模板处理。
    template.is_builtin = false;
    for mapping in &mut template.mappings {
        // 按键统一大写，保证后续重复校验和运行时查找一致。
        mapping.key = normalize_mapping_key(&mapping.key);
    }
    // 排序后导出的 JSON 稳定可读，也方便人工检查。
    template.mappings.sort_by(|a, b| a.pitch.cmp(&b.pitch));
    template
}

/// @description: 获取模板文件路径
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template_id` - 模板 ID
///
/// # Returns
///
/// 安全模板 ID 对应的 JSON 文件路径
///
/// # Errors
///
/// 模板 ID 不安全或模板目录获取失败时返回错误
fn template_file_path(app: &tauri::AppHandle, template_id: &str) -> Result<PathBuf, String> {
    // 在拼接路径前再次校验 ID，防止任意命令绕过保存入口传入危险 ID。
    if !is_safe_template_id(template_id) {
        return Err("模板 ID 只能包含英文字母、数字、横线和下划线".to_string());
    }
    Ok(get_templates_dir(app)?.join(format!("{}.json", template_id)))
}

/// @description: 生成自定义模板 ID
///
/// # Returns
///
/// 基于当前时间戳的 custom-* 模板 ID
fn generate_custom_template_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("custom-{}", millis)
}

/// @description: 为导入模板生成不会覆盖现有文件的自定义 ID
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `preferred_id` - 导入文件声明的模板 ID
///
/// # Returns
///
/// 可安全保存且不与现有模板文件冲突的模板 ID
///
/// # Notes
///
/// 导入内置模板 ID 或不安全 ID 时会改用 custom-*；已有同名文件时会继续生成新 ID。
fn make_unique_custom_id(app: &tauri::AppHandle, preferred_id: &str) -> Result<String, String> {
    // 只有安全且非内置的 preferred_id 才允许作为导入后的候选 ID。
    let mut candidate =
        if is_safe_template_id(preferred_id) && !is_builtin_template_id(preferred_id) {
            preferred_id.to_string()
        } else {
            generate_custom_template_id()
        };

    let mut suffix = 1;
    // 文件存在说明会覆盖现有模板，必须持续生成新 ID。
    while template_file_path(app, &candidate)?.exists() {
        // 追加 suffix 是为了同一毫秒内多次导入时仍能继续前进。
        candidate = format!("{}-{}", generate_custom_template_id(), suffix);
        suffix += 1;
    }

    Ok(candidate)
}

/// @description: 判断路径扩展名是否匹配
///
/// # Arguments
///
/// * `path` - 待检查路径
/// * `expected_extension` - 期望扩展名，不包含点号
///
/// # Returns
///
/// true 表示路径扩展名匹配
fn has_extension(path: &Path, expected_extension: &str) -> bool {
    // 扩展名比较统一转小写，避免 .JSON 或 .Zip 在导入时被误拒。
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case(expected_extension))
        .unwrap_or(false)
}

/// @description: 判断 ZIP entry 名称是否允许作为模板 JSON 来源
///
/// # Arguments
///
/// * `entry_name` - ZIP 内部 entry 名称
///
/// # Returns
///
/// true 表示 entry 是根目录下的 JSON 文件，且不包含路径穿越语义
fn is_safe_zip_template_entry(entry_name: &str) -> bool {
    // 目录 entry 不包含模板内容，直接排除。
    if entry_name.ends_with('/') {
        return false;
    }
    // 只接受根目录 JSON 文件，避免路径分隔符和路径穿越进入日志或导入语义。
    if entry_name.contains('/') || entry_name.contains('\\') || entry_name.contains("..") {
        return false;
    }
    // ZIP 批量导入只处理 JSON 模板文件，其他文件不参与解析。
    entry_name.to_ascii_lowercase().ends_with(".json")
}

/// @description: 将模板对象作为新的自定义模板导入并保存
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template` - 从 JSON 或 ZIP 解析出的模板
///
/// # Returns
///
/// 实际保存后的模板对象
fn save_imported_template(
    app: &tauri::AppHandle,
    mut template: KeyTemplate,
) -> Result<KeyTemplate, String> {
    // 导入名称必须先按原始内容校验，避免尾随空格/点被 trim 后绕过文件名规则。
    validate_template_name(&template.name)?;
    // 导入文件即使声明 is_builtin，也只能作为普通用户模板保存。
    template = normalize_custom_template(template);
    // 导入 ID 不能覆盖内置模板或现有自定义模板。
    template.id = make_unique_custom_id(app, &template.id)?;
    // 最终写入前统一走保存校验，防止非法 key 或重复映射进入模板目录。
    validate_template(&template)?;
    // 导入同样必须遵守名称唯一，避免列表中出现不可区分的模板。
    validate_unique_template_name(app, &template)?;

    let file_path = template_file_path(app, &template.id)?;
    // 导入保存使用 pretty JSON，方便用户导出后查看和二次编辑。
    let content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
    fs::write(&file_path, content).map_err(|e| e.to_string())?;
    Ok(template)
}

/// @description: 从 JSON 字符串导入一个模板
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `content` - JSON 文本
/// * `source_label` - 错误提示使用的来源标签
///
/// # Returns
///
/// 实际保存后的模板对象
fn import_template_from_json_content(
    app: &tauri::AppHandle,
    content: &str,
    source_label: &str,
) -> Result<KeyTemplate, String> {
    let template = parse_template_from_json_content(content, source_label)?;
    // 解析成功后统一走导入保存函数，保证 JSON 和 ZIP 入口规则一致。
    save_imported_template(app, template)
}

/// @description: 从 JSON 字符串解析模板对象
///
/// # Arguments
///
/// * `content` - JSON 文本
/// * `source_label` - 错误提示使用的来源标签
///
/// # Returns
///
/// 解析出的模板对象
fn parse_template_from_json_content(
    content: &str,
    source_label: &str,
) -> Result<KeyTemplate, String> {
    // 先按共享 KeyTemplate 结构解析，结构不匹配时立即失败。
    serde_json::from_str(content).map_err(|e| format!("解析模板失败({}): {}", source_label, e))
}

/// @description: 从单个 JSON 文件导入模板
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `source_path` - JSON 文件路径
///
/// # Returns
///
/// 实际保存后的模板对象列表
fn import_templates_from_json_file(
    app: &tauri::AppHandle,
    source_path: &Path,
) -> Result<Vec<KeyTemplate>, String> {
    // 读取源文件文本，失败时保留用户可读的错误原因。
    let content = fs::read_to_string(source_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let source_label = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("template.json");
    // 单 JSON 导入仍返回 Vec，前端可用同一套批量导入反馈。
    Ok(vec![import_template_from_json_content(
        app,
        &content,
        source_label,
    )?])
}

/// @description: 从 ZIP 文件批量导入模板
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `source_path` - ZIP 文件路径
///
/// # Returns
///
/// 实际保存后的模板对象列表
fn import_templates_from_zip_file(
    app: &tauri::AppHandle,
    source_path: &Path,
) -> Result<Vec<KeyTemplate>, String> {
    // ZIP 文件使用 File 打开，避免一次性读入整个压缩包。
    let file = File::open(source_path).map_err(|e| format!("读取 ZIP 失败: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("解析 ZIP 失败: {}", e))?;
    let mut imported_templates = Vec::new();

    for index in 0..archive.len() {
        // by_index 逐个读取 entry，任何损坏 entry 都应终止导入并提示具体错误。
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        let entry_name = entry.name().to_string();

        // 只解析安全的根目录 JSON entry，跳过目录、系统元数据和非模板文件。
        if !is_safe_zip_template_entry(&entry_name) {
            continue;
        }

        let mut content = String::new();
        // JSON 模板必须是 UTF-8 文本；读取失败说明 entry 不是有效模板。
        if entry.read_to_string(&mut content).is_err() {
            log::warn!("Skipped unreadable ZIP template entry: {}", entry_name);
            continue;
        }
        match parse_template_from_json_content(&content, &entry_name) {
            Ok(template) => imported_templates.push(template),
            Err(error) => log::warn!(
                "Skipped invalid ZIP template entry {}: {}",
                entry_name,
                error
            ),
        }
    }

    let mut saved_templates = Vec::new();
    for template in imported_templates {
        // ZIP 批量导入按条目容错：重名、非法名称或非法映射只跳过当前模板。
        match save_imported_template(app, template) {
            Ok(saved_template) => saved_templates.push(saved_template),
            Err(error) => log::warn!("Skipped invalid ZIP template during import: {}", error),
        }
    }

    Ok(saved_templates)
}

/// 首次启动时种子初始化默认模板
///
/// 如果模板目录已经有模板或 marker 已存在，则不再补回默认模板
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 成功返回 Ok(())
fn seed_default_templates_once(app: &tauri::AppHandle) -> Result<(), String> {
    let templates_dir = get_templates_dir(app)?;
    let marker_path = templates_dir.join(DEFAULT_TEMPLATES_SEEDED_MARKER);

    // marker 存在说明默认模板已经完成首次种子初始化，后续不再自动补回。
    if marker_path.exists() {
        return Ok(());
    }

    // 老版本用户目录中已经有模板时，只补 marker，避免升级时重复写默认模板。
    let has_existing_templates = read_templates_from_dir(app)?.len() > 0;
    if has_existing_templates {
        fs::write(&marker_path, b"seeded").map_err(|e| format!("写入模板初始化标记失败: {}", e))?;
        return Ok(());
    }

    let builtin_ids = get_builtin_template_ids();

    // 获取打包资源目录
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;
    let bundled_templates_dir = resource_dir.join("templates");

    // 首次初始化时为每个默认模板创建文件。
    for template_id in builtin_ids {
        let file_path = templates_dir.join(format!("{}.json", template_id));

        if !file_path.exists() {
            // 优先从打包资源复制
            let bundled_file = bundled_templates_dir.join(format!("{}.json", template_id));
            if bundled_file.exists() {
                fs::copy(&bundled_file, &file_path)
                    .map_err(|e| format!("复制模板文件失败: {}", e))?;
                log::info!("Copied bundled template: {:?}", file_path);
            } else {
                // 如果打包资源中也没有，生成默认模板
                let template = create_default_template(template_id)?;
                let content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
                fs::write(&file_path, content).map_err(|e| e.to_string())?;
                log::info!("Created default builtin template: {:?}", file_path);
            }
        }
    }

    // marker 必须在默认模板写入成功后创建，避免中途失败后下次无法继续初始化。
    fs::write(&marker_path, b"seeded").map_err(|e| format!("写入模板初始化标记失败: {}", e))?;
    Ok(())
}

/// 创建默认内置模板
///
/// 根据模板 ID 创建对应的默认键盘映射
///
/// # Arguments
///
/// * `template_id` - 模板 ID
///
/// # Returns
///
/// 创建的模板对象
///
/// # Errors
///
/// 未知模板 ID 时返回错误
///
/// # Template Details
///
/// - `piano`: 钢琴映射，包含 37 个键（F1-F7, 1-7, Q-U, A-J, Z-M）
/// - `game-4rows`: FreePiano 游戏布局，4 行按键
/// - `21keys`: 21 键布局（Q-U + A-J + Z-M）
/// - `14keys`: 14 键布局（Q-U + A-J）
fn create_default_template(template_id: &str) -> Result<KeyTemplate, String> {
    match template_id {
        "piano" => Ok(KeyTemplate {
            id: "piano".to_string(),
            name: "钢琴映射".to_string(),
            is_builtin: true,
            mappings: vec![
                // F1-F7 (高音区)
                (84, "F1"),
                (86, "F2"),
                (88, "F3"),
                (89, "F4"),
                (91, "F5"),
                (93, "F6"),
                (95, "F7"),
                // 1-7 (高音数字区)
                (72, "1"),
                (74, "2"),
                (76, "3"),
                (77, "4"),
                (79, "5"),
                (81, "6"),
                (83, "7"),
                // Q-U (中音字母区)
                (60, "Q"),
                (62, "W"),
                (64, "E"),
                (65, "R"),
                (67, "T"),
                (69, "Y"),
                (71, "U"),
                // A-J (中低音字母区)
                (48, "A"),
                (50, "S"),
                (52, "D"),
                (53, "F"),
                (55, "G"),
                (57, "H"),
                (59, "J"),
                // Z-M (低音字母区)
                (36, "Z"),
                (38, "X"),
                (40, "C"),
                (41, "V"),
                (43, "B"),
                (45, "N"),
                (47, "M"),
            ]
            .iter()
            .map(|(p, k)| crate::types::KeyMapping {
                pitch: *p,
                key: k.to_string(),
            })
            .collect(),
        }),
        "game-4rows" => Ok(KeyTemplate {
            id: "game-4rows".to_string(),
            name: "FreePiano".to_string(),
            is_builtin: true,
            mappings: vec![
                // 数字行
                (84, "1"),
                (86, "2"),
                (88, "3"),
                (89, "4"),
                (91, "5"),
                (93, "6"),
                (95, "7"),
                // 第二行
                (72, "Q"),
                (74, "W"),
                (76, "E"),
                (77, "R"),
                (79, "T"),
                (81, "Y"),
                (83, "U"),
                // 第三行
                (60, "A"),
                (62, "S"),
                (64, "D"),
                (65, "F"),
                (67, "G"),
                (69, "H"),
                (71, "J"),
                // 第四行
                (48, "Z"),
                (50, "X"),
                (52, "C"),
                (53, "V"),
                (55, "B"),
                (57, "N"),
                (59, "M"),
            ]
            .iter()
            .map(|(p, k)| crate::types::KeyMapping {
                pitch: *p,
                key: k.to_string(),
            })
            .collect(),
        }),
        "21keys" => Ok(KeyTemplate {
            id: "21keys".to_string(),
            name: "21键".to_string(),
            is_builtin: true,
            mappings: vec![
                // 上行
                (72, "Q"),
                (74, "W"),
                (76, "E"),
                (77, "R"),
                (79, "T"),
                (81, "Y"),
                (83, "U"),
                // 中行
                (60, "A"),
                (62, "S"),
                (64, "D"),
                (65, "F"),
                (67, "G"),
                (69, "H"),
                (71, "J"),
                // 下行
                (48, "Z"),
                (50, "X"),
                (52, "C"),
                (53, "V"),
                (55, "B"),
                (57, "N"),
                (59, "M"),
            ]
            .iter()
            .map(|(p, k)| crate::types::KeyMapping {
                pitch: *p,
                key: k.to_string(),
            })
            .collect(),
        }),
        "14keys" => Ok(KeyTemplate {
            id: "14keys".to_string(),
            name: "14键".to_string(),
            is_builtin: true,
            mappings: vec![
                // 上行（7 键）
                (72, "Q"),
                (74, "W"),
                (76, "E"),
                (77, "R"),
                (79, "T"),
                (81, "Y"),
                (83, "U"),
                // 下行（7 键）
                (60, "A"),
                (62, "S"),
                (64, "D"),
                (65, "F"),
                (67, "G"),
                (69, "H"),
                (71, "J"),
            ]
            .iter()
            .map(|(p, k)| crate::types::KeyMapping {
                pitch: *p,
                key: k.to_string(),
            })
            .collect(),
        }),
        _ => Err(format!("Unknown builtin template: {}", template_id)),
    }
}

/// 获取所有模板
///
/// 从模板目录加载所有模板文件
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 按业务展示顺序排列的模板列表
///
/// # Notes
///
/// 默认模板仅首次启动时种子初始化，之后用户可编辑或删除
#[tauri::command]
pub fn get_templates(app: tauri::AppHandle) -> Result<Vec<KeyTemplate>, String> {
    // 默认模板只在首次初始化时写入，后续不会补回用户删除的模板。
    seed_default_templates_once(&app)?;
    let mut entries = read_template_file_entries_from_dir(&app)?;

    // 自定义模板按新到旧展示，默认模板固定保持 BUILTIN_TEMPLATE_IDS 的声明顺序。
    sort_template_file_entries(&mut entries);

    Ok(entries.into_iter().map(|entry| entry.template).collect())
}

/// 保存模板到文件
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template` - 要保存的模板
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Notes
///
/// 文件命名为 `{template.id}.json`
#[tauri::command]
pub fn save_template(app: tauri::AppHandle, template: KeyTemplate) -> Result<(), String> {
    // 保存前先按原始名称校验，避免尾随空格/点被 normalize 静默吞掉。
    validate_template_name(&template.name)?;
    let template = normalize_custom_template(template);
    validate_template(&template)?;
    validate_unique_template_name(&app, &template)?;
    let file_path = template_file_path(&app, &template.id)?;

    let content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    log::info!("Saved template to: {:?}", file_path);
    Ok(())
}

/// 删除模板文件
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template_id` - 要删除的模板 ID
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 文件不存在时视为删除成功
#[tauri::command]
pub fn delete_template(app: tauri::AppHandle, template_id: String) -> Result<(), String> {
    let file_path = template_file_path(&app, &template_id)?;

    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
        log::info!("Deleted template: {:?}", file_path);
    }

    Ok(())
}

/// 导入模板文件
///
/// 支持单个 JSON 模板或包含多个 JSON 模板的 ZIP 文件
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `source_path` - 源 JSON 或 ZIP 文件路径
///
/// # Returns
///
/// 导入的模板对象列表
///
/// # Errors
///
/// 读取、解析或模板校验失败时返回错误
#[tauri::command]
pub fn import_template(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<Vec<KeyTemplate>, String> {
    let source_path = PathBuf::from(source_path);
    let templates = if has_extension(&source_path, "json") {
        // JSON 导入保持单模板语义，但返回 Vec 以便前端和 ZIP 共用反馈逻辑。
        import_templates_from_json_file(&app, &source_path)?
    } else if has_extension(&source_path, "zip") {
        // ZIP 导入逐个读取安全 JSON entry，每个模板都会重写为新的自定义 ID。
        import_templates_from_zip_file(&app, &source_path)?
    } else {
        // 只允许明确支持的扩展名，避免误把其他文件按 JSON 解析。
        return Err("只支持导入 .json 或 .zip 模板文件".to_string());
    };

    log::info!(
        "Imported {} template(s) from {:?}",
        templates.len(),
        source_path
    );
    Ok(templates)
}

/// 导出模板文件
///
/// 将指定模板 JSON 写入用户选择的目标路径
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template_id` - 要导出的模板 ID
/// * `target_path` - 目标 JSON 文件路径
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 模板读取、解析或目标文件写入失败时返回错误
#[tauri::command]
pub fn export_template(
    app: tauri::AppHandle,
    template_id: String,
    target_path: String,
) -> Result<(), String> {
    // template_file_path 会校验 template_id，避免读取模板目录外的文件。
    let source_path = template_file_path(&app, &template_id)?;
    let content =
        fs::read_to_string(&source_path).map_err(|e| format!("读取模板文件失败: {}", e))?;
    let template: KeyTemplate =
        serde_json::from_str(&content).map_err(|e| format!("解析模板失败: {}", e))?;
    // 导出时重新格式化 JSON，保持导出文件可读。
    let content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
    // target_path 来自系统保存对话框，直接写入用户选择的位置。
    fs::write(&target_path, content).map_err(|e| format!("导出模板失败: {}", e))?;
    log::info!("Exported template {} to {:?}", template_id, target_path);
    Ok(())
}

/// 批量导出模板 ZIP 文件
///
/// 将指定模板逐个写入 ZIP，ZIP 内每个模板是一个格式化 JSON 文件
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template_ids` - 要导出的模板 ID 列表
/// * `target_path` - 目标 ZIP 文件路径
///
/// # Returns
///
/// 成功返回 Ok(())
///
/// # Errors
///
/// 模板读取、解析或 ZIP 写入失败时返回错误
#[tauri::command]
pub fn export_templates_archive(
    app: tauri::AppHandle,
    template_ids: Vec<String>,
    target_path: String,
) -> Result<(), String> {
    // 空列表说明前端状态异常，直接拒绝，避免写出空 ZIP 误导用户。
    if template_ids.is_empty() {
        return Err("请选择要导出的模板".to_string());
    }

    let target_file = File::create(&target_path).map_err(|e| format!("创建 ZIP 失败: {}", e))?;
    let mut zip = ZipWriter::new(target_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for template_id in template_ids {
        // template_file_path 会校验 template_id，避免读取模板目录外的文件。
        let source_path = template_file_path(&app, &template_id)?;
        let content =
            fs::read_to_string(&source_path).map_err(|e| format!("读取模板文件失败: {}", e))?;
        let template: KeyTemplate =
            serde_json::from_str(&content).map_err(|e| format!("解析模板失败: {}", e))?;
        // ZIP entry 使用模板名称命名；名称保存时已按跨平台文件名规范校验。
        let entry_name = template_export_entry_name(&template)?;
        // 导出前重新格式化 JSON，保证 ZIP 内文件可读且稳定。
        let content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
        zip.start_file(entry_name, options)
            .map_err(|e| format!("写入 ZIP 条目失败: {}", e))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("写入 ZIP 内容失败: {}", e))?;
    }

    // finish 会刷新 ZIP central directory，必须成功后文件才完整可读。
    zip.finish()
        .map_err(|e| format!("完成 ZIP 导出失败: {}", e))?;
    log::info!("Exported templates archive to {:?}", target_path);
    Ok(())
}

/// 重命名模板
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `template_id` - 模板 ID
/// * `new_name` - 新名称
///
/// # Returns
///
/// 更新后的模板对象
///
/// # Errors
///
/// 读取或保存失败时返回错误
///
/// # Notes
///
/// 只能修改模板的显示名称，不修改 ID
#[tauri::command]
pub fn rename_template(
    app: tauri::AppHandle,
    template_id: String,
    new_name: String,
) -> Result<KeyTemplate, String> {
    validate_template_name(&new_name)?;

    // template_file_path 会校验 ID，避免读取模板目录外文件。
    let file_path = template_file_path(&app, &template_id)?;

    // 读取现有模板
    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取模板文件失败: {}", e))?;
    let mut template: KeyTemplate =
        serde_json::from_str(&content).map_err(|e| format!("解析模板失败: {}", e))?;

    // 更新名称
    template.name = new_name.trim().to_string();
    // 重命名后也重新归一化，保证旧文件中的按键大小写被修正。
    template = normalize_custom_template(template);
    // 写回前重新校验，避免重命名顺便保留非法旧数据。
    validate_template(&template)?;
    // 重命名也必须保持模板名称唯一，避免列表中出现同名模板。
    validate_unique_template_name(&app, &template)?;

    // 保存
    let new_content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
    fs::write(&file_path, new_content).map_err(|e| e.to_string())?;

    log::info!("Renamed template {} to {}", template_id, template.name);
    Ok(template)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::KeyMapping;

    /// @description: 构造测试用自定义模板
    ///
    /// # Arguments
    ///
    /// * `id` - 模板 ID
    /// * `mappings` - 映射列表
    ///
    /// # Returns
    ///
    /// 测试用 KeyTemplate
    fn custom_template(id: &str, mappings: Vec<KeyMapping>) -> KeyTemplate {
        KeyTemplate {
            id: id.to_string(),
            name: "Custom".to_string(),
            is_builtin: false,
            mappings,
        }
    }

    fn custom_template_with_name(name: &str) -> KeyTemplate {
        KeyTemplate {
            id: "custom-name-test".to_string(),
            name: name.to_string(),
            is_builtin: false,
            mappings: vec![],
        }
    }

    fn builtin_template(id: &str) -> KeyTemplate {
        KeyTemplate {
            id: id.to_string(),
            name: id.to_string(),
            is_builtin: true,
            mappings: vec![],
        }
    }

    fn template_entry(template: KeyTemplate, modified_millis: u128) -> TemplateFileEntry {
        TemplateFileEntry {
            template,
            modified_millis,
        }
    }

    #[test]
    fn sorts_custom_templates_newest_first_then_builtins_in_declared_order() {
        let mut entries = vec![
            template_entry(builtin_template("piano"), 10),
            template_entry(custom_template("custom-2000", vec![]), 20),
            template_entry(builtin_template("game-4rows"), 10),
            template_entry(custom_template("custom-3000", vec![]), 30),
            template_entry(builtin_template("21keys"), 10),
            template_entry(custom_template("custom-1000", vec![]), 40),
            template_entry(builtin_template("14keys"), 10),
        ];

        sort_template_file_entries(&mut entries);

        let ids: Vec<&str> = entries
            .iter()
            .map(|entry| entry.template.id.as_str())
            .collect();
        assert_eq!(
            ids,
            vec![
                "custom-3000",
                "custom-2000",
                "custom-1000",
                "piano",
                "game-4rows",
                "21keys",
                "14keys"
            ]
        );
    }

    #[test]
    fn validates_safe_template_id() {
        assert!(is_safe_template_id("custom-123_name"));
        assert!(!is_safe_template_id("../piano"));
        assert!(!is_safe_template_id("custom/name"));
        assert!(!is_safe_template_id(""));
    }

    #[test]
    fn validates_template_name_as_cross_platform_file_name() {
        assert!(is_valid_template_file_name("钢琴映射"));
        assert!(is_valid_template_file_name("FreePiano Copy"));
        assert!(!is_valid_template_file_name("bad/name"));
        assert!(!is_valid_template_file_name("bad:name"));
        assert!(!is_valid_template_file_name("bad."));
        assert!(!is_valid_template_file_name("bad "));
        assert!(!is_valid_template_file_name("CON"));
        assert!(!is_valid_template_file_name("CON.txt"));
        assert!(!is_valid_template_file_name("LPT1"));
        assert!(!is_valid_template_file_name(""));
    }

    #[test]
    fn rejects_invalid_template_name_on_save_validation() {
        assert!(validate_template(&custom_template_with_name("模板名称")).is_ok());
        assert!(validate_template(&custom_template_with_name("模板/名称")).is_err());
        assert!(validate_template(&custom_template_with_name("COM1")).is_err());
    }

    #[test]
    fn exports_archive_entries_with_template_name() {
        let template = custom_template_with_name("模板名称");
        assert_eq!(
            template_export_entry_name(&template).unwrap(),
            "模板名称.json"
        );
    }

    #[test]
    fn accepts_default_template_id_save() {
        let template = custom_template("piano", vec![]);
        assert!(validate_template(&template).is_ok());
    }

    #[test]
    fn validates_supported_keys() {
        let template = custom_template(
            "custom-ok",
            vec![
                KeyMapping {
                    pitch: 60,
                    key: "A".to_string(),
                },
                KeyMapping {
                    pitch: 61,
                    key: "F12".to_string(),
                },
                KeyMapping {
                    pitch: 62,
                    key: "Space".to_string(),
                },
                KeyMapping {
                    pitch: 63,
                    key: "/".to_string(),
                },
            ],
        );
        assert!(validate_template(&template).is_ok());
    }

    #[test]
    fn rejects_unsupported_keys() {
        let template = custom_template(
            "custom-bad",
            vec![KeyMapping {
                pitch: 60,
                key: "Escape".to_string(),
            }],
        );
        assert!(validate_template(&template).is_err());
    }

    #[test]
    fn rejects_duplicate_keys() {
        let template = custom_template(
            "custom-dup",
            vec![
                KeyMapping {
                    pitch: 60,
                    key: "A".to_string(),
                },
                KeyMapping {
                    pitch: 61,
                    key: "a".to_string(),
                },
            ],
        );
        assert!(validate_template(&normalize_custom_template(template)).is_err());
    }

    #[test]
    fn validates_safe_zip_template_entries() {
        // 根目录 JSON 模板是批量导入唯一允许解析的 entry。
        assert!(is_safe_zip_template_entry("custom-template.json"));
        // 嵌套路径可能混入目录语义，批量导入时不解析。
        assert!(!is_safe_zip_template_entry("nested/custom-template.json"));
        // 路径穿越 entry 即使不落盘也要拒绝，避免安全语义混乱。
        assert!(!is_safe_zip_template_entry("../custom-template.json"));
        // 非 JSON 文件不属于模板导入范围。
        assert!(!is_safe_zip_template_entry("readme.txt"));
    }
}
