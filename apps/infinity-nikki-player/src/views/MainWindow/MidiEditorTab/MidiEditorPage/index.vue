<script setup lang="ts">
/**
 * @description: MIDI 编辑页：载入项目 → 会话/试听/快捷键 → 复用 PianoWorkspace 编辑 → 保存/草稿/导出
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, ConfigProvider, Input, Tooltip } from 'antdv-next'
import { FileMusic, ListPlus, Maximize2, Minimize2, Plus, Save, LogOut, X } from 'lucide-vue-next'
import { NIKKI_PRIMARY_ACTIVE_COLOR } from '@/theme/infinityNikkiTheme'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { createProject } from '@strawberrybear/midi-editor'
import type { EditorAction, MidiProject } from '@strawberrybear/midi-editor'
import type { PianoRollEditIntent } from '@strawberrybear/piano-roll/browser'
import { createTimeline } from '@strawberrybear/piano-roll/core'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import type { PianoRollProps } from '@strawberrybear/piano-roll/vue'
import PianoWorkspace from '@/components/PianoWorkspace/PianoWorkspace.vue'
import { usePianoRollLabels } from '@/components/PianoWorkspace/usePianoRollLabels'
import {
  createPianoHostRegistry,
  type PianoTrackActionsRegistry,
} from '@/components/PianoWorkspace/usePianoTrackHosts'
import type { PianoWorkspaceState } from '@/features/piano-editor'
import {
  addProjectToLibrary,
  createProjectFromMidi,
  duplicateProject,
  exportProjectAsMidi,
  uniqueProjectName,
} from '@/features/midi-editor/projectIo'
import { feedback as toast } from '@/lib/feedback'
import { useMidiProjectStore } from '@/stores/midiProjects'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import type { MidiInfo } from '@/types'
import EditorChoiceModal, { type EditorChoiceOption } from './components/EditorChoiceModal.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import NoteContextMenu, { type NoteContextMenuTarget } from './components/NoteContextMenu.vue'
import NoteInspector from './components/NoteInspector.vue'
import TrackActionsMenu from './components/TrackActionsMenu.vue'
import { useMidiEditorPlayback } from './useMidiEditorPlayback'
import { useMidiEditorSession, type MidiEditorSessionHandle } from './useMidiEditorSession'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const projectStore = useMidiProjectStore()
const mainWindowUi = useMainWindowUiStore()
// macOS 沉浸式窗口的原生交通灯仍占据左上角，全屏布局把留白收敛到工具栏内。
const needsTrafficLightSpace = isTauri() && /Mac/i.test(navigator.userAgent)
const labels = usePianoRollLabels()

/** 草稿自动保存间隔。 */
const DRAFT_AUTOSAVE_INTERVAL_MS = 15_000
/** 力度条高度（px）。 */
const VELOCITY_LANE_HEIGHT = 72

// ---------- 会话与派生状态 ----------
const editor = shallowRef<MidiEditorSessionHandle | null>(null)
const state = computed(() => editor.value?.state.value ?? null)
const activeDocument = computed(() => state.value?.document ?? null)
const loop = computed(() => state.value?.project.loop ?? null)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
/** 项目是否已在磁盘上存在（编辑模式或新建后已保存）。 */
const persisted = ref(false)
/** 已加载草稿但尚未保存时，会话 dirty 为 false，需要单独标记。 */
const draftLoaded = ref(false)
const hasChanges = computed(() => !!state.value && (state.value.dirty || draftLoaded.value))
const showVelocity = ref(false)
// 编辑密度独立于项目历史；切换不会重建会话或丢失选区。
const detailed = ref(false)
const editorTheme = {
  token: { borderRadius: 6, controlHeightSM: 28, fontSize: 13 },
  components: {
    Button: { borderRadius: 6, primaryShadow: 'none', colorPrimary: NIKKI_PRIMARY_ACTIVE_COLOR },
    Select: { borderRadius: 6, borderRadiusLG: 8 },
    Popover: { borderRadiusLG: 10 },
  },
}
const showPlayable = ref(false)
const selectedTrackId = ref<string | null>(null)
const contextTarget = ref<NoteContextMenuTarget | null>(null)
const workspace = ref<InstanceType<typeof PianoWorkspace> | null>(null)
const trackActions: PianoTrackActionsRegistry = createPianoHostRegistry()
let uninstallShortcuts: (() => void) | null = null
let draftTimer: number | null = null

const playback = useMidiEditorPlayback(activeDocument, loop, (frame) => workspace.value?.setTransport(frame))

