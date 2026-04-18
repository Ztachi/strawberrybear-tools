/**
 * @fileOverview 设置交互模块
 * @description 提供与 Rust 后端交互的应用设置加载和保存功能
 */
import { invoke } from '@tauri-apps/api/core'

/**
 * @description: 应用设置数据结构
 */
export interface AppSettings {
  /** 当前语言 */
  locale: string
  /** 当前模板 ID */
  current_template_id: string | null
  /** 演奏模式 */
  play_mode: 'auto' | 'piano'
  /** 是否启用键盘模拟 */
  enable_keyboard_sim: boolean
}

/**
 * @description: 加载应用设置
 * @return {Promise<AppSettings>} 应用设置对象
 */
export async function loadSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>('load_settings')
}

/**
 * @description: 保存应用设置
 * @param {AppSettings} settings - 要保存的设置对象
 * @return Promise
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke('save_settings', { settings })
}
