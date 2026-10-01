import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, nextTick, reactive, ref } from 'vue'
import type { App, Ref } from 'vue'
import type { MidiInfo } from '@/types'
import { usePianoDetailSeek } from './usePianoDetailSeek'

const environment = vi.hoisted(() => ({ store: null as unknown }))
vi.mock('@/stores/player', () => ({ usePlayerStore: () => environment.store }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const midiA: MidiInfo = {
  filename: 'a.mid',
  file_path: '/a.mid',
  duration_ms: 10000,
  track_count: 1,
  melody_note_count: 0,
  ticks_per_beat: 480,
  tempo: 500000,
  events: [],
}
const midiB: MidiInfo = { ...midiA, filename: 'b.mid', file_path: '/b.mid' }

function createStore() {
  const store = reactive({
    currentMidi: midiA as MidiInfo | null,
    previewState: { current: { id: midiA.filename } as { id: string } | null },
    activePreviewQueueItems: [midiA, midiB],
    midiLibrary: [midiA, midiB],
    previewQueueContext: { id: 'all', title: 'All' },
    stopPreviewPlayback: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    selectMidiInQueue:
      vi.fn<(midi: MidiInfo, items: MidiInfo[], context: unknown) => Promise<void>>(),
    seekPreview: vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined),
  })
  store.selectMidiInQueue.mockImplementation(async (midi) => {
    store.currentMidi = midi
    store.previewState.current = { id: midi.filename }
  })
  return store
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// 用 Vue 自定义宿主执行真实的 setup/watch/unmount 生命周期，无需 DOM 或 Tauri。
interface HostNode {
  children: HostNode[]
}
const node = (): HostNode => ({ children: [] })
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node,
  createText: node,
  createComment: node,
  insert: (child, parent) => {
    parent.children.push(child)
  },
  remove: () => {},
  patchProp: () => {},
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
})

let store: ReturnType<typeof createStore>
let detail: Ref<MidiInfo | null>
let filename: Ref<string>
let controller: ReturnType<typeof usePianoDetailSeek>
let app: App<HostNode>

beforeEach(() => {
  store = createStore()
  environment.store = store
  detail = ref(midiB)
  filename = ref(midiB.filename)
  app = renderer.createApp({
    setup() {
      controller = usePianoDetailSeek(detail, filename)
      return () => null
    },
  })
  app.mount(node())
})
afterEach(() => app.unmount())

describe('piano detail seek binding', () => {
  it('previews locally and does not expose another song as the current transport', () => {
    expect(controller.matchesPlayback.value).toBe(false)
    controller.preview(2.5)
    expect(controller.previewSeconds.value).toBe(2.5)
    expect(store.seekPreview).not.toHaveBeenCalled()
    controller.preview(null)
    expect(controller.previewSeconds.value).toBeNull()
  })

  it('waits for an in-flight song binding and only commits the latest seek', async () => {
    const selection = deferred()
    store.selectMidiInQueue.mockImplementation(async (midi) => {
      store.currentMidi = midi
      await selection.promise
      store.previewState.current = { id: midi.filename }
    })
    const first = controller.seek(2)
    await nextTick()
    expect(store.selectMidiInQueue).toHaveBeenCalledOnce()
    const second = controller.seek(5)
    await nextTick()
    expect(store.seekPreview).not.toHaveBeenCalled()
    selection.resolve()
    await Promise.all([first, second])
    expect(store.stopPreviewPlayback).toHaveBeenCalledOnce()
    expect(store.seekPreview).toHaveBeenCalledExactlyOnceWith(5000)
  })

  it('does not select or seek after navigating to another detail', async () => {
    const stop = deferred()
    store.stopPreviewPlayback.mockReturnValue(stop.promise)
    const pending = controller.seek(3)
    filename.value = 'c.mid'
    detail.value = { ...midiA, filename: 'c.mid' }
    await nextTick()
    stop.resolve()
    await pending
    expect(store.selectMidiInQueue).not.toHaveBeenCalled()
    expect(store.seekPreview).not.toHaveBeenCalled()
  })

  it('rejects a transient app/public-player identity mismatch', async () => {
    store.currentMidi = midiB
    await controller.seek(3)
    expect(controller.matchesPlayback.value).toBe(false)
    expect(store.seekPreview).not.toHaveBeenCalled()
  })

  it('converts seconds once and retains same-song transport state', async () => {
    store.currentMidi = midiB
    store.previewState.current = { id: midiB.filename }
    await controller.seek(1.25)
    expect(store.seekPreview).toHaveBeenCalledExactlyOnceWith(1250)
    expect(store.stopPreviewPlayback).not.toHaveBeenCalled()
    expect(store.selectMidiInQueue).not.toHaveBeenCalled()
  })

  it('invalidates pending binding on unmount', async () => {
    const stop = deferred()
    store.stopPreviewPlayback.mockReturnValue(stop.promise)
    const pending = controller.seek(4)
    app.unmount()
    stop.resolve()
    await pending
    expect(store.selectMidiInQueue).not.toHaveBeenCalled()
    expect(store.seekPreview).not.toHaveBeenCalled()
  })
})
