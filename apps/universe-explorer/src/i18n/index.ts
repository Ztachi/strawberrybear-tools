/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:26:53
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:26:54
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/i18n/index.ts
 * @Description:
 */
/**
 * @fileOverview i18n 国际化初始化
 * @description 支持 zh-CN / en-US，默认中文
 */
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type Locale = 'zh-CN' | 'en-US'

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
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
}
