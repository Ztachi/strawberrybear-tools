import { createProject, type MidiProject } from '@strawberrybear/midi-editor'
import { createApp, defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, useRouter } from 'vue-router'
import { mockIPC } from '@tauri-apps/api/mocks'
import { invoke } from '@tauri-apps/api/core'
import type { RecorderAudio } from '@/features/midi-recording/types'
import { App as AntApp, ConfigProvider } from 'antdv-next'
import { getAntdvLocale, i18n } from '@/i18n'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
import { appUpdaterKey } from '@/composables/useAppUpdater'
import { midiDraftKey, type MidiEditorEntry } from '@/features/midi-editor/draftIdentity'
import {
  createUpdaterController,
  initialUpdateState,
  type UpdateSnapshot,
} from '@/features/app-updater/controller'
import MainWindow from '@/views/MainWindow/index.vue'
import { MIDI_PROJECT_EDITOR_WINDOW_PORT } from '@/features/midi-project-editor-window'
import { usePlayerStore } from '@/stores/player'
import MidiEditorPage from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/index.vue'
import MidiEditorTab from '@/views/MainWindow/MidiEditorTab/index.vue'
import AllSongsPage from '@/views/MainWindow/FilesTab/pages/AllSongsPage.vue'
import SongListDetailPage from '@/views/MainWindow/FilesTab/pages/SongListDetailPage.vue'
import TemplateEditor from '@/views/MainWindow/TemplatesTab/components/TemplateEditor.vue'
import OnlineLibraryTab from '@/views/MainWindow/OnlineLibraryTab/index.vue'
import { useOnlineMidiLibraryStore } from '@/stores/onlineMidiLibrary'
import type { OnlineMidiSong } from '@/lib/onlineMidiLibraryApi'
import type { MidiInfo } from '@/types'
import { browserMidiProjectEditorWindowPort } from './midi-project-editor-window-port'
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

