/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:21:33
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:21:35
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/stores/settings.ts
 * @Description:
 */
/**
 * @fileOverview 设置状态管理 Store
 * @description 管理敏感词扫描相关的用户设置，自动持久化到 localStorage
 * @author strawberrybear
 * @date 2026-04-18
 */

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Settings } from '../types'

const STORAGE_KEY = 'swc-settings'

function loadFromStorage(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Settings
  } catch {
    // 忽略解析错误，使用默认值
  }
  return { caseSensitive: false, ignorePunctuation: false }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = loadFromStorage()
  const caseSensitive = ref(saved.caseSensitive)
  const ignorePunctuation = ref(saved.ignorePunctuation)

  // 自动持久化到 localStorage
  watch(
    [caseSensitive, ignorePunctuation],
    () => {
      const settings: Settings = {
        caseSensitive: caseSensitive.value,
        ignorePunctuation: ignorePunctuation.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    },
    { deep: true }
  )

  /**
   * @description: 获取当前设置快照
   * @return {Settings} 当前设置对象
   */
  function getSettings(): Settings {
    return {
      caseSensitive: caseSensitive.value,
      ignorePunctuation: ignorePunctuation.value,
    }
  }

  return {
    caseSensitive,
    ignorePunctuation,
    getSettings,
  }
})
