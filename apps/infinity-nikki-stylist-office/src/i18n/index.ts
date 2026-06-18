/**
 * @fileOverview 国际化初始化
 * @description 配置 Vue I18n 四语言 UI 文案；模板文案由独立语言模块维护。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US'
import jaJP from './locales/ja-JP'
import zhCN from './locales/zh-CN'
import zhTW from './locales/zh-TW'
import type { LocaleCode } from '@/domain/catalog/types'

/** UI 默认语言，符合需求默认简体中文。 */
export const DEFAULT_UI_LOCALE: LocaleCode = 'zh-CN'

/**
 * @description: UI 语言选项
 * @description icon 使用 Vuetify MDI 名称，LanguageSwitcher 直接消费，避免组件硬编码语言集合。
 */
export const UI_LOCALE_OPTIONS: Array<{
  value: LocaleCode
  labelKey: string
  icon: string
}> = [
  { value: 'zh-CN', labelKey: 'common.language.zhCN', icon: 'mdi-ideogram-cjk' },
  { value: 'zh-TW', labelKey: 'common.language.zhTW', icon: 'mdi-ideogram-cjk-variant' },
  { value: 'en-US', labelKey: 'common.language.enUS', icon: 'mdi-alphabetical-variant' },
  { value: 'ja-JP', labelKey: 'common.language.jaJP', icon: 'mdi-syllabary-hiragana' },
]

/** Vue I18n 实例，legacy=false 便于组合式 API 使用。 */
export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_UI_LOCALE,
  fallbackLocale: DEFAULT_UI_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'en-US': enUS,
    'ja-JP': jaJP,
  },
})

/**
 * @description: 切换顶部统一语言
 * @description Vue I18n 负责 UI 即时刷新，当前草稿语言由顶部组件同步写入 Dexie。
 * @param {LocaleCode} locale - 目标 UI 语言
 * @return {void} 无返回值
 */
export function setUiLocale(locale: LocaleCode): void {
  i18n.global.locale.value = locale
}
