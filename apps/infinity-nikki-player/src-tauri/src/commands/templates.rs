use crate::types::{KeyMapping, KeyTemplate};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// 获取模板文件夹路径
fn get_templates_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let templates_dir = data_dir.join("templates");
    if !templates_dir.exists() {
        fs::create_dir_all(&templates_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(templates_dir)
}

/// 获取内置模板
fn get_builtin_templates() -> Vec<KeyTemplate> {
    vec![
        KeyTemplate {
            id: "piano".to_string(),
            name: "钢琴映射".to_string(),
            is_builtin: true,
            mappings: vec![
                // F 行：C2-B2（低音+）
                (36, "F1"), (38, "F2"), (40, "F3"), (41, "F4"), (43, "F5"), (45, "F6"), (47, "F7"),
                // 数字行：C5-B5（高音）
                (72, "1"), (74, "2"), (76, "3"), (77, "4"), (79, "5"), (81, "6"), (83, "7"),
                // Q-P 行：C4-B4（中央）
                (60, "Q"), (62, "W"), (64, "E"), (65, "R"), (67, "T"), (69, "Y"), (71, "U"),
                // A-L 行：C3-B3（低音）
                (48, "A"), (50, "S"), (52, "D"), (53, "F"), (55, "G"), (57, "H"), (59, "J"),
                // Z-M 行：C2-B2（低音+）
                (36, "Z"), (38, "X"), (40, "C"), (41, "V"), (43, "B"), (45, "N"), (47, "M"),
            ].iter().map(|(p, k)| KeyMapping { pitch: *p, key: k.to_string() }).collect(),
        },
        KeyTemplate {
            id: "game-4rows".to_string(),
            name: "4行键位".to_string(),
            is_builtin: true,
            mappings: vec![
                // 数字行：C5-B5（高音）
                (72, "1"), (74, "2"), (76, "3"), (77, "4"), (79, "5"), (81, "6"), (83, "7"),
                // Q-P 行：C4-B4（中央）
                (60, "Q"), (62, "W"), (64, "E"), (65, "R"), (67, "T"), (69, "Y"), (71, "U"),
                // A-L 行：C3-B3（低音）
                (48, "A"), (50, "S"), (52, "D"), (53, "F"), (55, "G"), (57, "H"), (59, "J"),
                // Z-M 行：C2-B2（低音+）
                (36, "Z"), (38, "X"), (40, "C"), (41, "V"), (43, "B"), (45, "N"), (47, "M"),
            ].iter().map(|(p, k)| KeyMapping { pitch: *p, key: k.to_string() }).collect(),
        },
    ]
}

/// 初始化内置模板文件（如果不存在）
fn ensure_builtin_templates(app: &tauri::AppHandle) -> Result<(), String> {
    let templates_dir = get_templates_dir(app)?;
    let builtins = get_builtin_templates();

    for template in builtins {
        let file_path = templates_dir.join(format!("{}.json", template.id));
        if !file_path.exists() {
            let content = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
            fs::write(&file_path, content).map_err(|e| e.to_string())?;
            log::info!("Created builtin template: {:?}", file_path);
        }
    }
    Ok(())
}

/// 获取所有模板（从文件加载）
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
#[tauri::command]
pub fn delete_template(app: tauri::AppHandle, template_id: String) -> Result<(), String> {
    // 不允许删除内置模板
    let builtins = get_builtin_templates();
    if builtins.iter().any(|t| t.id == template_id) {
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

/// 导入模板文件（从外部路径复制到模板目录）
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
