/**
 * @fileOverview 主窗口 UI 状态
 * @description 管理全局悬浮按钮等跨页面 UI 协作状态。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

type BackToTopHandler = () => void
type LocateCurrentHandler = () => void

export const useMainWindowUiStore = defineStore('mainWindowUi', () => {
  const canBackToTop = ref(false)
  const canLocateCurrent = ref(false)
  let activeBackToTopToken: symbol | null = null
  let backToTopHandler: BackToTopHandler | null = null
  let activeLocateCurrentToken: symbol | null = null
  let locateCurrentHandler: LocateCurrentHandler | null = null

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

  function registerLocateCurrent(handler: LocateCurrentHandler): () => void {
    const token = Symbol('locate-current')
    activeLocateCurrentToken = token
    locateCurrentHandler = handler
    canLocateCurrent.value = false

    return () => {
      if (activeLocateCurrentToken !== token) return
      activeLocateCurrentToken = null
      locateCurrentHandler = null
      canLocateCurrent.value = false
    }
  }

  function setLocateCurrentVisible(visible: boolean): void {
    if (!locateCurrentHandler) {
      canLocateCurrent.value = false
      return
    }
    canLocateCurrent.value = visible
  }

  function triggerBackToTop(): void {
    backToTopHandler?.()
  }

  function triggerLocateCurrent(): void {
    locateCurrentHandler?.()
  }

  function clearBackToTop(): void {
    activeBackToTopToken = null
    backToTopHandler = null
    canBackToTop.value = false
  }

  function clearLocateCurrent(): void {
    activeLocateCurrentToken = null
    locateCurrentHandler = null
    canLocateCurrent.value = false
  }

  return {
    canBackToTop,
    canLocateCurrent,
    registerBackToTop,
    registerLocateCurrent,
    setBackToTopVisible,
    setLocateCurrentVisible,
    triggerBackToTop,
    triggerLocateCurrent,
    clearBackToTop,
    clearLocateCurrent,
  }
})
