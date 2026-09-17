import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mockIPC } from '@tauri-apps/api/mocks'
import { i18n } from '@/i18n'
import { usePlayerStore } from '@/stores/player'
import type { MelodyEvent, MidiInfo, NoteEvent } from '@/types'
import MidiDetailPage from '@/views/MainWindow/FilesTab/pages/MidiDetailPage.vue'
import '@/style.css'
import Fixture from './midi-detail-page.vue'
import { EDITOR_WINDOW_PORT } from '@/features/piano-editor'
import { browserEditorWindowPort } from './editor-window-port'
import { createPianoEditorWindowPort } from '@/platform/tauri/pianoEditorWindow'
import { startPreviewProgress } from '@/features/player/previewProgress'

const query = new URLSearchParams(location.search)
i18n.global.locale.value = query.get('locale') === 'en-US' ? 'en-US' : 'zh-CN'
const calls: string[] = []
const playbackActions: string[] = []
const empty = query.has('empty')
const events: NoteEvent[] = empty
  ? []
  : [1, 2].flatMap((track) =>
      Array.from({ length: 12 }, (_, index) => ({
        id: `note-${track}-${index}`,
        track,
        source_track: track,
        channel: 0,
        pitch: (track === 1 ? 65 : 48) + (index % 5),
        velocity: 90,
        start_tick: 480 + index * 720,
        end_tick: 960 + index * 720,
      }))
    )
const midi: MidiInfo = {
  filename: 'piano-detail-fixture.mid',
  file_path: '/fixture/piano-detail-fixture.mid',
  title: query.has('longTitle')
    ? '钢琴卷帘界面验收：一首非常长的曲名，用于验证完整名称提示和自动往返滚动'
    : '钢琴卷帘界面验收',
  duration_ms: 10000,
  duration_ticks: 9600,
  ticks_per_beat: 480,
  tempo: 500000,
  tempo_map: [{ tick: 0, microseconds_per_quarter: 500000 }],
  time_signature_map: [{ tick: 0, numerator: 4, denominator: 4 }],
  track_count: 4,
  melody_note_count: events.length,
  tracks: ['指挥轨', 'メタルマックス「涙の7ミリ機関砲」', '低音', '元数据轨'].map(
    (name, index) => ({
      id: String(index),
      index,
      name,
      channel: 0,
      is_percussion: false,
      note_count: events.filter((event) => event.track === index).length,
      end_tick: index === 0 ? 0 : 9600,
      enabled: true,
    })
  ),
  events,
}
const melody: MelodyEvent[] = events.map((event) => ({
  pitch: event.pitch,
  pitch_name: 'C4',
  velocity: event.velocity,
  start_ms: (event.start_tick / 480) * 500,
  duration_ms: ((event.end_tick - event.start_tick) / 480) * 500,
  track: event.track,
}))

// 只替换桌面 IPC 边界：真实页面、Pinia actions、卷帘和 antdv 都参与验收。
// 白名单外的调用立即失败，测试不能读写用户文件、启动音频或模拟按键。
const mockCommand = (command: string, payload?: unknown): unknown => {
  calls.push(command)
  if (command === 'save_midi_config') return undefined
  if (command === 'extract_melody' || command === 'extract_all_notes') return melody
  if (command === 'load_midi_config')
    return {
      ...midi,
      title:
        (payload as { filename: string }).filename === 'second.mid' ? '第二首验收歌曲' : midi.title,
      disabled_tracks: [3],
    }
  throw new Error(`Unexpected native command in read-only UI fixture: ${command}`)
}
if (query.has('nativeSmoke')) {
  // 原生验收保留 Tauri 的回调注册和窗口事件，只替换业务数据读取命令。
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, payload?: unknown, options?: unknown) => Promise<unknown>
      }
    }
  ).__TAURI_INTERNALS__
  const originalInvoke = internals.invoke.bind(internals)
  internals.invoke = async (command, payload, options) =>
    command.startsWith('plugin:') || command.startsWith('smoke_')
      ? originalInvoke(command, payload, options)
      : mockCommand(command, payload)
} else mockIPC(mockCommand)

