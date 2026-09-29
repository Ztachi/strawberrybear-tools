<script setup lang="ts">
/**
 * @description: MIDI 编辑页：载入项目 → 会话/试听/快捷键 → 复用 PianoWorkspace 编辑 → 保存/草稿/导出
 */
import {
  computed,
  inject,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, ConfigProvider, Input, Tooltip } from 'antdv-next'
import { ExternalLink } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { createProject } from '@strawberrybear/midi-editor'
import type { EditorAction, MidiProject } from '@strawberrybear/midi-editor'
import { createTimeline } from '@strawberrybear/piano-roll/core'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import { usePianoRollLabels } from '@/components/PianoWorkspace/usePianoRollLabels'
import type { PianoWorkspaceState } from '@/features/piano-editor'
import {
  MidiProjectEditorWindowSession,
  MIDI_PROJECT_EDITOR_WINDOW_PORT,
  serializeMidiProjectEditorState,
  type MidiProjectEditorRequest,
  type MidiProjectEditorWindowPort,
} from '@/features/midi-project-editor-window'
import {
  createProjectFromMidi,
  duplicateProject,
  exportProjectAsMidi,
  uniqueProjectName,
} from '@/features/midi-editor/projectIo'
import { feedback as toast } from '@/lib/feedback'
import {
  backOrReplaceWithFreshMainPage,
  freshMainPageLocation,
} from '@/router/mainNavigation'
import { createMidiProjectEditorWindowPort } from '@/platform/tauri/midiProjectEditorWindow'
import { useMidiProjectStore } from '@/stores/midiProjects'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { midiEditorConfigProviderProps } from '@/theme/infinityNikkiTheme'
import type { MidiInfo } from '@/types'
import EditorChoiceModal, { type EditorChoiceOption } from './components/EditorChoiceModal.vue'
import EditorProjectActions from './components/EditorProjectActions.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import MidiEditorWorkspace from './components/MidiEditorWorkspace.vue'
import { useMidiEditorPlayback } from './useMidiEditorPlayback'
import { useMidiEditorSession, type MidiEditorSessionHandle } from './useMidiEditorSession'

defineOptions({ name: 'MidiEditorPage' })

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const projectStore = useMidiProjectStore()
const mainWindowUi = useMainWindowUiStore()
const labels = usePianoRollLabels()
const editorWindowPort =
  inject<MidiProjectEditorWindowPort | undefined>(MIDI_PROJECT_EDITOR_WINDOW_PORT, undefined) ??
  createMidiProjectEditorWindowPort()

/** 草稿自动保存间隔。 */
const DRAFT_AUTOSAVE_INTERVAL_MS = 15_000
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
const dimUnplayable = ref(false)
const currentDraftKey = ref('create')
const workspace = ref<InstanceType<typeof MidiEditorWorkspace> | null>(null)
const latestViewport = shallowRef<PianoWorkspaceState>()
const workspaceRestore = shallowRef<PianoWorkspaceState>()
const editorWindowStatus = ref<'docked' | 'opening' | 'detached'>('docked')
let uninstallShortcuts: (() => void) | null = null
let draftTimer: number | null = null
let editorWindow: MidiProjectEditorWindowSession | null = null
let endingDetachedEditor = false
let pageActive = true

const playback = useMidiEditorPlayback(activeDocument, loop, (frame) =>
  workspace.value?.setTransport(frame)
)

