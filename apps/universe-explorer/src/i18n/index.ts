/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:26:53
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 21:15:00
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/i18n/index.ts
 * @Description: i18n 国际化初始化
 */
/**
 * @fileOverview i18n 国际化初始化
 * @description 支持 zh-CN / en-US，语言状态持久化到 URL Hash 和 localStorage
 * @description 示例：#zh-CN 或 #en-US
 */
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type Locale = 'zh-CN' | 'en-US'

const LOCALE_KEY = 'universe-explorer-locale'

/**
 * @description: 从 URL Hash 或 localStorage 读取语言
 * @return {Locale} 当前语言
 */
function getInitialLocale(): Locale {
  // 优先从 URL Hash 读取（与主站路径一致：空 → zh-CN，/en → en-US）
  const hash = window.location.hash.replace('#/', '')
  if (hash === '' || hash === 'zh-CN') {
    return 'zh-CN'
  }
  if (hash === 'en' || hash === 'en-US') {
    return 'en-US'
  }
  // 其次从 localStorage 读取
  const saved = localStorage.getItem(LOCALE_KEY)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  // 默认中文
  return 'zh-CN'
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

/**
 * @description: 切换当前语言
 * @param {Locale} locale - 目标语言
 */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  // 持久化到 localStorage
  localStorage.setItem(LOCALE_KEY, locale)
  // 更新 URL Hash（与主站路径一致：zh-CN → 空，en-US → /en）
  window.location.hash = locale === 'zh-CN' ? '' : '/en'
}

/**
 * @description: 监听 hashchange 事件，同步语言
 */
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#/', '')
  if (hash === '' || hash === 'zh-CN') {
    i18n.global.locale.value = 'zh-CN'
    localStorage.setItem(LOCALE_KEY, 'zh-CN')
  }
  if (hash === 'en' || hash === 'en-US') {
    i18n.global.locale.value = 'en-US'
    localStorage.setItem(LOCALE_KEY, 'en-US')
  }
})
