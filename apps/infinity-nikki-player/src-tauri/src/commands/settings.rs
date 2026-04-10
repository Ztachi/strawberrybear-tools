use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// 全局设置数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// 当前语言
    pub locale: String,
    /// 当前模板ID
    pub current_template_id: Option<String>,
    /// 模板列表
    pub templates: Vec<TemplateData>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            locale: "en-US".to_string(),
            current_template_id: None,
            templates: Vec::new(),
        }
    }
}

/// 模板数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateData {
    pub id: String,
    pub name: String,
    pub is_builtin: bool,
    pub mappings: Vec<KeyMapping>,
}

/// 键位映射
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyMapping {
    pub pitch: u8,
    pub key: String,
}

/// 获取设置文件路径
fn get_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(data_dir.join("settings.json"))
}

/// 加载设置
#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_path(&app)?;
    log::info!("Loading settings from: {:?}", path);

    if !path.exists() {
        log::info!("Settings file not found, using defaults");
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    log::info!("Settings loaded successfully");
    Ok(settings)
}

/// 保存设置
#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = get_settings_path(&app)?;
    log::info!("Saving settings to: {:?}", path);

    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    log::info!("Settings saved successfully");
    Ok(())
}
