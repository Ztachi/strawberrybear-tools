import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mockIPC } from '@tauri-apps/api/mocks'
import { i18n } from '@/i18n'
import { usePlayerStore } from '@/stores/player'
import type { MelodyEvent, MidiInfo, NoteEvent } from '@/types'
import MidiDetailPage from '@/views/MainWindow/FilesTab/pages/MidiDetailPage.vue'
import '@/style.css'
import Fixture from './midi-detail-page.vue'

const query = new URLSearchParams(location.search)
i18n.global.locale.value = query.get('locale') === 'en-US' ? 'en-US' : 'zh-CN'
const calls: string[] = []
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
  title: '钢琴卷帘界面验收',
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
mockIPC((command) => {
  calls.push(command)
  if (command === 'extract_melody' || command === 'extract_all_notes') return melody
  if (command === 'load_midi_config') return { ...midi, disabled_tracks: [3] }
  throw new Error(`Unexpected native command in read-only UI fixture: ${command}`)
})

const pinia = createPinia()
const player = usePlayerStore(pinia)
player.midiLibrary = [midi]
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/midi/:filename', component: MidiDetailPage }],
})
await router.push(`/midi/${midi.filename}`)

declare global {
  interface Window {
    midiDetailFixture: {
      snapshot: () => {
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
window.midiDetailFixture = {
  snapshot: () => ({
    disabledTracks: [...player.detailDisabledTracks],
    nativeCalls: [...calls],
    currentMidi: player.currentMidi?.filename ?? null,
    isPlaying: player.isPreviewPlaying,
    keyboardStatus: player.playbackState.status,
    eventCount: player.detailMidi?.events.length ?? 0,
    loading: player.isDetailLoading,
  }),
}

createApp(Fixture).use(pinia).use(i18n).use(router).mount('#app')
