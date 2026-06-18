/**
 * @fileOverview UI 偏好状态
 * @description 保存顶部语言和个人中心 tab 等轻量偏好。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { defineStore } from 'pinia'
import { DEFAULT_UI_LOCALE } from '@/i18n'
import type { LocaleCode } from '@/domain/catalog/types'

/** 个人中心支持的主分区。 */
export type ProfileTab = 'activeDraft' | 'certificates' | 'customAssets' | 'localData' | 'catalog'

export const useUiStore = defineStore('ui', {
  state: () => ({
    /** 顶部菜单控制的统一语言，同时驱动 UI 文案和模板文案。 */
    uiLocale: DEFAULT_UI_LOCALE as LocaleCode,
    /** 个人中心最近打开的 tab。 */
    profileTab: 'activeDraft' as ProfileTab,
  }),
  actions: {
    /**
     * @description: 设置 UI 语言
     * @param {LocaleCode} locale - 新的 UI 语言
     * @return {void} 无返回值
     */
    setUiLocale(locale: LocaleCode): void {
      this.uiLocale = locale
    },
    /**
     * @description: 设置个人中心 tab
     * @param {ProfileTab} tab - 目标 tab
     * @return {void} 无返回值
     */
    setProfileTab(tab: ProfileTab): void {
      this.profileTab = tab
    },
  },
  persist: {
    key: 'stylist-office-ui',
    pick: ['uiLocale', 'profileTab'],
  },
})
