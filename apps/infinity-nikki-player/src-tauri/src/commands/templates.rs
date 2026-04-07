use crate::types::KeyTemplate;
use crate::AppState;
use tauri::State;

/// 获取所有模板
#[tauri::command]
pub fn get_templates(state: State<'_, AppState>) -> Vec<KeyTemplate> {
    state.templates.lock().clone()
}

/// 保存模板
#[tauri::command]
pub fn save_template(state: State<'_, AppState>, template: KeyTemplate) -> Result<(), String> {
    let mut templates = state.templates.lock();

    // 查找是否已存在
    if let Some(idx) = templates.iter().position(|t| t.id == template.id) {
        templates[idx] = template;
    } else {
        templates.push(template);
    }

    Ok(())
}

/// 删除模板
#[tauri::command]
pub fn delete_template(state: State<'_, AppState>, template_id: String) -> Result<(), String> {
    let mut templates = state.templates.lock();

    // 查找模板
    if let Some(idx) = templates.iter().position(|t| t.id == template_id) {
        // 不允许删除内置模板
        if templates[idx].is_builtin {
            return Err("不能删除内置模板".to_string());
        }
        templates.remove(idx);
    }

    Ok(())
}