const isEditRoute = computed(() => route.name === 'midi-editor-edit')
const draftKey = computed(() =>
  isEditRoute.value ? `edit-${String(route.params.id ?? '')}` : 'create'
)
const pageTitle = computed(() =>
  isEditRoute.value ? t('midiEditor.editProject') : t('midiEditor.newProject')
)
/** 当前映射模板可演奏的音高集合；关闭高亮时为 null。 */
const playablePitches = computed(() => {
  if (!showPlayable.value) return null
  const template = settingsStore.templates.find((item) => item.id === settingsStore.currentTemplateId)
  return template ? new Set(template.mappings.map((mapping) => mapping.pitch)) : null
})
const editing = computed<PianoRollProps['editing']>(() => {
  const handle = editor.value
  const current = state.value
  if (!handle || !current) return undefined
  return {
    enabled: true,
    tool: current.tool,
    selectedNoteIds: current.selection,
    snapTicks: (tick, mode) => handle.session.snapTick(tick, mode),
    defaultDurationTicks: handle.session.snapStep() || current.document.ticksPerBeat,
    highlightPitches: playablePitches.value,
    loop: current.project.loop ?? null,
    velocityLaneHeight: showVelocity.value ? VELOCITY_LANE_HEIGHT : 0,
  }
})

// ---------- 通用选择弹窗 ----------
const choice = ref<{
  open: boolean
  title: string
  description: string
  options: EditorChoiceOption[]
  resolve: CallableFunction | null
}>({ open: false, title: '', description: '', options: [], resolve: null })

/**
 * @description: 弹出选择框并等待用户选择
 * @param {string} title 标题
 * @param {string} description 说明
 * @param {EditorChoiceOption[]} options 选项
 * @return {Promise<string>} 选中的 key；关闭为 `cancel`
 */
function ask(title: string, description: string, options: EditorChoiceOption[]): Promise<string> {
  choice.value.resolve?.('cancel')
  return new Promise((resolve) => {
    choice.value = { open: true, title, description, options, resolve }
  })
}
function resolveChoice(key: string): void {
  const resolve = choice.value.resolve
  choice.value.open = false
  choice.value.resolve = null
  resolve?.(key)
}
/**
 * @description: 双按钮确认
 * @param {string} title 标题
 * @param {string} description 说明
 * @param {string} okLabel 确认按钮文案
 * @param {boolean} danger 是否危险动作
 * @return {Promise<boolean>} 是否确认
 */
async function confirm(title: string, description: string, okLabel: string, danger = false): Promise<boolean> {
  const key = await ask(title, description, [
    { key: 'cancel', label: t('actions.cancel') },
    { key: 'ok', label: okLabel, primary: true, danger },
  ])
  return key === 'ok'
}

// ---------- 载入 ----------
function trackDefaultName(index: number): string {
  return t('midiEditor.trackDefaultName', { index })
}
function trackCopyName(name: string): string {
  return t('midiEditor.trackCopyName', { name })
}

/**
 * @description: 按曲库文件名构造项目；缓存缺少音符事件时回退到 Rust 重新解析
 * @param {string} filename 曲库文件名
 * @return {Promise<MidiProject>} 新项目
 */
async function projectFromLibrary(filename: string): Promise<MidiProject> {
  let midi = playerStore.midiLibrary.find((item) => item.filename === filename) ?? null
  if (!midi) throw new Error(t('midiEditor.sourceMidiMissing'))
  if (!midi.events?.length) {
    const [parsed] = await invoke<[MidiInfo, unknown[]]>('parse_midi_file', { path: midi.file_path })
    midi = { ...midi, ...parsed }
  }
  return createProjectFromMidi(midi, trackDefaultName)
}

/**
 * @description: 依据路由决定初始项目
 * @return {Promise<MidiProject>} 项目
 */
async function resolveInitialProject(): Promise<MidiProject> {
  if (isEditRoute.value) return projectStore.loadProject(String(route.params.id ?? ''))
  const from = typeof route.query.from === 'string' ? route.query.from : ''
  if (from) return projectFromLibrary(from)
  const fromProject = typeof route.query.fromProject === 'string' ? route.query.fromProject : ''
  if (fromProject) return duplicateProject(await projectStore.loadProject(fromProject), trackCopyName)
  const existing = new Set(projectStore.projects.map((item) => item.name))
  return createProject({ name: uniqueProjectName(t('midiEditor.untitled'), existing, 'Untitled') })
}

