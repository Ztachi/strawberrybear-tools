/**
 * @fileOverview 国际化配置模块
 * @description 提供多语言支持，从 Rust 后端获取系统语言偏好
 */
import { createI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

/** 支持的语言类型 */
export type LocaleType = 'zh-CN' | 'en-US'

/**
 * @description: 从 Rust 后端获取系统语言
 * @description 优先使用后端检测的系统语言，回退到浏览器语言
 * @return Promise 检测到的语言
 */
async function getSystemLocale(): Promise<LocaleType> {
  try {
    const locale = await invoke<string>('get_system_locale')
    if (locale.startsWith('zh')) {
      return 'zh-CN'
    }
  } catch {
    // 回退到浏览器语言
    const browserLocale = navigator.language
    if (browserLocale.startsWith('zh')) {
      return 'zh-CN'
    }
  }
  return 'en-US'
}

/** 支持的语言列表（用于语言切换 UI） */
export const SUPPORTED_LOCALES: { value: LocaleType; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'EN' },
]

/** Vue i18n 实例 */
export const i18n = createI18n({
  legacy: false,
  locale: 'en-US', // 默认英文，initI18n 后会更新
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

/**
 * @description: 初始化 i18n
 * @description 从后端获取系统语言并设置到 i18n 实例
 * @return Promise 最终设置的语言
 */
export async function initI18n() {
  const locale = await getSystemLocale()
  i18n.global.locale.value = locale
  return locale
}

export default i18n
