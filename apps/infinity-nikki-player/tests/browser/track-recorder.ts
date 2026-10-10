import { createApp, defineComponent, h, shallowRef } from 'vue'
import { createPinia } from 'pinia'
import { App, ConfigProvider, Button } from 'antdv-next'
import {
  createProject,
  createEditorSession,
  type EditorTransportState,
} from '@strawberrybear/midi-editor'
import { mockIPC } from '@tauri-apps/api/mocks'
import { i18n, getAntdvLocale } from '@/i18n'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
import TrackRecorderLauncher from '@/components/TrackRecorderLauncher.vue'
import {
  applyRecorderResult,
  recorderDraftKey,
  recordingRevision,
} from '@/features/midi-recording/coordinator'
import type { RecorderAudio } from '@/features/midi-recording/types'
import {
  createMidiEditorPlaybackController,
  type MidiEditorPlaybackController,
  type MidiEditorPlaybackControllerOptions,
} from '@/features/midi-editor/playbackController'
import '@/style.css'

const drafts = new Map<string, unknown>()
let failDelete = false
let failSave = false
let applyCount = 0
let deferDrafts = false
const pendingDrafts: (() => void)[] = []
const playedPitches: number[] = []
const previewPitches: number[] = []
let activeRecordingVoices = 0
let previewController: MidiEditorPlaybackController | null = null
const hasMainPortal = new URLSearchParams(window.location.search).has('main')
interface RecorderFixture {
  failDelete(value: boolean): void
  failSave(value: boolean): void
  seedDraft(conflict: boolean, deletedTemplate?: boolean): Promise<void>
  applyCount(): number
  deferDrafts(value: boolean): void
  pendingDrafts(): number
  finishDraft(): void
  draftCount(): number
  seedExisting(durationTicks?: number): void
  seedPartialSelection(): void
  seedOtherTrack(noteCount?: number): void
  renameTrack(name: string): void
  playedPitches(): number[]
  activeRecordingVoices(): number
  hostNotes(): { pitch: number; startTick: number; endTick: number }[]
  previewPitches(): number[]
  clearPreviewPitches(): void
  previewState(): EditorTransportState | null
  previewActivePitches(): readonly number[]
}
declare global {
  interface Window {
    recorderFixture: RecorderFixture
  }
}

