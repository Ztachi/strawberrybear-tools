/**
 * @description: 应用设置相关 Rust 后端交互
 */
import { invoke } from '@tauri-apps/api/core'
import type { KeyTemplate, KeyMapping } from '@/types'

/** 应用设置数据结构 */
export interface AppSettings {
  locale: string
  current_template_id: string | null
  templates: TemplateData[]
}

/** 模板数据 */
export interface TemplateData {
  id: string
  name: string
  is_builtin: boolean
  mappings: KeyMapping[]
}

/** 加载设置 */
export async function loadSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>('load_settings')
}

/** 保存设置 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke('save_settings', { settings })
}

/** 转换 KeyTemplate 到 TemplateData */
export function templateToData(template: KeyTemplate): TemplateData {
  return {
    id: template.id,
    name: template.name,
    is_builtin: template.is_builtin,
    mappings: template.mappings,
  }
}

/** 转换 TemplateData 到 KeyTemplate */
export function dataToTemplate(data: TemplateData): KeyTemplate {
  return {
    id: data.id,
    name: data.name,
    is_builtin: data.is_builtin,
    mappings: data.mappings,
  }
}
