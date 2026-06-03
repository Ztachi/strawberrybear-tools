//! @fileOverview 键盘模板管理命令模块
//!
//! 提供模板的加载、保存、删除等管理功能

use crate::types::KeyTemplate;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// 内置模板 ID 列表
///
/// 这些模板是应用内置的，不能被删除
const BUILTIN_TEMPLATE_IDS: &[&str] = &["piano", "game-4rows", "21keys", "14keys"];

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
/// true 表示按键属于 A-Z、0-9 或 F1-F12
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
/// 内置模板不可通过此函数校验；模板中同一音高和同一物理按键都不允许重复。
fn validate_template(template: &KeyTemplate) -> Result<(), String> {
    // 模板 ID 会参与文件路径拼接，必须先做安全字符校验。
    if !is_safe_template_id(&template.id) {
        return Err("模板 ID 只能包含英文字母、数字、横线和下划线".to_string());
    }

    // 空名称会让模板列表不可读，也不利于导出文件命名。
    if template.name.trim().is_empty() {
        return Err("模板名称不能为空".to_string());
    }

    // 自定义保存入口不允许写入 is_builtin，也不能占用任何内置模板 ID。
    if template.is_builtin || is_builtin_template_id(&template.id) {
        return Err("不能保存或覆盖内置模板".to_string());
    }

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

/// 确保内置模板文件存在
///
/// 如果模板文件不存在，优先从打包资源复制，否则生成默认模板
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
///
/// # Returns
///
/// 成功返回 Ok(())
fn ensure_builtin_templates(app: &tauri::AppHandle) -> Result<(), String> {
    let templates_dir = get_templates_dir(app)?;
    let builtin_ids = get_builtin_template_ids();

    // 获取打包资源目录
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;
    let bundled_templates_dir = resource_dir.join("templates");

    // 为每个内置模板确保文件存在
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
/// 按 ID 排序的模板列表
///
/// # Notes
///
/// 内置模板会确保存在，自定义模板从 JSON 文件加载
#[tauri::command]
pub fn get_templates(app: tauri::AppHandle) -> Result<Vec<KeyTemplate>, String> {
    // 确保内置模板文件存在
    ensure_builtin_templates(&app)?;

    let templates_dir = get_templates_dir(&app)?;
    let mut templates = Vec::new();

    // 读取 templates 目录下的所有 .json 文件
    if let Ok(entries) = fs::read_dir(&templates_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(template) = serde_json::from_str::<KeyTemplate>(&content) {
                        templates.push(template);
                    }
                }
            }
        }
    }

    // 按 ID 排序
    templates.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(templates)
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
    let template = normalize_custom_template(template);
    validate_template(&template)?;
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
/// 内置模板不允许删除
#[tauri::command]
pub fn delete_template(app: tauri::AppHandle, template_id: String) -> Result<(), String> {
    // 不允许删除内置模板
    if is_builtin_template_id(&template_id) {
        return Err("不能删除内置模板".to_string());
    }

    let file_path = template_file_path(&app, &template_id)?;

    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
        log::info!("Deleted template: {:?}", file_path);
    }

    Ok(())
}

/// 导入模板文件
///
/// 从外部路径复制模板到模板目录
///
/// # Arguments
///
/// * `app` - Tauri 应用句柄
/// * `source_path` - 源文件路径
///
/// # Returns
///
/// 导入的模板对象
///
/// # Errors
///
/// 读取或解析失败时返回错误
#[tauri::command]
pub fn import_template(app: tauri::AppHandle, source_path: String) -> Result<KeyTemplate, String> {
    // 读取源文件
    let content = fs::read_to_string(&source_path).map_err(|e| format!("读取文件失败: {}", e))?;
    // 先按共享 KeyTemplate 结构解析，结构不匹配时立即失败。
    let mut template: KeyTemplate =
        serde_json::from_str(&content).map_err(|e| format!("解析模板失败: {}", e))?;

    // 导入文件即使声明 is_builtin，也只能作为自定义模板保存。
    template = normalize_custom_template(template);
    // 导入 ID 不能覆盖内置模板或现有自定义模板。
    template.id = make_unique_custom_id(&app, &template.id)?;
    // 最终写入前统一走保存校验，防止非法 key 或重复映射进入模板目录。
    validate_template(&template)?;

    // 保存到模板目录
    let file_path = template_file_path(&app, &template.id)?;
    // 导入保存使用 pretty JSON，方便用户导出后查看和二次编辑。
    let content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    log::info!("Imported template: {} from {:?}", template.id, source_path);
    Ok(template)
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
    // 导出内置模板前也要确保用户数据目录中存在内置模板文件。
    ensure_builtin_templates(&app)?;
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
    // 内置模板名称由前端国际化展示，不允许通过用户数据文件重命名。
    if is_builtin_template_id(&template_id) {
        return Err("不能重命名内置模板".to_string());
    }
    if new_name.trim().is_empty() {
        return Err("模板名称不能为空".to_string());
    }

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

    #[test]
    fn validates_safe_template_id() {
        assert!(is_safe_template_id("custom-123_name"));
        assert!(!is_safe_template_id("../piano"));
        assert!(!is_safe_template_id("custom/name"));
        assert!(!is_safe_template_id(""));
    }

    #[test]
    fn rejects_builtin_save() {
        let template = custom_template("piano", vec![]);
        assert!(validate_template(&template).is_err());
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
}