mockIPC((command, raw) => {
  const args = raw as { key: string; project: unknown }
  if (command === 'load_midi_project_draft') return drafts.get(args?.key) ?? null
  if (command === 'save_midi_project_draft') {
    if (failSave) throw new Error('disk-save')
    const project = structuredClone(args?.project)
    if (deferDrafts)
      return new Promise<void>((resolve) =>
        pendingDrafts.push(() => {
          drafts.set(args.key, project)
          resolve()
        })
      )
    drafts.set(args.key, project)
    return
  }
  if (command === 'delete_midi_project_draft') {
    if (failDelete) throw new Error('disk-delete')
    drafts.delete(args?.key)
    return
  }
  return null
})
i18n.global.locale.value = 'zh-CN'
const session = createEditorSession(createProject())
const audio = (): RecorderAudio => ({
  prepare: async () => {},
  now: () => performance.now() / 1000,
  note: (pitch) => {
    playedPitches.push(pitch)
    activeRecordingVoices++
    let stopped = false
    return {
      stop() {
        if (!stopped) {
          stopped = true
          activeRecordingVoices--
        }
      },
    }
  },
  startAccompaniment() {},
  stopAccompaniment() {},
})
window.recorderFixture = {
  deferDrafts(value) {
    deferDrafts = value
  },
  pendingDrafts: () => pendingDrafts.length,
  finishDraft() {
    pendingDrafts.shift()?.()
  },
  draftCount: () => drafts.size,
  playedPitches: () => [...playedPitches],
  activeRecordingVoices: () => activeRecordingVoices,
  previewPitches: () => [...previewPitches],
  clearPreviewPitches() {
    previewPitches.length = 0
  },
  previewState: () => previewController?.getState() ?? null,
  previewActivePitches: () => previewController?.getActivePitches() ?? [],
  hostNotes: () =>
    session
      .getState()
      .document.notes.map(({ pitch, startTick, endTick }) => ({ pitch, startTick, endTick })),
  seedExisting(durationTicks = 480) {
    session.dispatch({
      type: 'add-note',
      trackId: 'track-1',
      startTick: 0,
      durationTicks,
      pitch: 60,
      velocity: 80,
    })
  },
  seedPartialSelection() {
    session.dispatch({
      type: 'add-note',
      trackId: 'track-1',
      startTick: 240,
      durationTicks: 240,
      pitch: 62,
      velocity: 80,
    })
    const note = session.getState().document.notes.find((item) => item.pitch === 62)!
    session.dispatch({ type: 'select', mode: 'replace', noteIds: [note.id] })
  },
  seedOtherTrack(noteCount = 1000) {
    session.dispatch({ type: 'add-track', name: '已有伴奏' })
    const trackId = session.getState().document.tracks.at(-1)!.id
    session.dispatch({
      type: 'apply-track-edit',
      trackId,
      notes: Array.from({ length: noteCount }, (_, index) => ({
        id: `existing-${index}`,
        trackId,
        pitch: 60,
        startTick: index * 120,
        endTick: index * 120 + 60,
        velocity: 80,
      })),
      endTick: noteCount * 120,
    })
  },
  renameTrack(name) {
    session.dispatch({ type: 'update-track', trackId: 'track-1', patch: { name } })
  },
  failDelete(value) {
    failDelete = value
  },
  failSave(value) {
    failSave = value
  },
  applyCount: () => applyCount,
  async seedDraft(conflict, deletedTemplate = false) {
    const project = structuredClone(session.getState().project)
    project.document.notes = [
      { id: 'recovered', trackId: 'track-1', pitch: 61, startTick: 0, endTick: 480, velocity: 80 },
    ]
    project.document.tracks[0]!.endTick = 480
    project.extensions = {
      recordingDraft: {
        baseRevision: conflict ? 'stale' : await recordingRevision(session.getState().project),
        trackId: 'track-1',
        cursorTick: 480,
      },
      ...(deletedTemplate
        ? {
            keyboardRecording: {
              template: {
                id: 'deleted-template',
                name: '已删除的录制模板',
                is_builtin: false,
                mappings: [{ key: 'A', pitch: 61 }],
              },
            },
          }
        : {}),
    }
    drafts.set(await recorderDraftKey(project.id, 'track-1'), project)
  },
}
const app = createApp(
  defineComponent({
    setup() {
      const state = shallowRef(session.getState())
      session.subscribe((next) => {
        state.value = next
      })
      return () =>
        h(
          ConfigProvider,
          { ...infinityNikkiConfigProviderProps, locale: getAntdvLocale('zh-CN') },
          () =>
            h(App, {}, () => [
              hasMainPortal
                ? h(
                    'header',
                    {
                      'data-testid': 'host-menu',
                      class: 'pointer-events-none absolute inset-x-0 top-0',
                      style: { height: '46px' },
                    },
                    '主窗口菜单'
                  )
                : null,
              hasMainPortal
                ? h('div', {
                    id: 'main-window-portal-root',
                    class: 'absolute inset-x-0 bottom-0 z-40',
                    style: { top: '46px' },
                  })
                : null,
              h(TrackRecorderLauncher, {
                state: state.value,
                templates: [
                  {
                    id: 'test',
                    name: '测试映射',
                    is_builtin: false,
                    mappings: [
                      { key: 'A', pitch: 61 },
                      { key: 'S', pitch: 108 },
                      { key: 'SPACE', pitch: 60 },
                      { key: 'TAB', pitch: 62 },
                      { key: 'ENTER', pitch: 63 },
                      { key: 'Z', pitch: 64 },
                    ],
                  },
                  {
                    id: 'extra-rows',
                    name: '功能和数字映射',
                    is_builtin: false,
                    mappings: [
                      { key: 'F1', pitch: 65 },
                      { key: '1', pitch: 67 },
                    ],
                  },
                ],
                templateId: 'test',
                prepareExternal: async () => {},
                applyResult: (result) => {
                  applyCount++
                  return applyRecorderResult(
                    () => session.getState().project,
                    (action) => session.dispatch(action),
                    async () => {},
                    result
                  )
                },
              }),
              h(
                'span',
                { 'data-testid': 'host-note-count' },
                String(state.value.document.notes.length)
              ),
              h(Button, { onClick: () => session.dispatch({ type: 'undo' }) }, () => '主项目撤销'),
            ])
        )
    },
  })
)
app.use(createPinia())
app.use(i18n)
app.provide('track-recorder-audio-factory', audio)
// 仅替换音频端口，文档缓存、循环排程、暂停和声音生命周期仍执行真实控制器。
app.provide('track-recorder-playback-factory', (options: MidiEditorPlaybackControllerOptions) => {
  previewController = createMidiEditorPlaybackController({
    ...options,
    ensureAudio: async () => {},
    getAudioClock: () => performance.now() / 1000,
    scheduleNote: (pitch) => {
      previewPitches.push(pitch)
      return { stop() {} }
    },
  })
  return previewController
})
app.mount('#app')
