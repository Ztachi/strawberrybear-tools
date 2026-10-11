import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import OverlayView from './OverlayView.vue'

// 只替换平台、音频读数和子组件；按键执行器与悬浮层状态侦听使用生产实现。
const ports = vi.hoisted(() => ({
  player: {} as Record<string, unknown>,
  invoke: vi.fn(async () => {}),
}))
vi.mock('@/stores/player', () => ({ usePlayerStore: () => ports.player }))
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    enableKeyboardSim: true,
    isOverlayMode: true,
    playMode: 'piano',
    manualFps: 60,
    getCurrentTemplate: () => ({ mappings: [{ pitch: 60, key: 'A' }] }),
  }),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: ports.invoke }))
vi.mock('@/lib/midiPlayer', () => ({
  setVolume: vi.fn(),
  getKeyboardNoteSchedule: () => [{ targetPitch: 60, startMs: 1000, durationMs: 100 }],
}))
vi.mock('antdv-next', () => ({ Tooltip: () => null }))
vi.mock('@/components/MusicPlayerCore/index.vue', () => ({ default: () => null }))
vi.mock('@/components/KeyTemplateSelect.vue', () => ({ default: () => null }))
vi.mock('@/components/MarqueeText.vue', () => ({ default: () => null }))
vi.mock('./components/OverlayFpsControl.vue', () => ({ default: () => null }))
vi.mock('./components/OverlayPlaylistPanel.vue', () => ({ default: () => null }))

const renderer = createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert: () => {},
  remove: () => {},
  patchProp: () => {},
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
})
let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  vi.restoreAllMocks()
  vi.useRealTimers()
  ports.invoke.mockClear()
})

it('播放中改倍速时，从当前音乐位置重建真实按键调度，而非继续旧速度', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  ports.player = reactive({
    isPreviewPlaying: false,
    isPreviewPaused: false,
    speed: 1,
    previewCurrentTime: 0,
    previewVolume: 1,
    isPreviewMuted: false,
    activePreviewQueueItems: [],
    currentMidi: { filename: 'speed.mid' },
  })
  const app = renderer.createApp(OverlayView)
  app.use(
    createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: {} },
      missingWarn: false,
      fallbackWarn: false,
    })
  )
  app.mount({})
  unmount = () => app.unmount()
  ports.player.isPreviewPlaying = true
  await nextTick()
  await vi.advanceTimersByTimeAsync(250)
  ports.player.previewCurrentTime = 250
  ports.player.speed = 2
  await nextTick()
  await vi.advanceTimersByTimeAsync(374)
  expect(ports.invoke).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(ports.invoke).toHaveBeenCalledWith('simulate_key_down', { key: 'A' })
  ports.player.isPreviewPaused = true
  await nextTick()
  expect(ports.invoke).toHaveBeenCalledWith('simulate_key_up', { key: 'A' })
})