function disposeEditor(): void {
  uninstallShortcuts?.()
  uninstallShortcuts = null
  editor.value?.dispose()
  editor.value = null
}

/**
 * @description: 载入路由指向的项目并建立会话；检测到草稿时询问用户
 * @return {Promise<void>}
 */
async function loadFromRoute(): Promise<void> {
  loading.value = true
  loadError.value = ''
  draftLoaded.value = false
  playback.stop()
  disposeEditor()
  try {
    await projectStore.ensureLoaded()
    let project = await resolveInitialProject()
    const draft = await projectStore.loadDraft(draftKey.value).catch(() => null)
    if (draft) {
      const decision = await ask(t('midiEditor.draftFound'), t('midiEditor.loadDraftPrompt'), [
        { key: 'cancel', label: t('actions.cancel') },
        { key: 'discard', label: t('midiEditor.discardDraft'), danger: true },
        { key: 'load', label: t('midiEditor.loadDraft'), primary: true },
      ])
      if (decision === 'cancel') {
        await leaveWithoutNewHistory()
        return
      }
      if (decision === 'discard') await projectStore.deleteDraft(draftKey.value).catch(() => {})
      else {
        // 草稿以磁盘项目的 id/createdAt 为准，避免保存时写出第二份文件。
        project = { ...draft, id: project.id, createdAt: project.createdAt }
        draftLoaded.value = true
      }
    }
    persisted.value = isEditRoute.value
    const handle = useMidiEditorSession(project, { trackDefaultName, trackCopyName })
    editor.value = handle
    uninstallShortcuts = handle.installShortcuts({
      togglePlayback: () => void playback.toggle(),
      save: () => void save(),
      // 播放头不在起点时贴到播放头（DAW 习惯），否则退回选区起点。
      pasteTick: () => {
        const seconds = playback.positionSeconds.value
        if (seconds <= 0) return undefined
        const timeline = createTimeline(handle.state.value.document)
        return handle.session.snapTick(timeline.secondsToTick(seconds), 'nearest')
      },
    })
    await nextTick()
    // 全新项目直接打开第一条轨道的详情，用户可立刻落音符。
    if (!isEditRoute.value && project.document.notes.length === 0) {
      const first = project.document.tracks[0]
      if (first) workspace.value?.openTrack(first.id)
    }
  } catch (error) {
    loadError.value = String(error)
  } finally {
    loading.value = false
  }
}

// ---------- 编辑动作 ----------
function dispatch(action: EditorAction): void {
  editor.value?.dispatch(action)
}
function handleIntent(intent: PianoRollEditIntent): void {
  switch (intent.type) {
    case 'audition':
      void playback.audition(intent.pitch, intent.velocity)
      return
    case 'context-menu':
      contextTarget.value = intent
      return
    default:
      dispatch(intent)
  }
}
function rememberWorkspace(next: PianoWorkspaceState): void {
  selectedTrackId.value = next.selectedTrackId
}
function toggleTrackEnabled(trackId: string): void {
  const track = activeDocument.value?.tracks.find((item) => item.id === trackId)
  if (track) dispatch({ type: 'update-track', trackId, patch: { enabled: !track.enabled } })
}
async function addTrack(): Promise<void> {
  dispatch({ type: 'add-track' })
  const created = activeDocument.value?.tracks.at(-1)
  // 等工作区拿到新文档后再打开，否则 openTrack 会因找不到轨道而忽略。
  await nextTick()
  if (created) workspace.value?.openTrack(created.id)
}
/**
 * @description: 删除轨道；含音符时先确认，最后一条轨不可删
 * @param {PianoRollTrack} track 轨道
 * @return {Promise<void>}
 */
async function removeTrack(track: PianoRollTrack): Promise<void> {
  const current = activeDocument.value
  if (!current) return
  if (current.tracks.length <= 1) {
    toast.warning(t('midiEditor.lastTrack'), { richColors: true })
    return
  }
  const count = current.notes.reduce((sum, note) => sum + (note.trackId === track.id ? 1 : 0), 0)
  if (
    count > 0 &&
    !(await confirm(
      t('midiEditor.deleteTrack'),
      t('midiEditor.confirmDeleteTrack', { name: track.name, count }),
      t('actions.delete'),
      true
    ))
  ) {
    return
  }
  dispatch({ type: 'remove-track', trackId: track.id })
}
/**
 * @description: 修改 BPM；多速度曲目先确认替换为单一速度
 * @param {number} bpm 新 BPM
 * @return {Promise<void>}
 */