const isEditRoute = computed(() => route.name === 'midi-editor-edit')
/** 当前映射模板可演奏的音高集合；关闭不可演奏音符置灰时为 null。 */
const playablePitches = computed(() => {
  if (!dimUnplayable.value) return null
  const template = settingsStore.templates.find((item) => item.id === settingsStore.currentTemplateId)
  return template ? new Set(template.mappings.map((mapping) => mapping.pitch)) : null
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

function installEditorShortcuts(): void {
  const handle = editor.value
  if (!handle || uninstallShortcuts || editorWindowStatus.value === 'detached' || !pageActive) return
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
}

function uninstallEditorShortcuts(): void {
  uninstallShortcuts?.()
  uninstallShortcuts = null
}

/**
 * @description: 载入路由指向的项目并建立会话；检测到草稿时询问用户
 * @return {Promise<void>}
 */
async function loadFromRoute(): Promise<void> {
  const loadingEditRoute = isEditRoute.value
  const loadingDraftKey = loadingEditRoute ? `edit-${String(route.params.id ?? '')}` : 'create'
  currentDraftKey.value = loadingDraftKey
  loading.value = true
  loadError.value = ''
  draftLoaded.value = false
  playback.stop()
  disposeEditor()
  try {
    await projectStore.ensureLoaded()
    let project = await resolveInitialProject()
    const draft = await projectStore.loadDraft(loadingDraftKey).catch(() => null)
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
      if (decision === 'discard') await projectStore.deleteDraft(loadingDraftKey).catch(() => {})
      else {
        // 草稿以磁盘项目的 id/createdAt 为准，避免保存时写出第二份文件。
        project = { ...draft, id: project.id, createdAt: project.createdAt }
        draftLoaded.value = true
      }
    }
    persisted.value = loadingEditRoute
    const handle = useMidiEditorSession(project, { trackDefaultName, trackCopyName })
    editor.value = handle
    installEditorShortcuts()
    await nextTick()
    // 全新项目直接打开第一条轨道的详情，用户可立刻落音符。
    if (!loadingEditRoute && project.document.notes.length === 0) {
      const first = project.document.tracks[0]
      if (first) workspace.value?.openTrack(first.id)
    }
    if (route.query.detached === '1') await openDetachedEditor()
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
function rememberWorkspace(next: PianoWorkspaceState): void {
  latestViewport.value = next
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
  const wasPersisted = persisted.value
  const previousDraftKey = currentDraftKey.value
  try {
    const summary = await projectStore.saveProject(project)
    handle.session.markSaved({
      id: summary.id,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    })
    await projectStore.deleteDraft(previousDraftKey).catch(() => {})
    draftLoaded.value = false
    persisted.value = true
    currentDraftKey.value = `edit-${summary.id}`
    toast.success(t('midiEditor.saved'), { richColors: true })
    editorWindow?.notify('success', t('midiEditor.saved'))
    if (!wasPersisted && editorWindowStatus.value === 'docked') {
      await router.replace({ name: 'midi-editor-edit', params: { id: summary.id } })
    }
    return true
  } catch (error) {
    toast.error(t('midiEditor.saveFailed'), { description: String(error), richColors: true })
    editorWindow?.notify('error', t('midiEditor.saveFailed'), String(error))
    return false
  } finally {
    saving.value = false
  }
}
function writeDraft(): void {
  const handle = editor.value
  if (!handle || !hasChanges.value) return
  void projectStore.saveDraft(currentDraftKey.value, handle.session.toProject()).catch(() => {})
}
async function exportMidi(): Promise<boolean> {
  const handle = editor.value
  if (!handle) return false
  try {
    if (await exportProjectAsMidi(handle.session.toProject())) {
      toast.success(t('midiEditor.midiExported'), { richColors: true })
      editorWindow?.notify('success', t('midiEditor.midiExported'))
      return true
    }
    return false
  } catch (error) {
    toast.error(t('midiEditor.exportFailed'), { description: String(error), richColors: true })
    editorWindow?.notify('error', t('midiEditor.exportFailed'), String(error))
    return false
  }
}

/** 切换用于不可演奏提示的键位映射模板。 */
async function selectKeyTemplate(templateId: string): Promise<void> {
  try {
    await settingsStore.selectTemplate(templateId)
  } catch (error) {
    toast.error(t('midiEditor.templateSelectFailed'), {
      description: String(error),
      richColors: true,
    })
  }
}
// ---------- 离开 ----------
/**
 * @description: 返回上一个页面，缺少浏览历史时回到 MIDI 项目列表
 * @return {Promise<void>} 导航完成后结束
 */
async function leaveWithoutNewHistory(): Promise<void> {
  await backOrReplaceWithFreshMainPage(router, { name: 'midi-editor' })
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
      { key: 'discard', label: t('midiEditor.discardAndClose'), danger: true },
      { key: 'save', label: t('midiEditor.saveAndClose'), primary: true },
    ]
  )
  if (decision === 'save') return save()
  if (decision === 'discard') {
    await projectStore.deleteDraft(currentDraftKey.value).catch(() => {})
    draftLoaded.value = false
    return true
  }
  return false
}
/**
 * @description: 触发编辑器返回导航
 * @return {Promise<void>} 导航完成后结束
 */
async function navigateBack(): Promise<void> {
  // 路由守卫是离开确认的唯一入口，避免按钮先询问一次、导航时再询问一次。
  await leaveWithoutNewHistory()
}
/** 保存当前工程，成功后关闭编辑器。 */
async function saveAndClose(): Promise<void> {
  if (!(await save())) return
  await leaveWithoutNewHistory()
}
function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasChanges.value) return
  writeDraft()
  event.preventDefault()
  event.returnValue = ''
}

