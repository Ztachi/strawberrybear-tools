/**
 * @fileOverview 国际化配置模块
 * @description 提供多语言支持，从 Rust 后端获取系统语言偏好
 */
import { createI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

/** 英文是全局兜底语言，新增语言包时不应改变该回退策略。 */
export const DEFAULT_LOCALE = 'en-US'

/** 已注册语言包表；语言类型、切换列表和 i18n messages 均从这里派生。 */
const LANGUAGE_PACKS = {
  'zh-CN': {
    label: '中文',
    messages: zhCN,
  },
  'en-US': {
    label: 'EN',
    messages: enUS,
  },
} as const

/** 支持的语言类型来自语言包注册表，避免在组件或流程代码中手写联合类型。 */
export type LocaleType = keyof typeof LANGUAGE_PACKS

/** 支持的语言列表（用于语言切换 UI） */
export const SUPPORTED_LOCALES = Object.entries(LANGUAGE_PACKS).map(([value, pack]) => ({
  value: value as LocaleType,
  label: pack.label,
}))

/** Vue i18n 使用的消息表，与语言包注册表保持同源。 */
const localeMessages = Object.fromEntries(
  Object.entries(LANGUAGE_PACKS).map(([locale, pack]) => [locale, pack.messages])
) as Record<LocaleType, (typeof LANGUAGE_PACKS)[LocaleType]['messages']>

/**
 * @description: 将系统返回的语言标识标准化为 BCP 47 格式。
 * @param {string} locale - 系统或浏览器返回的原始语言标识
 * @return {string | null} 标准化后的语言标识，无法解析时返回 null
 */
function normalizeLocale(locale: string): string | null {
  try {
    return Intl.getCanonicalLocales(locale.replace('_', '-'))[0] ?? null
  } catch {
    return null
  }
}

/**
 * @description: 判断传入语言是否存在于统一语言数据源中。
 * @param {string} locale - 待校验的语言标识
 * @return {boolean} 是否为当前应用支持的语言
 */
export function isSupportedLocale(locale: string): locale is LocaleType {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_PACKS, locale)
}

/**
 * @description: 从候选语言中选择已注册语言包，未命中时统一回退英文。
 * @param {string[]} localeCandidates - 按优先级排列的系统或浏览器语言候选值
 * @return {LocaleType} 应用最终使用的语言
 */
function resolveSupportedLocale(localeCandidates: string[]): LocaleType {
  for (const locale of localeCandidates) {
    const normalizedLocale = normalizeLocale(locale)
    if (normalizedLocale && isSupportedLocale(normalizedLocale)) {
      return normalizedLocale
    }
  }

  return DEFAULT_LOCALE
}

/**
 * @description: 获取系统偏好语言，只有存在对应语言包时才使用，否则回退英文。
 * @return {Promise<LocaleType>} 应用最终使用的语言
 */
export async function getPreferredLocale(): Promise<LocaleType> {
  try {
    const systemLocale = await invoke<string>('get_system_locale')
    return resolveSupportedLocale([systemLocale])
  } catch {
    const browserLocales =
      navigator.languages && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]
    return resolveSupportedLocale(browserLocales)
  }
}

/** Vue i18n 实例 */
export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: localeMessages,
})

/**
 * @description: 初始化 i18n
 * @description 从后端获取系统语言并设置到 i18n 实例
 * @return Promise 最终设置的语言
 */
export async function initI18n() {
  const locale = await getPreferredLocale()
  i18n.global.locale.value = locale
  return locale
}

export default i18n