const pinia = createPinia()
const player = usePlayerStore(pinia)
player.midiLibrary = [midi, { ...midi, filename: 'second.mid', title: '第二首验收歌曲' }]
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { name: 'files-midi-detail', path: '/midi/:filename', component: MidiDetailPage },
    { path: '/away', component: { render: () => h('p', 'Library') } },
  ],
})
await router.push(`/midi/${midi.filename}`)

declare global {
  interface Window {
    midiDetailFixture: {
      navigate: (filename: string) => Promise<void>
      play: (filename: string | null) => void
      startClock: () => void
      snapshot: () => {
        playbackActions: string[]
        disabledTracks: number[]
        nativeCalls: string[]
        currentMidi: string | null
        isPlaying: boolean
        keyboardStatus: string
        eventCount: number
        loading: boolean
      }
    }
  }
}
let stopClock: (() => void) | undefined
window.addEventListener('pagehide', () => stopClock?.())
window.midiDetailFixture = {
  navigate: async (filename) => {
    await router.push(filename ? `/midi/${filename}` : '/away')
  },
  play: (filename) => {
    stopClock?.()
    player.currentMidi = player.midiLibrary.find((item) => item.filename === filename) ?? null
    player.previewState = {
      ...player.previewState,
      current: filename ? { id: filename, title: filename, url: '/fixture.mid' } : null,
    }
    player.isPreviewPlaying = !!filename
    player.previewCurrentTime = 4000
  },
  startClock: () => {
    window.midiDetailFixture.play(midi.filename)
    player.previewCurrentTime = 2000
    const started = performance.now()
    // 只替换音频读数；采样调度、store、跨窗口协议和每帧绘制全部使用生产实现。
    stopClock = startPreviewProgress(() => {
      player.previewCurrentTime = 2000 + performance.now() - started
    })
  },
  snapshot: () => ({
    playbackActions: [...playbackActions],
    disabledTracks: [...player.detailDisabledTracks],
    nativeCalls: [...calls],
    currentMidi: player.currentMidi?.filename ?? null,
    isPlaying: player.isPreviewPlaying,
    keyboardStatus: player.playbackState.status,
    eventCount: player.detailMidi?.events.length ?? 0,
    loading: player.isDetailLoading,
  }),
}

// 仅标题栏交互验收替换播放动作端口，不加载音色或初始化模拟按键。
if (query.has('controls')) {
  player.pausePreviewPlayback = () => {
    playbackActions.push('pause')
    player.isPreviewPlaying = false
    player.isPreviewPaused = true
  }
  player.resumePreviewPlayback = () => {
    playbackActions.push('resume')
    player.isPreviewPaused = false
    player.isPreviewPlaying = true
  }
  player.stopPreviewPlayback = async () => {
    playbackActions.push('stop')
    player.isPreviewPlaying = false
    player.isPreviewPaused = false
  }
  player.startPreview = async () => {
    playbackActions.push('play')
    player.isPreviewPlaying = true
  }
  player.playNext = async () => {
    playbackActions.push('next')
    window.midiDetailFixture.play('second.mid')
  }
  player.playPrev = async () => {
    playbackActions.push('previous')
    window.midiDetailFixture.play(midi.filename)
  }
  player.setPlaylistPlaybackMode = async (mode) => {
    playbackActions.push(`mode:${mode}`)
    player.previewState = { ...player.previewState, playbackMode: mode }
  }
}

createApp(Fixture)
  .use(pinia)
  .use(i18n)
  .use(router)
  .provide(
    EDITOR_WINDOW_PORT,
    query.has('nativeSmoke') ? createPianoEditorWindowPort() : browserEditorWindowPort()
  )
  .mount('#app')
if (query.has('nativeSmoke'))
  void import('./piano-editor-native-smoke').then(({ runNativeEditorSmoke }) =>
    runNativeEditorSmoke()
  )