/** 把独立窗口使用的界面状态收敛为一次完整快照。 */
function createWindowPresentation() {
  const current = state.value
  if (!current) return undefined
  return {
    state: serializeMidiProjectEditorState(current),
    labels: labels.value,
    locale: locale.value,
    transport: playback.transport.value,
    showVelocity: showVelocity.value,
    dimUnplayable: dimUnplayable.value,
    playablePitches: playablePitches.value ? [...playablePitches.value] : [],
    currentTemplateId: settingsStore.currentTemplateId,
    templates: settingsStore.templates.map(({ id, name }) => ({ id, name })),
    saving: saving.value,
    hasChanges: hasChanges.value,
  }
}

/** 当前项目在主窗口中的编辑路由。 */
function currentEditorRoute() {
  const current = state.value
  if (persisted.value && current) {
    return { name: 'midi-editor-edit' as const, params: { id: current.project.id } }
  }
  return { name: 'midi-editor-create' as const }
}

/** 还原时先激活主窗口编辑页；窗口会在页面接管视口后销毁。 */
async function restoreEditorPage(): Promise<void> {
  workspaceRestore.value = latestViewport.value
  const target = currentEditorRoute()
  const alreadyEditing =
    route.name === target.name &&
    (target.name !== 'midi-editor-edit' || route.params.id === target.params.id)
  if (!alreadyEditing) await router.push(target)
  await nextTick()
}

async function exitDetachedEditor(mode: 'save' | 'discard'): Promise<void> {
  if (mode === 'save' && !(await save())) return
  if (mode === 'discard') {
    await projectStore.deleteDraft(currentDraftKey.value).catch(() => {})
    draftLoaded.value = false
  }
  playback.stop()
  endingDetachedEditor = true
  try {
    await editorWindow?.close()
    if (route.name === 'midi-editor-create' || route.name === 'midi-editor-edit') {
      await leaveWithoutNewHistory()
    }
  } finally {
    endingDetachedEditor = false
  }
}

function handleEditorWindowCommand(command: MidiProjectEditorRequest): void {
  switch (command.kind) {
    case 'dispatch':
      dispatch(command.action)
      break
    case 'playback-position':
      if (Number.isFinite(command.seconds)) playback.seek(command.seconds)
      break
    case 'prepare-playback':
      playerStore.pausePreviewPlayback()
      break
    case 'viewport':
      latestViewport.value = command.viewport
      break
    case 'view-option':
      if (command.option === 'showVelocity') showVelocity.value = command.value
      else dimUnplayable.value = command.value
      break
    case 'select-template':
      void selectKeyTemplate(command.templateId)
      break
    case 'save':
      void save()
      break
    case 'export':
      void exportMidi()
      break
    case 'exit':
      void exitDetachedEditor(command.mode)
      break
  }
}