const fixtureQuery = new URLSearchParams(location.search)
// 常规回归聚焦编辑行为；只有首次引导验收使用未完成引导的状态。
if (!fixtureQuery.has('tour')) localStorage.setItem('nikki:midi-editor-tour-seen', 'true')
const showNavigationFixture = fixtureQuery.has('navigation')
const showPlaylistFixture = fixtureQuery.has('playlist')
const showTemplateList = fixtureQuery.has('templates')
const showOnlineList = fixtureQuery.has('online')
const navigationMidiLibrary = Array.from(
  { length: 80 },
  (_, index): MidiInfo => ({
    ...midi,
    filename: `navigation-${String(index + 1).padStart(2, '0')}.mid`,
    file_path: `/fixture/navigation-${String(index + 1).padStart(2, '0')}.mid`,
    title: `导航测试歌曲 ${String(index + 1).padStart(2, '0')}`,
    added_at: 1700000000000 + index * 1000,
  })
)
const switchedMidi: MidiInfo = {
  ...midi,
  filename: 'main-window-switched.mid',
  file_path: '/fixture/main-window-switched.mid',
  title: '主窗口切换后的歌曲',
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
if (fixtureQuery.has('colors')) {
  const track = project.document.tracks[0]!
  const tracks = [
    track,
    { ...track, id: 'bass', name: 'Bass' },
    { ...track, id: 'strings', name: 'Strings' },
  ]
  project.document = {
    ...project.document,
    tracks,
    notes: project.document.notes.flatMap((note) =>
      tracks.map((item, index) => ({
        ...note,
        id: `${item.id}-${note.id}`,
        trackId: item.id,
        pitch: note.pitch - index * 12,
      }))
    ),
  }
}
if (fixtureQuery.has('reference')) {
  project.document = {
    ...project.document,
    tracks: [
      ...project.document.tracks,
      ...(fixtureQuery.has('referenceFar')
        ? Array.from({ length: 8 }, (_, i) => ({
            id: `before-${i}`,
            name: `前置音轨 ${i}`,
            enabled: true,
            isPercussion: false,
          }))
        : []),
      { id: 'reference', name: '参考旋律', enabled: true, isPercussion: false },
      ...(fixtureQuery.has('referenceFar')
        ? Array.from({ length: 8 }, (_, i) => ({
            id: `after-${i}`,
            name: `后置音轨 ${i}`,
            enabled: true,
            isPercussion: false,
          }))
        : []),
    ],
    notes: [
      ...project.document.notes,
      {
        id: 'reference-note',
        trackId: 'reference',
        pitch: 65,
        velocity: 90,
        startTick: 480,
        endTick: 960,
      },
    ],
  }
}
const showProjectList = new URLSearchParams(location.search).has('list')
const projectSummary = {
  id: project.id,
  name: project.name,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  meta: project.meta,
}

const projectSummaries = Array.from({ length: 60 }, (_, index) => ({
  ...projectSummary,
  id: index === 0 ? projectSummary.id : `project-${index + 1}`,
  name: index === 0 ? projectSummary.name : `MIDI 工程 ${String(index + 1).padStart(2, '0')}`,
  updatedAt: projectSummary.updatedAt + index,
}))

const templateFixtures = Array.from({ length: 60 }, (_, index) => ({
  id: `template-${index + 1}`,
  name: `演奏模板 ${String(index + 1).padStart(2, '0')}`,
  is_builtin: index < 2,
  mappings: [],
}))

/** MIDI 编辑器使用小型可演奏集，便于验证切换模板后的置灰结果。 */
const editorTemplateFixtures = [
  {
    id: 'editor-template-piano',
    name: '钢琴常用键',
    is_builtin: false,
    mappings: [
      { pitch: 60, key: 'A' },
      { pitch: 64, key: 'S' },
    ],
  },
  {
    id: 'editor-template-upper',
    name: '高音演奏键',
    is_builtin: false,
    mappings: [
      { pitch: 67, key: 'D' },
      { pitch: 69, key: 'F' },
    ],
  },
]

const onlineSongFixtures = Array.from(
  { length: 80 },
  (_, index): OnlineMidiSong => ({
    id: `online-${index + 1}`,
    title: `在线曲目 ${String(index + 1).padStart(2, '0')}`,
    slug: `online-${index + 1}`,
    authorName: '验收作者',
    description: '用于验证在线曲库返回后仍保留筛选与滚动位置。',
    genreTypes: ['game'],
    sourceType: 'original',
    licenseType: 'authorized',
    difficultyType: 'normal',
    tags: ['验收'],
    durationMs: 120000,
    trackCount: 2,
    noteCount: 320,
    fileSize: 4096,
    sha256: `fixture-${index + 1}`,
    originalFilename: `online-${index + 1}.mid`,
    downloadFilename: `online-${index + 1}.mid`,
    entryDate: 1700000000000 + index,
    sort: 80 - index,
    published: 1,
    publishedAt: 1700000000000 + index,
    createdAt: 1700000000000 + index,
    updatedAt: 1700000000000 + index,
  })
)

// 只替换桌面数据边界，使用真实主窗口、弹层容器、编辑会话与卷帘。
const savedDrafts: { key: string; name: string }[] = []
let draftFailure = false
let installCalls = 0
let updateState = { ...initialUpdateState(), revision: 0, currentVersion: '1.2.0' }
let updateListener: (state: UpdateSnapshot) => void = () => {}
function emitUpdate(values: Partial<UpdateSnapshot>): UpdateSnapshot {
  updateState = { ...updateState, ...values, revision: updateState.revision + 1 }
  updateListener(updateState)
  return updateState
}
// 仅替换原生安装边界，实际调用主窗口保护和编辑页的草稿注册，绝不执行真实安装。
const updater = createUpdaterController({
  getState: async () => updateState,
  subscribe: async (callback) => {
    updateListener = callback
    return () => {}
  },
  onResume: () => () => {},
  check: async () => updateState,
  download: async () => emitUpdate({ phase: 'ready' }),
  cancel: async () => emitUpdate({ phase: 'available' }),
  install: async () => {
    installCalls++
    return emitUpdate({ phase: 'installing' })
  },
  openDownload: async () => {},
  exportDiagnostics: async () => null,
})
await updater.start()
// 模拟后端按 key 保存完整草稿，便于验证不同入口恢复的内容。
const draftFiles = new Map<string, MidiProject>()
// 原生解析按文件路径读取，不应受主窗口曲库 store 正在刷新影响。
const parsedSongs = new Map(
  [midi, switchedMidi, ...navigationMidiLibrary].map((song) => [song.file_path, song])
)
let customSongs: MidiInfo[] | null = null
let pendingParse: { filename: string; resolve: (() => void) | null } | null = null
mockIPC((command, payload) => {
  // 主题回归使用真实悬浮视图；只替换原生窗口切换和屏幕采集能力，不开启实际采集。
  if (['enter_overlay_mode', 'exit_overlay_mode', 'stop_frame_rate_capture'].includes(command))
    return
  if (command === 'get_frame_rate_capture_capability')
    return {
      platform: 'browser',
      supported: false,
      provider: 'unsupported',
      auto_capture_available: false,
      message: 'Browser fixture',
    }
  if (command === 'stop_playback') return
  if (command === 'get_playback_state') return { is_playing: false, current_tick: 0 }
  if (command === 'save_midi_project_draft') {
    if (draftFailure) throw new Error('测试草稿保存失败')
    const draft = payload as { key: string; project: MidiProject }
    savedDrafts.push({ key: draft.key, name: draft.project.name })
    draftFiles.set(draft.key, structuredClone(draft.project))
    return
  }
  if (command === 'load_midi_project') return { ...project, id: (payload as { id: string }).id }
  if (command === 'save_midi_project')
    return { ...projectSummary, id: 'saved-fixture', updatedAt: Date.now() }
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
  if (command === 'get_midi_projects') return showProjectList ? projectSummaries : []
  if (command === 'get_song_lists')
    return showProjectList || showPlaylistFixture
      ? [
          {
            id: 'favorites',
            name: '常用歌单',
            description: '',
            cover_filename: null,
            song_filenames: showPlaylistFixture
              ? navigationMidiLibrary.map((song) => song.filename)
              : [],
            created_at: 1,
            updated_at: 1,
          },
        ]
      : []
  if (command === 'get_templates')
    return showTemplateList ? templateFixtures : editorTemplateFixtures
  if (['extract_melody', 'extract_all_notes'].includes(command)) return []
  if (command === 'get_midi_library')
    return (
      customSongs ?? (showNavigationFixture || showPlaylistFixture ? navigationMidiLibrary : [midi])
    )
  if (command === 'load_midi_config')
    return {
      ...([...parsedSongs.values()].find(
        (song) => song.filename === (payload as { filename: string }).filename
      ) ?? midi),
      disabled_tracks: [],
    }
  if (command === 'parse_midi_file') {
    const song = parsedSongs.get((payload as { path: string }).path) ?? midi
    if (pendingParse?.filename === song.filename)
      return new Promise((resolve) => {
        pendingParse!.resolve = () => resolve([song, []])
      })
    return [song, []]
  }
  if (command === 'load_midi_project_draft')
    return draftFiles.get((payload as { key: string }).key) ?? null
  if (command === 'delete_midi_project_draft') {
    draftFiles.delete((payload as { key: string }).key)
    return
  }
  if (command === 'check_accessibility') return true
  if (command === 'has_saved_overlay_window_state') return false
  if (['save_midi_config', 'save_settings'].includes(command)) return
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
const NavigationDetailFixture = defineComponent({
  name: 'NavigationDetailFixture',
  setup() {
    const fixtureRouter = useRouter()
    return () =>
      h(
        'button',
        {
          class: 'navigation-detail-back',
          onClick: () => fixtureRouter.back(),
        },
        '返回歌曲列表'
      )
  },
})
const NavigationBackFixture = defineComponent({
  name: 'NavigationBackFixture',
  setup() {
    const fixtureRouter = useRouter()
    return () =>
      h(
        'button',
        {
          class: 'navigation-back',
          onClick: () => fixtureRouter.back(),
        },
        '返回上一列表'
      )
  },
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      name: 'midi-editor-edit',
      path: '/midi-editor/:id',
      component: MidiEditorPage,
      meta: { detachableEditor: true },
    },
    {
      name: 'midi-editor-create',
      path: '/midi-editor/new',
      component: MidiEditorPage,
      meta: { detachableEditor: true },
    },
    {
      name: 'midi-editor',
      path: '/midi-editor',
      component: MidiEditorTab,
      meta: { keepAlive: true },
    },
    {
      name: 'files-all',
      path: '/files/all',
      component: AllSongsPage,
      meta: { keepAlive: true },
    },
    {
      name: 'files-midi-detail',
      path: '/files/midi/:filename',
      component: NavigationDetailFixture,
    },
    {
      name: 'files-song-list-detail',
      path: '/files/song-lists/:id',
      component: SongListDetailPage,
      meta: { keepAlive: true },
    },
    {
      name: 'templates',
      path: '/templates',
      component: TemplateEditor,
      meta: { keepAlive: true },
    },
    {
      name: 'templates-edit',
      path: '/templates/:id/edit',
      component: NavigationBackFixture,
    },
    {
      name: 'online-library',
      path: '/online-library',
      component: OnlineLibraryTab,
      meta: { keepAlive: true },
    },
    {
      name: 'online-library-song-detail',
      path: '/online-library/song/:id',
      component: NavigationBackFixture,
    },
    {
      name: 'navigation-away',
      path: '/navigation-away',
      component: { render: () => h('p', { class: 'navigation-away' }, '主窗口中的其他页面') },
    },
  ],
})
await router.push(
  showNavigationFixture
    ? '/files/all'
    : showPlaylistFixture
      ? '/files/song-lists/favorites'
      : showTemplateList
        ? '/templates'
        : showOnlineList
          ? '/online-library'
          : showProjectList
            ? '/midi-editor'
            : fixtureQuery.has('source')
              ? '/midi-editor/new?from=layout-fixture.mid'
              : fixtureQuery.has('populated')
                ? '/midi-editor/fixture'
                : '/midi-editor/new'
)
const pinia = createPinia()
// 详情进入编辑器时曲库已载入；夹具按真实前置状态装配，不等待主窗口的异步初始化。
if (fixtureQuery.has('source') && !fixtureQuery.has('cold'))
  usePlayerStore(pinia).midiLibrary = [midi]
if (showOnlineList) {
  useOnlineMidiLibraryStore(pinia).setSongs(onlineSongFixtures, Date.now())
}

declare global {
  interface Window {
    midiEditorFixture: {
      seedDraft: (key: string, name: string, filename?: string) => void
      seedEntryDraft: (entry: MidiEditorEntry, name: string) => Promise<string>
      setSongs: (filenames: string[]) => void
      draftNoteCounts: () => number[]
      recordingDraft: (command: string, args: Record<string, unknown>) => Promise<unknown>
      draftKeys: () => string[]
      currentRoute: () => string
      deferParse: (filename: string) => void
      isParsePending: () => boolean
      finishParse: () => void
      navigate: (path: string) => Promise<void>
      back: () => void
      switchMainWindowSong: () => Promise<void>
      runUpdate: () => Promise<{
        installs: number
        drafts: { key: string; name: string }[]
        phase: string
      }>
      failDraft: (fail: boolean) => void
    }
  }
}

window.midiEditorFixture = {
  seedDraft(key, name, filename) {
    draftFiles.set(key, {
      ...structuredClone(project),
      name,
      source: filename ? { filename } : undefined,
    })
  },
  async seedEntryDraft(entry, name) {
    const key = await midiDraftKey(entry)
    const draft = { ...structuredClone(project), name }
    if (entry.kind === 'song') draft.source = { filename: entry.filename }
    if (entry.kind === 'edit') draft.id = entry.id
    draftFiles.set(key, draft)
    return key
  },
  setSongs(filenames) {
    customSongs = filenames.map((filename) => ({
      ...midi,
      filename,
      file_path: `/fixture/${filename}`,
      title: filename.replace(/\.mid$/, ''),
    }))
    for (const song of customSongs) parsedSongs.set(song.file_path, song)
    usePlayerStore(pinia).midiLibrary = customSongs
  },
  recordingDraft: (command: string, args: Record<string, unknown>) => invoke(command, args),
  draftNoteCounts: () => [...draftFiles.values()].map((project) => project.document.notes.length),
  draftKeys: () => [...draftFiles.keys()],
  currentRoute: () => router.currentRoute.value.fullPath,
  deferParse(filename) {
    pendingParse = { filename, resolve: null }
  },
  isParsePending: () => !!pendingParse?.resolve,
  finishParse() {
    pendingParse?.resolve?.()
    pendingParse = null
  },
  async runUpdate() {
    if (updater.state.value.phase !== 'ready')
      emitUpdate({ phase: 'available', targetVersion: '1.2.1' })
    await updater.downloadAndInstallUpdate()
    return { installs: installCalls, drafts: savedDrafts, phase: updater.state.value.phase }
  },
  failDraft(fail: boolean): void {
    draftFailure = fail
  },
  async navigate(path: string): Promise<void> {
    await router.push(path)
  },
  back(): void {
    router.back()
  },
  async switchMainWindowSong(): Promise<void> {
    await usePlayerStore(pinia).selectMidiInQueue(
      switchedMidi,
      [switchedMidi],
      { id: 'all', title: '全部歌曲' },
      { persistSelection: false }
    )
  },
}
createApp({
  render: () =>
    h(
      ConfigProvider,
      { ...infinityNikkiConfigProviderProps, locale: getAntdvLocale(i18n.global.locale.value) },
      {
        default: () => h(AntApp, null, { default: () => h(MainWindow) }),
      }
    ),
})
  .use(pinia)
  .use(i18n)
  .use(router)
  .provide(
    'track-recorder-audio-factory',
    (): RecorderAudio => ({
      prepare: async () => {},
      now: () => performance.now() / 1000,
      note: () => ({ stop() {} }),
      startAccompaniment() {},
      stopAccompaniment() {},
    })
  )
  .provide(MIDI_PROJECT_EDITOR_WINDOW_PORT, browserMidiProjectEditorWindowPort())
  .provide(appUpdaterKey, updater)
  .mount('#app')
