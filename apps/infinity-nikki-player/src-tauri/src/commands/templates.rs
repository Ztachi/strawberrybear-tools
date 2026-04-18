//! @fileOverview 键盘模板管理命令模块
//!
//! 提供模板的加载、保存、删除等管理功能

use crate::types::{KeyTemplate};
use std::fs;
use std::path::PathBuf;
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
        fs::create_dir_all(&templates_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
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
                let content =
                    serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
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
                (84, "F1"), (86, "F2"), (88, "F3"), (89, "F4"), (91, "F5"), (93, "F6"),
                (95, "F7"),
                // 1-7 (高音数字区)
                (72, "1"), (74, "2"), (76, "3"), (77, "4"), (79, "5"), (81, "6"),
                (83, "7"),
                // Q-U (中音字母区)
                (60, "Q"), (62, "W"), (64, "E"), (65, "R"), (67, "T"), (69, "Y"),
                (71, "U"),
                // A-J (中低音字母区)
                (48, "A"), (50, "S"), (52, "D"), (53, "F"), (55, "G"), (57, "H"),
                (59, "J"),
                // Z-M (低音字母区)
                (36, "Z"), (38, "X"), (40, "C"), (41, "V"), (43, "B"), (45, "N"),
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
                (84, "1"), (86, "2"), (88, "3"), (89, "4"), (91, "5"), (93, "6"), (95, "7"),
                // 第二行
                (72, "Q"), (74, "W"), (76, "E"), (77, "R"), (79, "T"), (81, "Y"), (83, "U"),
                // 第三行
                (60, "A"), (62, "S"), (64, "D"), (65, "F"), (67, "G"), (69, "H"), (71, "J"),
                // 第四行
                (48, "Z"), (50, "X"), (52, "C"), (53, "V"), (55, "B"), (57, "N"), (59, "M"),
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
                (72, "Q"), (74, "W"), (76, "E"), (77, "R"), (79, "T"), (81, "Y"), (83, "U"),
                // 中行
                (60, "A"), (62, "S"), (64, "D"), (65, "F"), (67, "G"), (69, "H"), (71, "J"),
                // 下行
                (48, "Z"), (50, "X"), (52, "C"), (53, "V"), (55, "B"), (57, "N"), (59, "M"),
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
                (72, "Q"), (74, "W"), (76, "E"), (77, "R"), (79, "T"), (81, "Y"), (83, "U"),
                // 下行（7 键）
                (60, "A"), (62, "S"), (64, "D"), (65, "F"), (67, "G"), (69, "H"), (71, "J"),
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
    let templates_dir = get_templates_dir(&app)?;
    let file_path = templates_dir.join(format!("{}.json", template.id));

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
    let builtin_ids = get_builtin_template_ids();
    if builtin_ids.iter().any(|id| *id == template_id) {
        return Err("不能删除内置模板".to_string());
    }

    let templates_dir = get_templates_dir(&app)?;
    let file_path = templates_dir.join(format!("{}.json", template_id));

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
    let template: KeyTemplate = serde_json::from_str(&content).map_err(|e| format!("解析模板失败: {}", e))?;

    // 保存到模板目录
    save_template(app, template.clone())?;

    log::info!("Imported template: {} from {:?}", template.id, source_path);
    Ok(template)
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
    let templates_dir = get_templates_dir(&app)?;
    let file_path = templates_dir.join(format!("{}.json", template_id));

    // 读取现有模板
    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取模板文件失败: {}", e))?;
    let mut template: KeyTemplate = serde_json::from_str(&content)
        .map_err(|e| format!("解析模板失败: {}", e))?;

    // 更新名称
    template.name = new_name;

    // 保存
    let new_content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
    fs::write(&file_path, new_content).map_err(|e| e.to_string())?;

    log::info!("Renamed template {} to {}", template_id, template.name);
    Ok(template)
}
