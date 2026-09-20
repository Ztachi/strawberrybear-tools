/**
 * @fileOverview 编辑会话的 Vue 包装
 * @description 把 headless `EditorSession` 映射为 shallowRef 快照，并安装全局快捷键。
 * 不含生命周期钩子：项目异步载入后才创建，由页面负责 `dispose`。
 */
import { shallowRef } from 'vue'
import { createEditorSession } from '@strawberrybear/midi-editor'
import type {
  EditorAction,
  EditorSession,
  EditorSessionOptions,
  EditorSessionState,
  MidiProject,
} from '@strawberrybear/midi-editor'

/** 快捷键宿主回调：与会话无关的动作（播放、聚焦等）由页面提供。 */
export interface EditorShortcutHandlers {
  /** 空格：播放/暂停。 */
  togglePlayback: () => void
  /** Ctrl/Cmd+S：保存。 */
  save: () => void
  /** Ctrl/Cmd+V 的落点 tick；返回 undefined 时贴到选区起点。 */
  pasteTick?: () => number | undefined
}

/**
 * @description: 焦点是否处于文本输入控件，此时不拦截快捷键
 * @param {EventTarget | null} target 事件目标
 * @return {boolean} 是否在输入控件内
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  // Slider 的焦点在 div，不能只识别 input；控件自己的空格/方向键不能再触发编辑器。
  return !!target.closest(
    'input, textarea, select, button, [contenteditable="true"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="menu"], [role="dialog"], [role="listbox"]'
  )
}

/**
 * @description: 创建响应式编辑会话
 * @param {MidiProject} project 初始项目
 * @param {EditorSessionOptions} options 会话选项（本地化轨名等）
 */
export function useMidiEditorSession(project: MidiProject, options: EditorSessionOptions) {
  const session: EditorSession = createEditorSession(project, options)
  const state = shallowRef<EditorSessionState>(session.getState())
  let nudgeGesture: { key: string; shift: boolean; coalesceKey: string } | null = null
  let nudgeSequence = 0
  const unsubscribe = session.subscribe((next) => {
    state.value = next
  })

  /**
   * @description: 派发编辑动作
   * @param {EditorAction} action 动作
   * @return {void}
   */
  function dispatch(action: EditorAction): void {
    nudgeGesture = null
    session.dispatch(action)
  }

  function nudge(event: KeyboardEvent, deltaTick: number, deltaPitch: number): void {
    if (!event.repeat || nudgeGesture?.key !== event.key || nudgeGesture.shift !== event.shiftKey) {
      nudgeGesture = { key: event.key, shift: event.shiftKey, coalesceKey: `nudge-${++nudgeSequence}` }
    }
    // 每次独立按下使用新 key；自动重复实时更新画面，但只保留一个撤销节点。
    session.dispatch({ type: 'nudge', deltaTick, deltaPitch, coalesceKey: nudgeGesture.coalesceKey })
  }

  /**
   * @description: 解析键盘事件为编辑动作或宿主动作
   * @param {KeyboardEvent} event 键盘事件
   * @param {EditorShortcutHandlers} handlers 宿主回调
   * @return {boolean} 是否已处理（需阻止默认行为）
   */
  function handleKeydown(event: KeyboardEvent, handlers: EditorShortcutHandlers): boolean {
    if (event.defaultPrevented || isTypingTarget(event.target)) {
      nudgeGesture = null
      return false
    }
    const mod = event.metaKey || event.ctrlKey
    if (mod || !event.key.startsWith('Arrow')) nudgeGesture = null
    const key = event.key.toLowerCase()
    // 长按方向键允许连续微调；保存、粘贴、复制一份和播放切换按一次只执行一次。
    if (event.repeat && (key === ' ' || (mod && ['s', 'c', 'x', 'v', 'd'].includes(key)))) return true
    const current = state.value
    // 方向键时间微调步长：吸附关闭时退回一拍。
    const step = session.snapStep() || current.document.ticksPerBeat

    if (mod) {
      switch (key) {
        case 'z':
          dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
          return true
        case 'y':
          dispatch({ type: 'redo' })
          return true
        case 'a':
          dispatch({ type: 'select-all' })
          return true
        case 'c':
          dispatch({ type: 'copy' })
          return true
        case 'x':
          dispatch({ type: 'cut' })
          return true
        case 'v':
          dispatch({ type: 'paste', atTick: handlers.pasteTick?.() })
          return true
        case 'd':
          dispatch({ type: 'duplicate' })
          return true
        case 's':
          handlers.save()
          return true
        default:
          return false
      }
    }

    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        if (current.selection.size === 0) return false
        dispatch({ type: 'delete', noteIds: Array.from(current.selection) })
        return true
      case 'Escape':
        dispatch({ type: 'clear-selection' })
        return true
      case ' ':
        handlers.togglePlayback()
        return true
      case 'ArrowUp':
      case 'ArrowDown': {
        if (current.selection.size === 0) return false
        const sign = event.key === 'ArrowUp' ? 1 : -1
        nudge(event, 0, sign * (event.shiftKey ? 12 : 1))
        return true
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (current.selection.size === 0) return false
        const sign = event.key === 'ArrowRight' ? 1 : -1
        const barTicks = barLength(current)
        nudge(event, sign * (event.shiftKey ? barTicks : step), 0)
        return true
      }
      default:
        break
    }
    if (key === 'v') {
      dispatch({ type: 'set-tool', tool: 'select' })
      return true
    }
    if (key === 'b') {
      dispatch({ type: 'set-tool', tool: 'draw' })
      return true
    }
    return false
  }

  /**
   * @description: 首个拍号对应的小节长度（tick）
   * @param {EditorSessionState} current 会话快照
   * @return {number} 小节 tick 数
   */
  function barLength(current: EditorSessionState): number {
    const meter = current.document.timeSignatureMap[0]
    const numerator = meter?.numerator ?? 4
    const denominator = meter?.denominator ?? 4
    return Math.round((current.document.ticksPerBeat * 4 * numerator) / denominator)
  }

  /**
   * @description: 安装 window 级快捷键，返回卸载函数
   * @param {EditorShortcutHandlers} handlers 宿主回调
   * @return {() => void} 卸载函数
   */
  function installShortcuts(handlers: EditorShortcutHandlers): () => void {
    const listener = (event: KeyboardEvent): void => {
      if (handleKeydown(event, handlers)) event.preventDefault()
    }
    const endGesture = (): void => { nudgeGesture = null }
    const keyup = (event: KeyboardEvent): void => {
      if (event.key === nudgeGesture?.key) endGesture()
    }
    window.addEventListener('keydown', listener)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', endGesture)
    window.addEventListener('pointerdown', endGesture)
    return () => {
      endGesture()
      window.removeEventListener('keydown', listener)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', endGesture)
      window.removeEventListener('pointerdown', endGesture)
    }
  }

  return { session, state, dispatch, installShortcuts, dispose: unsubscribe }
}

/** 页面持有的会话句柄。 */
export type MidiEditorSessionHandle = ReturnType<typeof useMidiEditorSession>
