import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, shallowRef, type App } from 'vue'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import { useMidiEditorPlayback } from './useMidiEditorPlayback'

const audio = vi.hoisted(() => ({ clock: 10, ready: Promise.resolve() }))
vi.mock('@/lib/midiPlayer', () => ({
  ensureAudioRunning: () => audio.ready,
  getAudioClock: () => audio.clock,
  scheduleNote: () => ({ stop() {} }),
}))
vi.mock('@/stores/player', () => ({
  usePlayerStore: () => ({ isPreviewPlaying: false, pausePreviewPlayback() {} }),
}))

// 使用真实 Vue 生命周期，只替换 DOM 宿主和音频设备边界。
const renderer = createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  patchProp() {},
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
})
let app: App<object> | undefined
const callbacks = new Map<number, (time: number) => void>()
let id = 0
beforeEach(() => {
  audio.clock = 10
  audio.ready = Promise.resolve()
  callbacks.clear()
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    callbacks.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => callbacks.delete(handle))
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})

function mount() {
  let playback!: ReturnType<typeof useMidiEditorPlayback>
  const onFrame = vi.fn()
  app = renderer.createApp(
    defineComponent({
      setup() {
        const document = shallowRef<PianoRollDocument>({
          ticksPerBeat: 480,
          durationTicks: 1920,
          tempoMap: [],
          timeSignatureMap: [],
          tracks: [],
          notes: [],
        })
        playback = useMidiEditorPlayback(document, shallowRef(null), onFrame, shallowRef(null))
        return () => null
      },
    })
  )
  app.mount({})
  return { playback, onFrame }
}
function nextAudioFrame() {
  const next = [...callbacks.entries()][0]!
  callbacks.delete(next[0])
  next[1](0)
}

it('暂停状态下的单音试听仍更新发音帧，声音结束清空高亮并停止 RAF', async () => {
  const { playback, onFrame } = mount()
  await playback.audition(60, 100, 0.5)
  expect(playback.transport.value).toMatchObject({ isPlaying: false, activePitches: [60] })
  expect(callbacks.size).toBe(1)
  audio.clock = 10.5
  nextAudioFrame()
  expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ activePitches: [] }))
  expect(playback.transport.value.activePitches).toEqual([])
  expect(callbacks.size).toBe(0)
})

it('音频初始化尚未完成时卸载窗口，结束等待也不再向已销毁视图送帧', async () => {
  let resolve!: () => void
  audio.ready = new Promise<void>((done) => {
    resolve = done
  })
  const { playback, onFrame } = mount()
  const pending = playback.audition(60, 100)
  app!.unmount()
  app = undefined
  onFrame.mockClear()
  resolve()
  await pending
  expect(onFrame).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(0)
})
