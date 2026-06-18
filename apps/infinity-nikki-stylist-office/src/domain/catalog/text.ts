/**
 * @fileOverview 资料库多语言文本工具
 * @description 提供统一回退策略，避免页面组件各自处理缺失语言时产生不一致。
 * @author strawberrybear
 * @date 2026-06-18
 */
import type { LocaleCode, LocalizedText } from './types'

/** 内容型文案缺失时的最终回退语言。 */
const FALLBACK_LOCALE: LocaleCode = 'zh-CN'

/**
 * @description: 解析多语言文案
 * @description 优先使用目标语言，缺失时回退简体中文，再回退任意已有语言。
 * @param {LocalizedText} text - 多语言文案表
 * @param {LocaleCode} locale - 目标语言
 * @return {string} 可直接显示的文案，完全缺失时返回空字符串
 */
export function resolveLocalizedText(text: LocalizedText, locale: LocaleCode): string {
  // 内容型语言包允许后续补齐，所以这里必须有稳定回退链，避免 UI 显示 undefined。
  return text[locale] ?? text[FALLBACK_LOCALE] ?? Object.values(text)[0] ?? ''
}
