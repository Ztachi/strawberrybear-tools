/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:22:02
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:22:04
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/i18n/index.ts
 * @Description:
 */
/**
 * @fileOverview vue-i18n 初始化
 * @description 配置国际化实例，支持 zh-CN 和 en-US，默认中文
 * @author strawberrybear
 * @date 2026-04-18
 */

import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'

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
 * @return {void}
 */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
}
