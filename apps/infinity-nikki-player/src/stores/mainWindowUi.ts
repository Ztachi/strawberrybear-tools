/**
 * @fileOverview 主窗口 UI 状态
 * @description 管理全局悬浮按钮等跨页面 UI 协作状态。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

type BackToTopHandler = () => void
type LocateCurrentHandler = () => void

interface FloatingActionEntry<THandler extends () => void> {
  token: symbol
  handler: THandler
  visible: boolean
}

export type FloatingActionRegistration = (() => void) & {
  setVisible: (visible: boolean) => void
}

export const useMainWindowUiStore = defineStore('mainWindowUi', () => {
  /** 仅当前应用会话的详情跟随偏好，首次关闭；不参与 Player 状态机。 */
  const autoSwitchDetail = ref(false)
  /** 独立 MIDI 编辑窗口的当前项目；非空时主路由必须缓存对应编辑会话。 */
  const detachedMidiEditorProjectId = ref<string | null>(null)
  const detachedMidiEditorStatus = ref<'docked' | 'opening' | 'detached'>('docked')
  const canBackToTop = ref(false)
  const canLocateCurrent = ref(false)
  let focusMidiEditorWindowHandler: (() => Promise<void>) | null = null

  // 右下角悬浮按钮是全局入口，但实际目标会随界面焦点变化。
  // 页面先注册，抽屉/浮层打开后再注册并位于栈顶；关闭时出栈，按钮自然回到下层页面。
  let backToTopStack: FloatingActionEntry<BackToTopHandler>[] = []
  let locateCurrentStack: FloatingActionEntry<LocateCurrentHandler>[] = []

  function getTopEntry<THandler extends () => void>(
    stack: FloatingActionEntry<THandler>[]
  ): FloatingActionEntry<THandler> | null {
    return stack[stack.length - 1] ?? null
  }

  function syncBackToTopVisible(): void {
    canBackToTop.value = Boolean(getTopEntry(backToTopStack)?.visible)
  }

  function syncLocateCurrentVisible(): void {
    canLocateCurrent.value = Boolean(getTopEntry(locateCurrentStack)?.visible)
  }

  function registerBackToTop(handler: BackToTopHandler): FloatingActionRegistration {
    const token = Symbol('back-to-top')
    const entry: FloatingActionEntry<BackToTopHandler> = {
      token,
      handler,
      visible: false,
    }
    backToTopStack = [...backToTopStack, entry]
    syncBackToTopVisible()

    const unregister = (() => {
      backToTopStack = backToTopStack.filter((item) => item.token !== token)
      syncBackToTopVisible()
    }) as FloatingActionRegistration

    unregister.setVisible = (visible: boolean) => {
      const target = backToTopStack.find((item) => item.token === token)
      if (!target) return
      target.visible = visible
      syncBackToTopVisible()
    }

    return unregister
  }

  function setBackToTopVisible(visible: boolean): void {
    const target = getTopEntry(backToTopStack)
    if (!target) return syncBackToTopVisible()
    target.visible = visible
    syncBackToTopVisible()
  }

  function registerLocateCurrent(handler: LocateCurrentHandler): FloatingActionRegistration {
    const token = Symbol('locate-current')
    const entry: FloatingActionEntry<LocateCurrentHandler> = {
      token,
      handler,
      visible: false,
    }
    locateCurrentStack = [...locateCurrentStack, entry]
    syncLocateCurrentVisible()

    const unregister = (() => {
      locateCurrentStack = locateCurrentStack.filter((item) => item.token !== token)
      syncLocateCurrentVisible()
    }) as FloatingActionRegistration

    unregister.setVisible = (visible: boolean) => {
      const target = locateCurrentStack.find((item) => item.token === token)
      if (!target) return
      target.visible = visible
      syncLocateCurrentVisible()
    }

    return unregister
  }

  function setLocateCurrentVisible(visible: boolean): void {
    const target = getTopEntry(locateCurrentStack)
    if (!target) return syncLocateCurrentVisible()
    target.visible = visible
    syncLocateCurrentVisible()
  }

  function triggerBackToTop(): void {
    getTopEntry(backToTopStack)?.handler()
  }

  function triggerLocateCurrent(): void {
    getTopEntry(locateCurrentStack)?.handler()
  }

  function clearBackToTop(): void {
    backToTopStack = []
    syncBackToTopVisible()
  }

  function clearLocateCurrent(): void {
    locateCurrentStack = []
    syncLocateCurrentVisible()
  }

  /**
   * @description: 注册当前独立 MIDI 编辑窗口
   * @param {string} projectId 项目 ID
   * @param {() => Promise<void>} focus 激活窗口动作
   * @return {void}
   */
  function registerDetachedMidiEditor(projectId: string, focus: () => Promise<void>): void {
    detachedMidiEditorProjectId.value = projectId
    focusMidiEditorWindowHandler = focus
  }

  function setDetachedMidiEditorStatus(status: 'docked' | 'opening' | 'detached'): void {
    detachedMidiEditorStatus.value = status
    if (status === 'docked') {
      detachedMidiEditorProjectId.value = null
      focusMidiEditorWindowHandler = null
    }
  }

  /**
   * @description: 若已有独立编辑窗口则激活它
   * @param {string} [projectId] 用户准备编辑的项目 ID
   * @return {'none' | 'same' | 'other'} 没有窗口、同项目或其他项目
   */
  function focusDetachedMidiEditor(projectId?: string): 'none' | 'same' | 'other' {
    if (!detachedMidiEditorProjectId.value || !focusMidiEditorWindowHandler) return 'none'
    void focusMidiEditorWindowHandler()
    return !projectId || projectId === detachedMidiEditorProjectId.value ? 'same' : 'other'
  }

  return {
    autoSwitchDetail,
    detachedMidiEditorProjectId,
    detachedMidiEditorStatus,
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
    registerDetachedMidiEditor,
    setDetachedMidiEditorStatus,
    focusDetachedMidiEditor,
  }
})