async function setBpm(bpm: number): Promise<void> {
  if (
    (activeDocument.value?.tempoMap.length ?? 0) > 1 &&
    !(await confirm(
      t('midiEditor.toolbar.replaceTempoTitle'),
      t('midiEditor.toolbar.replaceTempoDescription'),
      t('midiEditor.toolbar.replace')
    ))
  ) {
    return
  }
  dispatch({ type: 'set-tempo', bpm })
}
async function setMeter(numerator: number, denominator: number): Promise<void> {
  if (
    (activeDocument.value?.timeSignatureMap.length ?? 0) > 1 &&
    !(await confirm(
      t('midiEditor.toolbar.replaceMeterTitle'),
      t('midiEditor.toolbar.replaceMeterDescription'),
      t('midiEditor.toolbar.replace')
    ))
  ) {
    return
  }
  dispatch({ type: 'set-time-signature', numerator, denominator })
}
function renameProject(event: Event): void {
  dispatch({ type: 'rename', name: (event.target as HTMLInputElement).value })
}

// ---------- 保存 / 草稿 / 导出 ----------
/**
 * @description: 保存项目；新建模式首次保存后切换到编辑路由
 * @return {Promise<boolean>} 是否保存成功
 */
async function save(): Promise<boolean> {
  const handle = editor.value
  if (!handle || saving.value) return false
  const project = handle.session.toProject()
  if (!project.name.trim()) {
    toast.error(t('midiEditor.nameRequired'), { richColors: true })
    return false
  }
  saving.value = true
  try {
    const summary = await projectStore.saveProject(project)
    handle.session.markSaved({
      id: summary.id,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    })
    await projectStore.deleteDraft(draftKey.value).catch(() => {})
    draftLoaded.value = false
    persisted.value = true
    toast.success(t('midiEditor.saved'), { richColors: true })
    if (!isEditRoute.value) {
      await router.replace({ name: 'midi-editor-edit', params: { id: summary.id } })
    }
    return true
  } catch (error) {
    toast.error(t('midiEditor.saveFailed'), { description: String(error), richColors: true })
    return false
  } finally {
    saving.value = false
  }
}
function writeDraft(): void {
  const handle = editor.value
  if (!handle || !hasChanges.value) return
  void projectStore.saveDraft(draftKey.value, handle.session.toProject()).catch(() => {})
}
async function exportMidi(): Promise<void> {
  const handle = editor.value
  if (!handle) return
  try {
    if (await exportProjectAsMidi(handle.session.toProject())) {
      toast.success(t('midiEditor.midiExported'), { richColors: true })
    }
  } catch (error) {
    toast.error(t('midiEditor.exportFailed'), { description: String(error), richColors: true })
  }
}
async function addToLibrary(): Promise<void> {
  const handle = editor.value
  if (!handle) return
  if (await addProjectToLibrary(handle.session.toProject())) {
    toast.success(t('midiEditor.addedToLibrary'), { richColors: true })
  }
}

// ---------- 离开 ----------
async function leaveWithoutNewHistory(): Promise<void> {
  if (window.history.state?.back != null) {
    router.back()
    return
  }
  await router.replace({ name: 'midi-editor' })
}
/**
 * @description: 有未保存改动时询问：保存并退出 / 直接退出 / 取消
 * @return {Promise<boolean>} 是否允许离开
 */
async function confirmLeaveIfNeeded(): Promise<boolean> {
  if (!hasChanges.value) return true
  const decision = await ask(
    t('midiEditor.leaveConfirmTitle'),
    t('midiEditor.leaveConfirmDescription'),
    [
      { key: 'cancel', label: t('actions.cancel') },
      { key: 'discard', label: t('midiEditor.discardAndExit'), danger: true },
      { key: 'save', label: t('midiEditor.saveAndExit'), primary: true },
    ]
  )
  if (decision === 'save') return save()
  if (decision === 'discard') {
    await projectStore.deleteDraft(draftKey.value).catch(() => {})
    draftLoaded.value = false
    return true
  }
  return false
}
async function navigateBack(): Promise<void> {
  if (await confirmLeaveIfNeeded()) await leaveWithoutNewHistory()
}
async function saveAndExit(): Promise<void> {
  if (await save()) await leaveWithoutNewHistory()
}
function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasChanges.value) return
  writeDraft()
  event.preventDefault()
  event.returnValue = ''
}

