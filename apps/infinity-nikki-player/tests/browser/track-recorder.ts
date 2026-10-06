import { createApp, defineComponent, h, shallowRef } from 'vue'
import { createPinia } from 'pinia'
import { App, ConfigProvider, Button } from 'antdv-next'
import { createProject, createEditorSession } from '@strawberrybear/midi-editor'
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
import '@/style.css'

const drafts = new Map<string, unknown>()
let failDelete = false
let failSave = false
let applyCount = 0
let deferDrafts = false
const pendingDrafts: (() => void)[] = []
interface RecorderFixture {
  failDelete(value: boolean): void
  failSave(value: boolean): void
  seedDraft(conflict: boolean): Promise<void>
  applyCount(): number
  deferDrafts(value: boolean): void
  pendingDrafts(): number
  finishDraft(): void
  draftCount(): number
  seedExisting(): void
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
  note: () => ({ stop() {} }),
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
  seedExisting() {
    session.dispatch({
      type: 'add-note',
      trackId: 'track-1',
      startTick: 0,
      durationTicks: 480,
      pitch: 60,
      velocity: 80,
    })
  },
  failDelete(value) {
    failDelete = value
  },
  failSave(value) {
    failSave = value
  },
  applyCount: () => applyCount,
  async seedDraft(conflict) {
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
app.mount('#app')
