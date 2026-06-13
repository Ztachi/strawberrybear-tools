/**
 * @fileOverview 主窗口 UI 状态
 * @description 管理全局悬浮按钮等跨页面 UI 协作状态。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

type BackToTopHandler = () => void

export const useMainWindowUiStore = defineStore('mainWindowUi', () => {
  const canBackToTop = ref(false)
  let activeBackToTopToken: symbol | null = null
  let backToTopHandler: BackToTopHandler | null = null

  function registerBackToTop(handler: BackToTopHandler): () => void {
    const token = Symbol('back-to-top')
    activeBackToTopToken = token
    backToTopHandler = handler
    canBackToTop.value = false

    return () => {
      if (activeBackToTopToken !== token) return
      activeBackToTopToken = null
      backToTopHandler = null
      canBackToTop.value = false
    }
  }

  function setBackToTopVisible(visible: boolean): void {
    if (!backToTopHandler) {
      canBackToTop.value = false
      return
    }
    canBackToTop.value = visible
  }

  function triggerBackToTop(): void {
    backToTopHandler?.()
  }

  function clearBackToTop(): void {
    activeBackToTopToken = null
    backToTopHandler = null
    canBackToTop.value = false
  }

  return {
    canBackToTop,
    registerBackToTop,
    setBackToTopVisible,
    triggerBackToTop,
    clearBackToTop,
  }
})