function handleExitExpanded(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || !mainWindowUi.midiEditorExpanded) return
  // 弹层先处理 Escape；关闭菜单或确认框时不同时改变编辑布局。
  if (choice.value.open || contextTarget.value) return
  if (
    event.target instanceof Element &&
    event.target.closest('.ant-select, .ant-popover, .ant-dropdown, .ant-modal')
  ) return
  mainWindowUi.midiEditorExpanded = false
}

onBeforeRouteLeave(async (to) => {
  // 新建保存后 replace 到编辑路由属于同一页面，不触发守卫。
  if (to.name === 'midi-editor-edit' && state.value?.project.id === to.params.id) return true
  const allowed = await confirmLeaveIfNeeded()
  if (allowed) playback.stop()
  return allowed
})

watch(
  () => [route.name, route.params.id, route.query.from, route.query.fromProject] as const,
  ([name, id]) => {
    if (name !== 'midi-editor-create' && name !== 'midi-editor-edit') return
    if (name === 'midi-editor-edit' && state.value?.project.id === id) return
    void loadFromRoute()
  }
)

onMounted(() => {
  void loadFromRoute()
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleExitExpanded)
  draftTimer = window.setInterval(writeDraft, DRAFT_AUTOSAVE_INTERVAL_MS)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleExitExpanded)
  mainWindowUi.midiEditorExpanded = false
  if (draftTimer !== null) window.clearInterval(draftTimer)
  choice.value.resolve?.('cancel')
  disposeEditor()
})
</script>

<template>
  <ConfigProvider :theme="editorTheme" :tooltip="{ styles: { root: { pointerEvents: 'none' } } }">
    <section
      class="midi-editor-page"
      :class="{ 'midi-editor-page--expanded': mainWindowUi.midiEditorExpanded }"
    >
      <header
        class="midi-editor-header"
        :class="{ '!pl-[90px]': mainWindowUi.midiEditorExpanded && needsTrafficLightSpace }"
      >
        <div class="editor-project-identity">
          <span class="editor-project-label">{{ pageTitle }}</span>
          <Input
            v-if="state"
            class="midi-editor-name"
            size="small"
            variant="borderless"
            :value="state.project.name"
            :maxlength="30"
            :placeholder="t('midiEditor.name')"
            :aria-label="t('midiEditor.name')"
            @change="renameProject"
          />
          <Tooltip v-if="hasChanges" :title="t('midiEditor.unsaved')">
            <span class="editor-unsaved" :aria-label="t('midiEditor.unsaved')" role="status" />
          </Tooltip>
        </div>
        <div class="editor-project-actions">
          <Tooltip :title="t('midiEditor.exportMidi')" :trigger="['hover', 'focus']">
            <Button
              size="small"
              color="default"
              variant="text"
              :disabled="!state"
              :aria-label="t('midiEditor.exportMidi')"
              @click="exportMidi"
            >
              <template #icon>
                <FileMusic class="header-action-icon" />
              </template>
            </Button>
          </Tooltip>
          <Tooltip :title="t('midiEditor.addToLibrary')" :trigger="['hover', 'focus']">
            <Button
              size="small"
              color="default"
              variant="text"
              :disabled="!state"
              :aria-label="t('midiEditor.addToLibrary')"
              @click="addToLibrary"
            >
              <template #icon>
                <ListPlus class="header-action-icon" />
              </template>
            </Button>
          </Tooltip>
          <span class="header-separator" />
          <Tooltip
            :title="t(mainWindowUi.midiEditorExpanded ? 'midiEditor.exitFullscreen' : 'midiEditor.fullscreen')"
            :trigger="['hover', 'focus']"
          >
            <Button
              size="small"
              color="default"
              variant="text"
              :aria-label="t(mainWindowUi.midiEditorExpanded ? 'midiEditor.exitFullscreen' : 'midiEditor.fullscreen')"
              :aria-pressed="mainWindowUi.midiEditorExpanded"
              @click="mainWindowUi.midiEditorExpanded = !mainWindowUi.midiEditorExpanded"
            >
              <template #icon>
                <component
                  :is="mainWindowUi.midiEditorExpanded ? Minimize2 : Maximize2"
                  class="header-action-icon"
                />
              </template>
            </Button>
          </Tooltip>
          <Tooltip :title="t('actions.cancel')" :trigger="['hover', 'focus']">
            <Button
              size="small"
              color="default"
              variant="text"
              :aria-label="t('actions.cancel')"
              @click="navigateBack"
            >
              <template #icon>
                <X class="header-action-icon" />
              </template>
            </Button>
          </Tooltip>
          <span class="header-separator" />
          <Button type="primary" size="small" :loading="saving" :disabled="!state" @click="save">
            <template #icon>
              <Save class="header-action-icon" /> </template
            >{{ t('actions.save') }}
          </Button>
          <Tooltip :title="t('midiEditor.saveAndExit')" :trigger="['hover', 'focus']">
            <Button
              size="small"
              color="default"
              variant="text"
              :loading="saving"
              :disabled="!state"
              :aria-label="t('midiEditor.saveAndExit')"
              @click="saveAndExit"
            >
              <template #icon>
                <LogOut class="header-action-icon" />
              </template>
            </Button>
          </Tooltip>
        </div>
      </header>

      <section v-if="loadError" class="midi-editor-missing">
        <span>{{ loadError }}</span>
        <Button @click="leaveWithoutNewHistory">
          {{ t('midiEditor.projectList') }}
        </Button>
      </section>

      <template v-else-if="state && editor">
        <EditorToolbar
          v-model:show-velocity="showVelocity"
          v-model:show-playable="showPlayable"
          :state="state"
          :is-playing="playback.isPlaying.value"
          @dispatch="dispatch"
          @play="playback.play()"
          @pause="playback.pause()"
          @stop="playback.stop()"
          @set-bpm="setBpm"
          @set-meter="setMeter"
        />

        <div class="midi-editor-body">
          <PianoWorkspace
            ref="workspace"
            :filename="`midi-editor:${state.project.id}`"
            :document="state.document"
            :transport="playback.transport.value"
            :labels="labels"
            :editing="editing"
            :render-track-actions="trackActions.render"
            hide-detach
            @state-change="rememberWorkspace"
            @toggle-track="toggleTrackEnabled"
            @seek="playback.seek"
            @edit-intent="handleIntent"
          >
            <template #corner-actions>
              <Tooltip :title="t('midiEditor.addTrack')">
                <Button
                  class="piano-corner-button"
                  size="small"
                  color="primary"
                  variant="link"
                  :aria-label="t('midiEditor.addTrack')"
                  @click="addTrack"
                >
                  <template #icon>
                    <Plus class="size-4" :stroke-width="2.4" />
                  </template>
                </Button>
              </Tooltip>
            </template>
          </PianoWorkspace>
        </div>

        <NoteInspector
          v-model:detailed="detailed"
          :state="state"
          :playable-pitches="playablePitches"
          @dispatch="dispatch"
        />

        <TrackActionsMenu
          :hosts="trackActions.hosts"
          :tracks="state.document.tracks"
          @dispatch="dispatch"
          @remove-track="removeTrack"
        />
        <NoteContextMenu
          :target="contextTarget"
          :state="state"
          :track-id="selectedTrackId"
          @dispatch="dispatch"
          @close="contextTarget = null"
        />
      </template>

      <section v-else class="midi-editor-missing">
        <span>{{ t('onlineLibrary.loading') }}</span>
      </section>

      <EditorChoiceModal
        :open="choice.open"
        :title="choice.title"
        :description="choice.description"
        :options="choice.options"
        @choose="resolveChoice"
      />
    </section>
  </ConfigProvider>
