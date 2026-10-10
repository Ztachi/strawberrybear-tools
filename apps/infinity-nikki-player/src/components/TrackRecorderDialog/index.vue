<script setup lang="ts">
/** 独立单轨录制工作区：输入快照、本地编辑、草稿和最终结果均在此会话边界内。 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Alert, Button, ConfigProvider, Drawer, Splitter, SplitterPanel, Tooltip } from 'antdv-next'
import { CircleHelp } from 'lucide-vue-next'
import PianoRoll from '@strawberrybear/piano-roll'
import { clipNoteToTrackRegion, createTimeline } from '@strawberrybear/piano-roll/core'
import type { EditorAction, MidiProject } from '@strawberrybear/midi-editor'
import KeyboardPreview from '@/components/KeyboardPreview/index.vue'
import PlayerSongTitle from '@/components/PlayerSongTitle.vue'
import { usePianoRollLabels } from '@/components/PianoWorkspace/usePianoRollLabels'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { TrackRecorder } from '@/features/midi-recording/controller'
import type { TrackRecorderInput, TrackRecorderServices } from '@/features/midi-recording/types'
import { recorderDraftKey } from '@/features/midi-recording/coordinator'
import { createMidiDraftWriter } from '@/features/midi-editor/draftWriter'
import { createMidiEditorPlaybackController } from '@/features/midi-editor/playbackController'
import { recordingBarToTick, recordingRangeInBars } from '@/features/midi-recording/range'
import { mappingKeyToCode, normalizeMappingKeyFromEvent } from '@/lib/templateKeys'
import { getContentDrawerRootStyle, getMainWindowPopupContainer, midiEditorPianoRollTheme } from '@/theme/infinityNikkiTheme'
import PianoRollControls from '@/components/PianoRollControls.vue'
import PianoRollFollowButton from '@/components/PianoRollFollowButton.vue'
import EditorChoiceModal from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/EditorChoiceModal.vue'
import RecorderSettings from './components/RecorderSettings.vue'
import RecorderTransport from './components/RecorderTransport.vue'
import RecorderHelpDialog from './components/RecorderHelpDialog.vue'

const props = defineProps<{ input: TrackRecorderInput; services: TrackRecorderServices }>()
const emit = defineEmits<{ closed: [] }>()
const { t } = useI18n()
const recorder = new TrackRecorder(props.input, props.services.audio)
const version = ref(0)
const localState = shallowRef(recorder.preview())
const keyboard = ref<HTMLElement | null>(null)
const scrollBody = ref<HTMLElement | null>(null)
const roll = ref<InstanceType<typeof PianoRoll> | null>(null)
const loadingDraft = ref(true)
const applying = ref(false)
const error = ref('')
const recovery = shallowRef<MidiProject | null>(null)
const recoveryConflict = ref(false)
const closeChoice = ref(false)
const helpOpen = ref(false)
const replaying = ref(false)
const previewKeys = shallowRef<ReadonlySet<string>>(new Set())
const labels = usePianoRollLabels()
const scrollRegistration = useMainWindowUiStore().registerBackToTop(() => scrollBody.value?.scrollTo({ top: 0, behavior: 'smooth' }))
let draftKey = ''
let draftStamp = ''
let disposed = false
let finalized = false
const accepted = ref(false)
let frameHandle = 0
let paintAt = 0
let draftTimer: ReturnType<typeof setInterval> | undefined
const draftWriter = createMidiDraftWriter(props.services.saveDraft)
function refresh(): void { version.value++; localState.value = recorder.preview() }
const unsubscribe = recorder.subscribe(refresh)
const ui = computed(() => { void version.value; return { busy: recorder.busy, status: recorder.status, dirty: recorder.dirty } })
const currentTrack = computed(() => localState.value.document.tracks.find(track => track.id === props.input.trackId)!)
const position = computed(() => { void version.value; const p = createTimeline(localState.value.document).tickToBarPosition(recorder.cursorTick); return `${p.bar}.${p.beat}` })
const pitches = computed(() => { void version.value; return new Set(recorder.template.mappings.map(m => m.pitch)) })
const mapping = computed(() => { void version.value; return new Map(recorder.template.mappings.map(m => [mappingKeyToCode(m.key), m.pitch])) })
const active = computed(() => { void version.value; return new Set([...recorder.activeKeys().map(mappingKeyToCode), ...previewKeys.value]) })
const locked = computed(() => accepted.value || applying.value || loadingDraft.value || !!recovery.value)
const editingLocked = computed(() => (ui.value.busy && ui.value.status !== 'paused') || locked.value)
// 暂停的录音尚未进入历史；撤销会先收尾，而重做需等本次录音结束。
const pendingTake = computed(() => ui.value.busy && localState.value.document !== recorder.editor.getState().document)
const canUndo = computed(() => localState.value.canUndo || (ui.value.status === 'paused' && pendingTake.value))
const canRedo = computed(() => localState.value.canRedo && !pendingTake.value)
const noteCount = computed(() => localState.value.document.notes.filter(note => note.trackId === props.input.trackId && clipNoteToTrackRegion(note, currentTrack.value)).length)
const canStart = computed(() => { void version.value; return mapping.value.size > 0 && (recorder.mode !== 'replace' || !!recorder.range) })
// 复用卷帘的状态投影和范围高亮，不安装第二套音符编辑手势。
const editing = computed(() => ({ enabled: false, tool: 'select' as const, snapTicks: (tick: number) => tick, defaultDurationTicks: localState.value.document.ticksPerBeat, selectedNoteIds: localState.value.selection, highlightPitches: pitches.value, loop: recorder.mode === 'replace' ? recorder.range ?? null : null }))
const documentView = computed(() => ({ ...localState.value.document, durationTicks: Math.max(localState.value.document.durationTicks, recorder.cursorTick + localState.value.document.ticksPerBeat * 4) }))
const transport = shallowRef({ positionSeconds: 0, isPlaying: false, playbackRate: 1 })
const createPlayback = inject('track-recorder-playback-factory', createMidiEditorPlaybackController)
const replay = createPlayback({ getDocument: () => localState.value.document, getLoop: () => recorder.mode === 'replace' ? recorder.range : null, onChange: state => {
  // 暂停和试听结束时同步显示位置；显式停止提前清除标记，不覆盖录制游标。
  if (replaying.value && !state.isPlaying) {
    recorder.cursorTick = Math.round(createTimeline(localState.value.document).secondsToTick(state.positionSeconds)); refresh()
  }
  replaying.value = state.isPlaying
} })
/** 显式结束试听保留录制游标，避免循环区间的起点回调覆盖定位。 */
function stopPreview(): void { replaying.value = false; replay.stop(); previewKeys.value = new Set() }
/** 试听调度器缓存文档与循环范围；录入提交及历史操作后需要显式同步。 */
function syncReplay(): void { replay.setLoop(recorder.mode === 'replace' ? recorder.range : null); replay.invalidate() }
function dispatch(action: EditorAction): void { if (editingLocked.value) return; stopPreview(); recorder.dispatch(action); syncReplay(); refresh() }
function showError(cause: unknown): void { error.value = `${t('recording.operationFailed')} ${String(cause)}` }
async function begin(resume = false): Promise<void> {
  if (locked.value || (!resume && !canStart.value)) return
  error.value = ''; stopPreview()
  try { await (resume ? recorder.resume() : recorder.start()); await nextTick(); keyboard.value?.focus() } catch (cause) { showError(cause) }
}
function stop(): void { recorder.stop(); stopPreview(); syncReplay(); replay.stop(); refresh() }
async function play(): Promise<void> {
  if (locked.value || ui.value.busy) return
  recorder.releaseAll()
  if (replaying.value) { replay.pause(); return }
  syncReplay()
  try { await replay.play() } catch (cause) { showError(cause) }
}
function seek(seconds: number): void {
  if (ui.value.busy || applying.value || accepted.value || recovery.value || loadingDraft.value) return
  recorder.cursorTick = Math.max(currentTrack.value.startTick ?? 0, Math.round(createTimeline(localState.value.document).secondsToTick(seconds)))
  replay.seek(seconds); refresh()
}
/** 录制方式切换收尾暂停的录音，重录范围统一为设置中展示的小节边界。 */
function changeMode(mode: TrackRecorder['mode']): void {
  if (editingLocked.value) return
  stopPreview()
  const doc = localState.value.document
  const bars = recordingRangeInBars(doc, recorder.range ?? { startTick: recorder.cursorTick, endTick: recorder.cursorTick + 1 })
  const range = mode === 'replace' ? {
    startTick: Math.max(currentTrack.value.startTick ?? 0, recordingBarToTick(doc, bars.start)),
    endTick: recordingBarToTick(doc, bars.end),
  } : undefined
  recorder.configureMode(mode, range)
  syncReplay(); replay.stop()
  refresh()
}
/** 小节设置只调整本地重录范围，沿用完整变拍号时间轴。 */
function changeRange(range: { start: number; end: number }): void {
  if (editingLocked.value || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) return
  stopPreview()
  const doc = localState.value.document
  const startTick = Math.max(currentTrack.value.startTick ?? 0, recordingBarToTick(doc, range.start))
  const endTick = recordingBarToTick(doc, range.end)
  if (endTick <= startTick) return
  recorder.configureMode('replace', { startTick, endTick }); syncReplay(); replay.stop(); refresh()
}
function toggleRecording(): void {
  if (locked.value) return
  if (!ui.value.busy) void begin()
  else if (ui.value.status === 'paused') void begin(true)
  else pauseForFocus()
}
function rewind(): void {
  if (locked.value || ui.value.busy) return
  stopPreview(); seek(createTimeline(localState.value.document).tickToSeconds(currentTrack.value.startTick ?? 0))
}
function pointerPress(code: string, source: string): void {
  const key = recorder.template.mappings.find(m => mappingKeyToCode(m.key) === code)?.key
  if (key && !accepted.value && !loadingDraft.value && !recovery.value && !applying.value) {
    if (recorder.busy) recorder.press(key, source)
    else void recorder.auditionPress(key, source).catch(showError)
  }
  keyboard.value?.focus()
}
function handleKeydown(event: KeyboardEvent): void {
  // 框架弹层可能在同一个 window 上先消费按键，关闭后的状态不能代替事件判定。
  if (event.defaultPrevented || accepted.value || applying.value || loadingDraft.value || recovery.value || closeChoice.value || helpOpen.value || event.isComposing) return
  const target = event.target as HTMLElement | null
  // 弹框内的输入由框架处理；关闭事件同步更新状态后，仍按事件来源隔离背景快捷键。
  if (target?.closest('.ant-modal, input, textarea, [contenteditable="true"], [role="combobox"], [role="menu"], [role="listbox"]')) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (ui.value.busy) stop(); else void close(); return }
  // 录制快捷键优先于映射分支；组合键不会占用可演奏的普通 Enter、Z、Space。
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    if (event.repeat) return
    const key = event.key.toLowerCase()
    if (key === 'enter') { event.preventDefault(); event.stopPropagation(); toggleRecording(); return }
    if (key === 'z' || key === 'y') {
      event.preventDefault(); event.stopPropagation()
      const redo = key === 'y' || event.shiftKey
      if (!editingLocked.value && (redo ? canRedo.value : canUndo.value)) dispatch({ type: redo ? 'redo' : 'undo' })
      return
    }
  }
  if (keyboard.value?.contains(target)) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const key = normalizeMappingKeyFromEvent(event)
    if (!key || !recorder.template.mappings.some(m => m.key.toUpperCase() === key)) return
    event.preventDefault(); event.stopPropagation()
    if (recorder.busy) recorder.press(key, `keyboard:${event.code}`)
    else void recorder.auditionPress(key, `keyboard:${event.code}`).catch(showError)
    return
  }
}
function handleKeyup(event: KeyboardEvent): void { recorder.release(`keyboard:${event.code}`) }
function pauseForFocus(): void { recorder.pause(); replay.pause(); previewKeys.value = new Set(); refresh() }
function openHelp(): void { pauseForFocus(); helpOpen.value = true }
function visibility(): void { if (document.hidden) pauseForFocus() }
function beforeUnload(): void { pauseForFocus(); void checkpoint().catch(() => {}) }
async function checkpoint(final = false): Promise<void> {
  if ((!final && applying.value) || accepted.value || !draftKey || !ui.value.dirty || recovery.value || loadingDraft.value || disposed) return
  const project = recorder.checkpoint()
  const stamp = JSON.stringify(project)
  if (stamp === draftStamp) return
  await draftWriter.write(draftKey, project); draftStamp = stamp
}
async function apply(): Promise<void> {
  if (applying.value) return
  stop(); applying.value = true; error.value = ''
  try {
    await checkpoint(true); await draftWriter.flush()
    if (!accepted.value) { await props.services.apply(recorder.result()); accepted.value = true; finalized = true }
    await props.services.deleteDraft(draftKey)
    finalized = true; emit('closed')
  } catch (cause) { showError(cause) } finally { applying.value = false }
}
async function discard(): Promise<void> {
  if (applying.value) return
  applying.value = true
  try { await draftWriter.flush().catch(() => {}); await props.services.deleteDraft(draftKey); finalized = true; emit('closed') } catch (cause) { showError(cause) } finally { applying.value = false }
}
async function close(): Promise<void> {
  if (applying.value) return
  stop(); recorder.releaseAll()
  if (accepted.value) { await discard(); return }
  if (ui.value.dirty) closeChoice.value = true
  else emit('closed')
}
async function recoverCopy(): Promise<void> {
  if (applying.value) return
  if (accepted.value) { await discard(); return }
  stop(); applying.value = true
  try { await draftWriter.flush().catch(() => {}); await props.services.recoverCopy(recovery.value ?? recorder.checkpoint()); accepted.value = true; finalized = true; await props.services.deleteDraft(draftKey); finalized = true; emit('closed') } catch (cause) { showError(cause) } finally { applying.value = false }
}
function recover(): void {
  if (!recovery.value || recoveryConflict.value) return
  recorder.restoreDraft(recovery.value); recovery.value = null; syncReplay(); replay.stop(); refresh()
}
function frame(time: number): void {
  if (disposed) return
  recorder.advance()
  if (recorder.status === 'recording' && time - paintAt > 60) { refresh(); paintAt = time }
  const positionSeconds = replaying.value ? replay.getState().positionSeconds : createTimeline(localState.value.document).tickToSeconds(recorder.cursorTick)
  const audiblePitches = new Set(replaying.value ? replay.getActivePitches() : [])
  previewKeys.value = new Set(recorder.template.mappings.filter(mapping => audiblePitches.has(mapping.pitch)).map(mapping => mappingKeyToCode(mapping.key)))
  transport.value = { positionSeconds, isPlaying: recorder.status === 'recording' || replaying.value, playbackRate: 1 }
  frameHandle = requestAnimationFrame(frame)
}
function onScroll(): void { scrollRegistration.setVisible((scrollBody.value?.scrollTop ?? 0) > 200) }
onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  window.addEventListener('blur', pauseForFocus)
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('visibilitychange', visibility)
  frameHandle = requestAnimationFrame(frame)
  try {
    draftKey = await recorderDraftKey(props.input.project.id, props.input.trackId)
    const draft = await props.services.loadDraft(draftKey)
    if (!disposed && draft) {
      recovery.value = draft
      const metadata = draft.extensions?.recordingDraft as { baseRevision?: string } | undefined
      recoveryConflict.value = metadata?.baseRevision !== props.input.baseRevision
    }
  } catch (cause) { showError(cause) } finally { loadingDraft.value = false }
  draftTimer = setInterval(() => void checkpoint().catch(showError), 1000)
})
onBeforeUnmount(() => {
  if (!finalized) void checkpoint().catch(() => {})
  disposed = true; unsubscribe(); recorder.dispose(); replay.dispose(); scrollRegistration()
  clearInterval(draftTimer); cancelAnimationFrame(frameHandle)
  window.removeEventListener('keydown', handleKeydown); window.removeEventListener('keyup', handleKeyup); window.removeEventListener('blur', pauseForFocus); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', visibility)
})
defineExpose({ close, checkpoint, pause: pauseForFocus })
</script>

