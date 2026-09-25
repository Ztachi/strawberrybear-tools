import { createProject } from '@strawberrybear/midi-editor'
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mockIPC } from '@tauri-apps/api/mocks'
import { App as AntApp, ConfigProvider } from 'antdv-next'
import { i18n } from '@/i18n'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
import MainWindow from '@/views/MainWindow/index.vue'
import MidiEditorPage from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/index.vue'
import MidiEditorTab from '@/views/MainWindow/MidiEditorTab/index.vue'
import type { MidiInfo } from '@/types'
import '@/style.css'

const midi: MidiInfo = {
  filename: 'layout-fixture.mid',
  file_path: '/fixture/layout-fixture.mid',
  title: '布局验收',
  duration_ms: 2000,
  duration_ticks: 1920,
  ticks_per_beat: 480,
  tempo: 500000,
  tempo_map: [{ tick: 0, microseconds_per_quarter: 500000 }],
  time_signature_map: [{ tick: 0, numerator: 4, denominator: 4 }],
  track_count: 0,
  melody_note_count: 0,
  tracks: [],
  events: [],
}

const project = createProject({
  name: 'Counting Stars · Piano study',
  document: {
    ticksPerBeat: 480,
    durationTicks: 7680,
    tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
    timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
    tracks: [{ id: 'piano', name: 'Piano', enabled: true, isPercussion: false }],
    notes: Array.from(
      { length: new URLSearchParams(location.search).has('single') ? 1 : 32 },
      (_, i) => ({
        id: `note-${i}`,
        trackId: 'piano',
        pitch: [60, 64, 67, 64, 62, 65, 69, 65][i % 8]!,
        startTick: i * 240,
        endTick: i * 240 + 180,
        velocity: 100,
      })
    ),
  },
})
const showProjectList = new URLSearchParams(location.search).has('list')
const projectSummary = {
  id: project.id,
  name: project.name,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  meta: project.meta,
}

// 只替换桌面数据边界，使用真实主窗口、弹层容器、编辑会话与卷帘。
mockIPC((command) => {
  if (command === 'load_midi_project') return project
  if (command === 'import_midi_buffer')
    return {
      ...midi,
      filename: `${project.name}.mid`,
      file_path: `/fixture/${project.name}.mid`,
    }
  if (command === 'add_songs_to_song_list')
    return {
      id: 'favorites',
      name: '常用歌单',
      description: '',
      cover_filename: null,
      song_filenames: [`${project.name}.mid`],
      created_at: 1,
      updated_at: 2,
    }
  if (command === 'get_midi_projects') return showProjectList ? [projectSummary] : []
  if (command === 'get_song_lists')
    return showProjectList
      ? [
          {
            id: 'favorites',
            name: '常用歌单',
            description: '',
            cover_filename: null,
            song_filenames: [],
            created_at: 1,
            updated_at: 1,
          },
        ]
      : []
  if (['get_templates', 'extract_melody', 'extract_all_notes'].includes(command)) return []
  if (command === 'get_midi_library') return [midi]
  if (command === 'load_midi_config') return { ...midi, disabled_tracks: [] }
  if (command === 'load_midi_project_draft') return null
  if (command === 'check_accessibility') return true
  if (command === 'has_saved_overlay_window_state') return false
  if (
    [
      'save_midi_project_draft',
      'delete_midi_project_draft',
      'save_midi_config',
      'save_settings',
    ].includes(command)
  )
    return
  if (command === 'load_settings')
    return {
      locale: 'zh-CN',
      current_template_id: null,
      play_mode: 'auto',
      enable_keyboard_sim: false,
      auto_fps_enabled: false,
      manual_fps: 60,
    }
  throw new Error(`Unexpected native command in MIDI editor fixture: ${command}`)
})
i18n.global.locale.value = 'zh-CN'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { name: 'midi-editor-edit', path: '/midi-editor/:id', component: MidiEditorPage },
    { name: 'midi-editor-create', path: '/midi-editor/new', component: MidiEditorPage },
    { name: 'midi-editor', path: '/midi-editor', component: MidiEditorTab },
  ],
})
await router.push(
  showProjectList
    ? '/midi-editor'
    : new URLSearchParams(location.search).has('populated')
      ? '/midi-editor/fixture'
      : '/midi-editor/new'
)
createApp({
  render: () =>
    h(ConfigProvider, infinityNikkiConfigProviderProps, {
      default: () => h(AntApp, null, { default: () => h(MainWindow) }),
    }),
})
  .use(createPinia())
  .use(i18n)
  .use(router)
  .mount('#app')