function setEditorWindowStatus(status: 'docked' | 'opening' | 'detached'): void {
  const previous = editorWindowStatus.value
  editorWindowStatus.value = status
  mainWindowUi.setDetachedMidiEditorStatus(status)
  if (status === 'detached') uninstallEditorShortcuts()
  else if (status === 'docked') installEditorShortcuts()
  // 系统关闭或渲染进程异常时也回到主编辑页，避免会话被缓存页面清理掉。
  if (status === 'docked' && previous !== 'docked' && !endingDetachedEditor) {
    void restoreEditorPage()
  }
}

function reportEditorWindowError(error: unknown): void {
  toast.error(t('midiEditor.windowFailed', { error: String(error) }), { richColors: true })
}

async function openDetachedEditor(): Promise<void> {
  const current = state.value
  if (!current || !editorWindow) return
  latestViewport.value = workspace.value?.getState() ?? latestViewport.value
  workspaceRestore.value = latestViewport.value
  // 音频调度迁移到获得焦点的独立 WebView；主窗口只保留当前位置，不再后台排程。
  playback.pause()
  mainWindowUi.registerDetachedMidiEditor(current.project.id, () => editorWindow?.focus() ?? Promise.resolve())
  await editorWindow.open()
}

async function restoreDetachedEditor(): Promise<void> {
  await editorWindow?.restore()
}

async function focusDetachedEditor(): Promise<void> {
  await editorWindow?.focus()
}

onBeforeRouteLeave(async (to) => {
  // 新建保存后 replace 到编辑路由属于同一页面，不触发守卫。
  if (to.name === 'midi-editor-edit' && state.value?.project.id === to.params.id) return true
  // 独立窗口持有可见编辑界面时，主窗口导航只停用并缓存本页。
  if (editorWindowStatus.value !== 'docked') return true
  const allowed = await confirmLeaveIfNeeded()
  if (allowed) playback.stop()
  return allowed
})

watch(
  () => [route.name, route.params.id, route.query.from, route.query.fromProject] as const,
  ([name, id]) => {
    if (name !== 'midi-editor-create' && name !== 'midi-editor-edit') return
    const targetsCurrentProject =
      (name === 'midi-editor-edit' && state.value?.project.id === id) ||
      (name === 'midi-editor-create' && !persisted.value)
    if (editorWindowStatus.value !== 'docked') {
      if (!targetsCurrentProject) {
        void editorWindow?.focus()
        void router.replace(
          freshMainPageLocation({ name: 'midi-editor' }, { replace: true })
        )
      }
      // 独立窗口仍持有当前会话。还原过程中只切回对应路由，不能把无来源参数的
      // midi-editor-create 当成一次新建请求，否则会覆盖尚未落盘的项目状态。
      return
    }
    if (name === 'midi-editor-edit' && state.value?.project.id === id) return
    void loadFromRoute()
  }
)

watch(
  [
    state,
    labels,
    () => locale.value,
    showVelocity,
    dimUnplayable,
    playablePitches,
    () => settingsStore.currentTemplateId,
    () => settingsStore.templates,
    saving,
    hasChanges,
  ],
  () => {
    if (state.value) editorWindow?.updateState()
  }
)

onMounted(() => {
  editorWindow = new MidiProjectEditorWindowSession({
    port: editorWindowPort,
    presentation: createWindowPresentation,
    viewport: () => latestViewport.value,
    onCommand: handleEditorWindowCommand,
    onDock: restoreEditorPage,
    onStatus: setEditorWindowStatus,
    onError: reportEditorWindowError,
  })
  void loadFromRoute()
  window.addEventListener('beforeunload', handleBeforeUnload)
  draftTimer = window.setInterval(writeDraft, DRAFT_AUTOSAVE_INTERVAL_MS)
})
onActivated(() => {
  pageActive = true
  installEditorShortcuts()
})
onDeactivated(() => {
  pageActive = false
  uninstallEditorShortcuts()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (draftTimer !== null) window.clearInterval(draftTimer)
  choice.value.resolve?.('cancel')
  void editorWindow?.close()
  editorWindow = null
  disposeEditor()
})
</script>