</template>

<style scoped>
.midi-editor-page {
  @apply flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-white/75;
}

.midi-editor-header {
  @apply flex shrink-0 items-center justify-between gap-3 border-b border-primary/10 px-3 py-2;
}

.midi-editor-page--expanded {
  @apply rounded-none border-0;
}

/* 输入与按钮来自多根组件，尺寸样式通过容器的 deep 选择器稳定作用于最终 DOM。 */
.editor-project-identity { @apply flex min-w-0 flex-1 items-center gap-2; }
.editor-project-label { @apply shrink-0 text-xs; color: var(--color-muted); }
.editor-project-identity :deep(.midi-editor-name) { width: 100%; min-width: 0; max-width: 360px; font-weight: 600; }
.editor-project-actions { @apply flex shrink-0 items-center gap-1; }
.editor-project-actions :deep(.ant-btn-text) { color: var(--color-muted-dark); }
.editor-unsaved { @apply size-1.5 shrink-0 rounded-full bg-primary; }
.header-separator { @apply mx-1 h-4 w-px bg-primary/15; }

.header-action-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.35;
}

.midi-editor-body {
  @apply flex min-h-0 flex-1 flex-col;
}

.midi-editor-missing {
  @apply flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm;
  color: var(--color-muted-dark);
}

.piano-corner-button.ant-btn {
  width: 20px;
  min-width: 20px;
  height: 20px;
  padding: 0;
}
</style>
