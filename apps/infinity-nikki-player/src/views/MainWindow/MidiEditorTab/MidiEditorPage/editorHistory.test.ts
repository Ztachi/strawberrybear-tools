/* eslint-disable vue/one-component-per-file -- 控件替身与渲染宿主只服务于本文件的组件集成测试。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick } from 'vue'
import type { App } from 'vue'
import { createI18n } from 'vue-i18n'
import { createEditorSession, createProject } from '@strawberrybear/midi-editor'
import { useMidiEditorSession } from './useMidiEditorSession'
import NoteInspector from './components/NoteInspector.vue'
import EditorToolbar from './components/EditorToolbar.vue'

// 只替换框架控件表面，直接驱动真实页面处理函数、会话与历史栈。
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue')
  const control = (name: string) =>
    defineComponent({
      name,
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () =>
          h(name, attrs, [slots.default?.(), ...(name === 'Popover' ? [slots.content?.()] : [])])
      },
    })
  return Object.fromEntries(
    ['Button', 'InputNumber', 'Slider', 'Tooltip', 'Popover', 'Select'].map((name) => [
      name,
      control(name),
    ])
  )
})
vi.mock('@/theme/infinityNikkiTheme', () => ({ getMainWindowPopupContainer: () => null }))

interface HostNode {
  type: string
  children: HostNode[]
  parent: HostNode | null
  props: Record<string, unknown>
}
const node = (type = 'root'): HostNode => ({ type, children: [], parent: null, props: {} })
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node,
  createText: () => node('text'),
  createComment: () => node('comment'),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
  },
  patchProp: (el, key, _, value) => {
    el.props[key] = value
  },
  setText: () => {},
  setElementText: () => {},
  parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
})
let app: App<HostNode> | undefined
let handle: ReturnType<typeof useMidiEditorSession>
let root: HostNode
let uninstall: (() => void) | undefined
let windowEvents: EventTarget

function controls(type: string, current = root): HostNode[] {
  return [
    ...(current.type === type ? [current] : []),
    ...current.children.flatMap((child) => controls(type, child)),
  ]
}
async function fire(control: HostNode, event: string, ...values: unknown[]): Promise<void> {
  const handler = control.props[event]
  if (Array.isArray(handler)) handler.forEach((fn) => fn(...values))
  else (handler as ((...values: unknown[]) => void) | undefined)?.(...values)
  await nextTick()
}
function key(type: string, name: string, repeat = false, ctrlKey = false): void {
  const event = new Event(type, { cancelable: true })
  Object.assign(event, { key: name, repeat, ctrlKey })
  windowEvents.dispatchEvent(event)
}
function mount(target: 'inspector' | 'toolbar'): void {
  app = renderer.createApp(
    defineComponent({
      setup() {
        return () =>
          target === 'inspector'
            ? h(NoteInspector, { state: handle.state.value, onDispatch: handle.dispatch })
            : h(EditorToolbar, {
                state: handle.state.value,
                isPlaying: false,
                showVelocity: false,
                showPlayable: false,
                onDispatch: handle.dispatch,
                onSetBpm: (bpm: number) => handle.dispatch({ type: 'set-tempo', bpm }),
              })
      },
    })
  )
  app.use(
    createI18n({
      legacy: false,
      locale: 'en',
      missingWarn: false,
      fallbackWarn: false,
      messages: { en: {} },
    })
  )
  app.mount(root)
}
beforeEach(() => {
  root = node()
  windowEvents = new EventTarget()
  vi.stubGlobal('window', windowEvents)
  vi.stubGlobal('HTMLElement', class {})
  const seed = createEditorSession(createProject())
  seed.dispatch({
    type: 'add-note',
    trackId: 'track-1',
    pitch: 60,
    startTick: 480,
    durationTicks: 480,
  })
  handle = useMidiEditorSession(seed.toProject(), {})
  handle.dispatch({ type: 'select-all' })
})
afterEach(() => {
  uninstall?.()
  uninstall = undefined
  app?.unmount()
  app = undefined
  handle.dispose()
  vi.unstubAllGlobals()
})

describe('continuous editor changes', () => {
  it('previews a velocity drag and commits only once on release', async () => {
    mount('inspector')
    const slider = controls('Slider')[0]!
    await fire(slider, 'onPointerdownCapture')
    for (let velocity = 99; velocity >= 70; velocity--) await fire(slider, 'onChange', velocity)
    expect(handle.state.value.canUndo).toBe(false)
    expect(slider.props.value).toBe(70)
    await fire(slider, 'onChangeComplete', 70)
    expect(handle.state.value.document.notes[0]!.velocity).toBe(70)
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes[0]!.velocity).toBe(100)
    expect(handle.state.value.canUndo).toBe(false)
    handle.dispatch({ type: 'redo' })
    expect(handle.state.value.document.notes[0]!.velocity).toBe(70)
  })

  it('keeps separate velocity gestures separate and ignores an unchanged final value', async () => {
    mount('inspector')
    const slider = controls('Slider')[0]!
    await fire(slider, 'onPointerdownCapture')
    await fire(slider, 'onChange', 70)
    await fire(slider, 'onChangeComplete', 70)
    await fire(slider, 'onPointerdownCapture')
    await fire(slider, 'onChange', 50)
    await fire(slider, 'onChangeComplete', 50)
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes[0]!.velocity).toBe(70)
    handle.dispatch({ type: 'undo' })
    await nextTick()
    await fire(slider, 'onPointerdownCapture')
    await fire(slider, 'onChange', 80)
    await fire(slider, 'onChange', 100)
    await fire(slider, 'onChangeComplete', 100)
    expect(handle.state.value.canUndo).toBe(false)
    expect(handle.state.value.canRedo).toBe(true)
  })

  it.each([
    ['pitch', 0, [6, 64], 'pitch', 64, 60],
    ['length', 1, [0.5, 2, 3], 'endTick', 1920, 960],
  ] as const)(
    'commits %s input once on blur',
    async (_, index, values, property, final, initial) => {
      mount('inspector')
      const input = controls('InputNumber')[index]!
      for (const value of values) await fire(input, 'onChange', value)
      expect(handle.state.value.canUndo).toBe(false)
      await fire(input, 'onBlur', {})
      expect(handle.state.value.document.notes[0]![property]).toBe(final)
      handle.dispatch({ type: 'undo' })
      expect(handle.state.value.document.notes[0]![property]).toBe(initial)
      expect(handle.state.value.canUndo).toBe(false)
    }
  )

  it('commits BPM once on Enter without committing again on blur', async () => {
    mount('toolbar')
    const input = controls('InputNumber')[0]!
    await fire(input, 'onChange', 9)
    await fire(input, 'onChange', 90)
    expect(handle.state.value.canUndo).toBe(false)
    await fire(input, 'onPressEnter', {})
    await fire(input, 'onBlur', {})
    expect(handle.state.value.document.tempoMap[0]!.microsecondsPerQuarter).toBe(666667)
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.tempoMap[0]!.microsecondsPerQuarter).toBe(500000)
    expect(handle.state.value.canUndo).toBe(false)
  })

  it('merges held arrow-key repeats but separates the next key press', () => {
    uninstall = handle.installShortcuts({ togglePlayback: () => {}, save: () => {} })
    key('keydown', 'ArrowUp')
    for (let i = 0; i < 9; i++) key('keydown', 'ArrowUp', true)
    key('keyup', 'ArrowUp')
    expect(handle.state.value.document.notes[0]!.pitch).toBe(70)
    key('keydown', 'ArrowUp')
    key('keyup', 'ArrowUp')
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes[0]!.pitch).toBe(70)
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes[0]!.pitch).toBe(60)
    expect(handle.state.value.canUndo).toBe(false)
  })
  it('cancels unfinished velocity edits on Escape, window blur and selection changes', async () => {
    mount('inspector')
    const slider = controls('Slider')[0]!
    await fire(slider, 'onPointerdownCapture')
    await fire(slider, 'onChange', 70)
    await fire(slider, 'onKeydownCapture', {
      key: 'Escape',
      preventDefault() {},
      stopPropagation() {},
    })
    await fire(slider, 'onChange', 65)
    await fire(slider, 'onChangeComplete', 65)
    expect(handle.state.value.canUndo).toBe(false)
    await fire(slider, 'onPointerdownCapture')
    await fire(slider, 'onChange', 60)
    windowEvents.dispatchEvent(new Event('blur'))
    await fire(slider, 'onChangeComplete', 60)
    expect(handle.state.value.canUndo).toBe(false)
    await fire(slider, 'onPointerdownCapture')
    await fire(slider, 'onChange', 50)
    handle.dispatch({ type: 'select-all' })
    await nextTick()
    await fire(slider, 'onChangeComplete', 50)
    expect(handle.state.value.document.notes[0]!.velocity).toBe(100)
  })

  it('does not interpret empty or cancelled pitch input as MIDI pitch zero', async () => {
    mount('inspector')
    const input = controls('InputNumber')[0]!
    await fire(input, 'onChange', null)
    await fire(input, 'onBlur', {})
    expect(handle.state.value.document.notes[0]!.pitch).toBe(60)
    expect(input.props.value).toBe(60)
    await fire(input, 'onChange', 80)
    await fire(input, 'onKeydownCapture', {
      key: 'Escape',
      preventDefault() {},
      stopPropagation() {},
    })
    await fire(input, 'onBlur', {})
    expect(handle.state.value.canUndo).toBe(false)
    expect(input.props.value).toBe(60)
  })

  it('groups a held number stepper until release outside the control', async () => {
    mount('inspector')
    const input = controls('InputNumber')[0]!
    for (let pitch = 61; pitch <= 70; pitch++) {
      await fire(input, 'onChange', pitch)
      await fire(input, 'onStep', pitch, { emitter: 'handler', offset: 1, type: 'up' })
    }
    expect(handle.state.value.canUndo).toBe(false)
    windowEvents.dispatchEvent(new Event('pointerup'))
    expect(handle.state.value.document.notes[0]!.pitch).toBe(70)
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes[0]!.pitch).toBe(60)
    expect(handle.state.value.canUndo).toBe(false)
  })

  it('groups number keyboard repeats on keyup and cancels interrupted stepping', async () => {
    mount('inspector')
    const input = controls('InputNumber')[0]!
    await fire(input, 'onChange', 61)
    await fire(input, 'onChange', 62)
    await fire(input, 'onKeyup', { key: 'ArrowUp' })
    handle.dispatch({ type: 'undo' })
    await nextTick()
    expect(handle.state.value.document.notes[0]!.pitch).toBe(60)
    await fire(input, 'onChange', 75)
    await fire(input, 'onStep', 75, { emitter: 'handler', offset: 1, type: 'up' })
    windowEvents.dispatchEvent(new Event('pointercancel'))
    await fire(input, 'onChange', 76)
    await fire(input, 'onStep', 76, { emitter: 'handler', offset: 1, type: 'up' })
    windowEvents.dispatchEvent(new Event('pointerup'))
    expect(handle.state.value.canUndo).toBe(false)
  })

  it('preserves a save point inside a continuous keyboard gesture', () => {
    uninstall = handle.installShortcuts({ togglePlayback: () => {}, save: () => {} })
    key('keydown', 'ArrowUp')
    handle.session.markSaved()
    key('keydown', 'ArrowUp', true)
    key('keyup', 'ArrowUp')
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes[0]!.pitch).toBe(61)
    expect(handle.state.value.dirty).toBe(false)
  })

  it('ends keyboard coalescing when the window loses focus', () => {
    uninstall = handle.installShortcuts({ togglePlayback: () => {}, save: () => {} })
    key('keydown', 'ArrowUp')
    windowEvents.dispatchEvent(new Event('blur'))
    key('keydown', 'ArrowUp', true)
    key('keyup', 'ArrowUp')
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes[0]!.pitch).toBe(61)
  })

  it('restores every selected note velocity with one undo', async () => {
    const project = handle.session.toProject()
    handle.session.replaceProject({
      ...project,
      document: {
        ...project.document,
        notes: [
          ...project.document.notes,
          { ...project.document.notes[0]!, id: 'second-note', pitch: 67, velocity: 60 },
        ],
      },
    })
    handle.dispatch({ type: 'select-all' })
    mount('inspector')
    const slider = controls('Slider')[0]!
    await fire(slider, 'onPointerdownCapture')
    await fire(slider, 'onChange', 90)
    await fire(slider, 'onChange', 70)
    await fire(slider, 'onChangeComplete', 70)
    expect(handle.state.value.document.notes.map((note) => note.velocity)).toEqual([70, 70])
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes.map((note) => note.velocity)).toEqual([100, 60])
    expect(handle.state.value.canUndo).toBe(false)
  })

  it('does not duplicate notes repeatedly when a command key is held', () => {
    uninstall = handle.installShortcuts({ togglePlayback: () => {}, save: () => {} })
    key('keydown', 'd', false, true)
    key('keydown', 'd', true, true)
    key('keydown', 'd', true, true)
    expect(handle.state.value.document.notes).toHaveLength(2)
    handle.dispatch({ type: 'undo' })
    expect(handle.state.value.document.notes).toHaveLength(1)
    expect(handle.state.value.canUndo).toBe(false)
  })

  it('lets focused sliders and buttons own their keyboard input', () => {
    uninstall = handle.installShortcuts({ togglePlayback: () => {}, save: () => {} })
    const target = new HTMLElement()
    target.closest = () => target
    for (const name of ['ArrowUp', 'd']) {
      const event = new Event('keydown', { cancelable: true })
      Object.assign(event, { key: name, ctrlKey: name === 'd' })
      Object.defineProperty(event, 'target', { value: target })
      windowEvents.dispatchEvent(event)
    }
    expect(handle.state.value.document.notes).toHaveLength(1)
    expect(handle.state.value.document.notes[0]!.pitch).toBe(60)
    expect(handle.state.value.canUndo).toBe(false)
  })
})