<template>
  <ConfigProvider
    v-bind="midiEditorConfigProviderProps"
    :tooltip="{ styles: { root: { pointerEvents: 'none' } } }"
  >
    <section class="midi-editor-page">
      <header class="midi-editor-header">
        <div class="editor-project-identity">
          <Input
            v-if="state"
            class="midi-editor-name"
            size="small"
            variant="outlined"
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
        <EditorToolbar
          v-if="state"
          :show-velocity="showVelocity"
          :dim-unplayable="dimUnplayable"
          :current-template-id="settingsStore.currentTemplateId"
          :templates="settingsStore.templates"
          :state="state"
          :is-playing="playback.isPlaying.value"
          @update:show-velocity="showVelocity = $event"
          @update:dim-unplayable="dimUnplayable = $event"
          @select-template="selectKeyTemplate"
          @dispatch="dispatch"
          @play="playback.play()"
          @pause="playback.pause()"
          @stop="playback.stop()"
          @set-bpm="setBpm"
          @set-meter="setMeter"
        />
        <EditorProjectActions
          :saving="saving"
          :disabled="!state"
          @save="save"
          @export="exportMidi"
          @close="navigateBack"
          @save-and-close="saveAndClose"
        />
      </header>

      <section v-if="loadError" class="midi-editor-missing">
        <span>{{ loadError }}</span>
        <Button @click="leaveWithoutNewHistory">
          {{ t('midiEditor.projectList') }}
        </Button>
      </section>

      <template v-else-if="state && editor">
        <MidiEditorWorkspace
          v-if="editorWindowStatus !== 'detached'"
          ref="workspace"
          :state="state"
          :transport="playback.transport.value"
          :labels="labels"
          :show-velocity="showVelocity"
          :dim-unplayable="dimUnplayable"
          :playable-pitches="playablePitches"
          :opening="editorWindowStatus === 'opening'"
          :restore="workspaceRestore"
          @dispatch="dispatch"
          @seek="playback.seek"
          @audition="playback.audition"
          @remove-track="removeTrack"
          @state-change="rememberWorkspace"
          @migrate="openDetachedEditor"
        />

        <section v-else class="detached-editor-placeholder">
          <ExternalLink class="size-8 text-primary" :stroke-width="1.8" />
          <span>{{ t('midiEditor.windowOpen') }}</span>
          <div class="flex items-center gap-2">
            <Button size="small" @click="focusDetachedEditor">
              {{ t('midiEditor.focusWindow') }}
            </Button>
            <Button type="primary" size="small" @click="restoreDetachedEditor">
              {{ t('midiEditor.restoreWindow') }}
            </Button>
          </div>
        </section>
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
  @apply flex shrink-0 items-center gap-2 border-b border-primary/10 px-3 py-2;
}

/* 输入与按钮来自多根组件，尺寸样式通过容器的 deep 选择器稳定作用于最终 DOM。 */
.editor-project-identity { @apply flex min-w-0 shrink items-center gap-2; width: min(240px, 24vw); }
.editor-project-identity :deep(.midi-editor-name) { width: 100%; min-width: 0; font-weight: 600; }
.midi-editor-header > :deep(.editor-toolbar) { margin-right: auto; }
.editor-unsaved { @apply size-1.5 shrink-0 rounded-full bg-primary; }

.midi-editor-missing {
  @apply flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm;
  color: var(--color-muted-dark);
}

.detached-editor-placeholder {
  @apply flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm;
  color: var(--color-muted-dark);
}
</style>
