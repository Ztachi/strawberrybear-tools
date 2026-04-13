/**
 * @description: 应用设置相关 Rust 后端交互
 */
import { invoke } from '@tauri-apps/api/core'

/** 应用设置数据结构 */
export interface AppSettings {
  locale: string
  current_template_id: string | null
  play_mode: 'auto' | 'piano'
  enable_keyboard_sim: boolean
}

/** 加载设置 */
export async function loadSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>('load_settings')
}

/** 保存设置 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke('save_settings', { settings })
}
