/**
 * @fileOverview UI 偏好状态
 * @description 保存界面语言、最近证书语言和个人中心 tab 等轻量偏好。
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
    /** 顶部菜单控制的 UI 语言，不直接控制证书渲染语言。 */
    uiLocale: DEFAULT_UI_LOCALE as LocaleCode,
    /** 新草稿创建时默认使用的证书语言，用户可在登记页单独修改。 */
    lastCertificateLocale: DEFAULT_UI_LOCALE as LocaleCode,
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
     * @description: 记录最近使用的证书语言
     * @param {LocaleCode} locale - 新的证书语言
     * @return {void} 无返回值
     */
    setLastCertificateLocale(locale: LocaleCode): void {
      this.lastCertificateLocale = locale
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
    pick: ['uiLocale', 'lastCertificateLocale', 'profileTab'],
  },
})