<template>
  <ConfigProvider :get-popup-container="getMainWindowPopupContainer">
    <Drawer
      :open="true"
      placement="right"
      :title="currentTrack.name"
      :get-container="getMainWindowPopupContainer"
      :root-style="getContentDrawerRootStyle()"
      :styles="{ wrapper: { width: '100%' }, header: { padding: '10px 12px' }, title: { flex: '0 1 200px', maxWidth: '22vw', minWidth: 0, marginInlineEnd: '12px' }, extra: { flex: '1 1 auto', minWidth: 'min-content' }, body: { padding: 0, overflow: 'hidden', minHeight: 0 } }"
      :mask="{ closable: false }"
      :keyboard="false"
      :closable="{ placement: 'end', disabled: applying }"
      root-class="track-recorder-drawer"
      @close="close"
    >
      <template #title>
        <PlayerSongTitle
          :title="currentTrack.name"
          :media-id="input.trackId"
          class="recorder-track-name"
        />
      </template>
      <template #extra>
        <div class="recorder-toolbar flex min-w-0 items-center gap-2 font-normal">
          <RecorderTransport
            class="min-w-[432px] flex-1"
            :status="ui.status"
            :busy="ui.busy"
            :locked="locked"
            :editing-locked="editingLocked"
            :can-start="canStart"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :has-notes="noteCount > 0"
            :replaying="replaying"
            :position="position"
            :note-count="noteCount"
            @record="toggleRecording"
            @stop="stop"
            @preview="play"
            @rewind="rewind"
            @undo="dispatch({ type: 'undo' })"
            @redo="dispatch({ type: 'redo' })"
          >
            <template #settings>
              <RecorderSettings
                :recorder="recorder"
                :version="version"
                :templates="input.templates"
                :disabled="locked"
                @change="stopPreview(); refresh()"
                @mode="changeMode"
                @range="changeRange"
                @setting="recorder[$event.key] = $event.value; refresh()"
              />
            </template>
          </RecorderTransport>
          <Tooltip :title="t('recording.help')">
            <Button type="text" size="small" :aria-label="t('recording.help')" @click="openHelp">
              <template #icon>
                <CircleHelp class="size-4" :stroke-width="2" />
              </template>
            </Button>
          </Tooltip>
        </div>
      </template>
      <div class="track-recorder-workspace relative flex h-full min-h-0 flex-col">
        <div
          ref="scrollBody"
          class="recorder-content-scroll min-h-0 flex-1 overflow-y-auto"
          @scroll="onScroll"
        >
          <div class="flex h-full min-h-[560px] flex-col gap-2 p-3">
            <Alert v-if="error" type="error" show-icon :message="error" class="shrink-0" />
            <Alert
              v-if="recovery"
              type="warning"
              show-icon
              class="shrink-0"
              :message="t(recoveryConflict ? 'recording.draftConflict' : 'recording.draftFound')"
            >
              <template #description>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Button v-if="!recoveryConflict" :disabled="applying" @click="recover">
                    {{ t('recording.recover') }}
                  </Button>
                  <Button :disabled="applying" @click="recoverCopy">
                    {{ t('recording.recoverCopy') }}
                  </Button>
                  <Button
                    :disabled="applying"
                    @click="services.deleteDraft(draftKey).then(() => recovery = null).catch(showError)"
                  >
                    {{ t('recording.discardDraft') }}
                  </Button>
                </div>
              </template>
            </Alert>
            <Splitter orientation="vertical" class="min-h-[536px] flex-1">
              <SplitterPanel :default-size="180" :min="120" max="60%">
                <div
                  ref="keyboard"
                  tabindex="0"
                  :inert="locked"
                  :aria-label="t('recording.keyboard')"
                  class="h-full min-h-0 rounded-lg outline-none focus:ring-2 focus:ring-primary"
                  @focusout="recorder.releaseAll()"
                >
                  <KeyboardPreview
                    recording-style
                    mapped-rows-only
                    hold-interaction
                    :key-code-to-pitch="mapping"
                    :active-keys="active"
                    @key-press="pointerPress"
                    @key-release="recorder.release($event)"
                  />
                </div>
              </SplitterPanel>
              <SplitterPanel :min="280">
                <PianoRoll
                  ref="roll"
                  variant="editor"
                  :document="documentView"
                  :transport="transport"
                  :selected-track-id="input.trackId"
                  :show-other-tracks="false"
                  :show-toolbar-controls="false"
                  :labels="labels"
                  :theme="midiEditorPianoRollTheme"
                  :editing="editing"
                  @seek="seek"
                >
                  <template #title>
                    {{ t('recording.previewTitle') }}
                  </template>
                  <template #toolbar="{ view, viewport }">
                    <PianoRollFollowButton :view="view" :viewport="viewport" :labels="labels" />
                    <PianoRollControls :view="view" :viewport="viewport" :labels="labels" />
                  </template>
                </PianoRoll>
              </SplitterPanel>
            </Splitter>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <Button :disabled="applying" :aria-label="t('actions.cancel')" @click="close">
            {{ t('actions.cancel') }}
          </Button>
          <Button v-if="error && ui.dirty" :disabled="applying" @click="recoverCopy">
            {{ t('recording.recoverCopy') }}
          </Button>
          <Button
            type="primary"
            :loading="applying"
            :disabled="loadingDraft || !!recovery || !ui.dirty"
            @click="apply"
          >
            {{ t('recording.apply') }}
          </Button>
        </div>
      </template>
      <EditorChoiceModal
        :open="closeChoice"
        :title="t('recording.closeTitle')"
        :description="t('recording.closeDescription')"
        :options="[{ key: 'continue', label: t('recording.continueEditing'), primary: true }, { key: 'discard', label: t('recording.discard'), danger: true }, { key: 'apply', label: t('recording.applyClose') }]"
        @choose="closeChoice = false; $event === 'apply' ? apply() : $event === 'discard' ? discard() : undefined"
      />
      <RecorderHelpDialog v-model:open="helpOpen" />
    </Drawer>
  </ConfigProvider>
</template>
