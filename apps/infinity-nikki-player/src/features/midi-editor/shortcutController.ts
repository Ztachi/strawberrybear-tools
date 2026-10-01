import { resolutionTicks, snapTick } from '@strawberrybear/midi-editor'
import type { EditorAction, EditorSessionState } from '@strawberrybear/midi-editor'
import { createTimeline } from '@strawberrybear/piano-roll/core'

export interface MidiEditorShortcutInput {
  key: string
  repeat: boolean
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

interface MidiEditorShortcutControllerOptions {
  state: () => EditorSessionState
  positionSeconds: () => number
  dispatch: (action: EditorAction) => void
  save: () => void
  togglePlayback: () => void
}

/** 把窗口键盘事件转换为编辑命令；按键长按只生成一个可撤销手势。 */
export class MidiEditorShortcutController {
  private gesture: { key: string; shift: boolean; coalesceKey: string } | null = null
  private sequence = 0

  constructor(private readonly options: MidiEditorShortcutControllerOptions) {}

  /** 结束当前长按手势。 */
  end(key?: string): void {
    if (!key || this.gesture?.key === key) this.gesture = null
  }

  /**
   * @param input 经过输入控件过滤的按键
   * @return 是否应阻止浏览器默认行为
   */
  handle(input: MidiEditorShortcutInput): boolean {
    const mod = input.metaKey || input.ctrlKey
    const key = input.key.toLowerCase()
    if (mod || !input.key.startsWith('Arrow')) this.end()
    if (input.repeat && (key === ' ' || (mod && ['s', 'c', 'x', 'v', 'd'].includes(key)))) {
      return true
    }

    if (mod) return this.handleModified(key, input.shiftKey)

    const state = this.options.state()
    switch (input.key) {
      case 'Delete':
      case 'Backspace':
        if (state.selection.size === 0) return false
        this.options.dispatch({ type: 'delete', noteIds: [...state.selection] })
        return true
      case 'Escape':
        this.options.dispatch({ type: 'clear-selection' })
        return true
      case ' ':
        this.options.togglePlayback()
        return true
      case 'ArrowUp':
      case 'ArrowDown': {
        if (state.selection.size === 0) return false
        const sign = input.key === 'ArrowUp' ? 1 : -1
        this.nudge(input, 0, sign * (input.shiftKey ? 12 : 1))
        return true
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (state.selection.size === 0) return false
        const meter = state.document.timeSignatureMap[0]
        const barTicks = Math.round(
          (state.document.ticksPerBeat * 4 * (meter?.numerator ?? 4)) / (meter?.denominator ?? 4)
        )
        const step = resolutionTicks(state.snap, state.document) || state.document.ticksPerBeat
        const sign = input.key === 'ArrowRight' ? 1 : -1
        this.nudge(input, sign * (input.shiftKey ? barTicks : step), 0)
        return true
      }
    }

    if (key === 'v') {
      this.options.dispatch({ type: 'set-tool', tool: 'select' })
      return true
    }
    if (key === 'b') {
      this.options.dispatch({ type: 'set-tool', tool: 'draw' })
      return true
    }
    return false
  }

  private handleModified(key: string, shift: boolean): boolean {
    const state = this.options.state()
    switch (key) {
      case 'z':
        this.options.dispatch({ type: shift ? 'redo' : 'undo' })
        return true
      case 'y':
        this.options.dispatch({ type: 'redo' })
        return true
      case 'a':
        this.options.dispatch({ type: 'select-all' })
        return true
      case 'c':
        this.options.dispatch({ type: 'copy' })
        return true
      case 'x':
        this.options.dispatch({ type: 'cut' })
        return true
      case 'v': {
        const seconds = this.options.positionSeconds()
        const atTick =
          seconds > 0
            ? snapTick(
                createTimeline(state.document).secondsToTick(seconds),
                state.snap,
                state.document,
                'nearest'
              )
            : undefined
        this.options.dispatch({ type: 'paste', atTick })
        return true
      }
      case 'd':
        this.options.dispatch({ type: 'duplicate' })
        return true
      case 's':
        this.options.save()
        return true
      default:
        return false
    }
  }

  private nudge(input: MidiEditorShortcutInput, deltaTick: number, deltaPitch: number): void {
    if (!input.repeat || this.gesture?.key !== input.key || this.gesture.shift !== input.shiftKey) {
      this.gesture = {
        key: input.key,
        shift: input.shiftKey,
        coalesceKey: `nudge-${++this.sequence}`,
      }
    }
    this.options.dispatch({
      type: 'nudge',
      deltaTick,
      deltaPitch,
      coalesceKey: this.gesture.coalesceKey,
    })
  }
}
