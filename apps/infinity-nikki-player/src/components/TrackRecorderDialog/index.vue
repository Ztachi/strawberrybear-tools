<script setup lang="ts">
/** 独立单轨录制工作区：输入快照、本地编辑、草稿和最终结果均在此会话边界内。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Alert, Button, ConfigProvider, Modal, Select, Tooltip } from 'antdv-next'
import { Circle, Pause, Play, Square, Undo2, Redo2 } from 'lucide-vue-next'
import PianoRoll from '@strawberrybear/piano-roll'
import { clipNoteToTrackRegion, createTimeline } from '@strawberrybear/piano-roll/core'
import { resolutionTicks, snapTick, type EditorAction, type MidiProject, type SnapResolution } from '@strawberrybear/midi-editor'
import type { PianoRollEditIntent } from '@strawberrybear/piano-roll/browser'
import KeyboardPreview from '@/components/KeyboardPreview/index.vue'
import { usePianoRollLabels } from '@/components/PianoWorkspace/usePianoRollLabels'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { TrackRecorder } from '@/features/midi-recording/controller'
import type { TrackRecorderInput, TrackRecorderServices } from '@/features/midi-recording/types'
import { recorderDraftKey } from '@/features/midi-recording/coordinator'
import { checkRecordingPlayback } from '@/features/midi-recording/preflight'
import { createMidiDraftWriter } from '@/features/midi-editor/draftWriter'
import { createMidiEditorPlaybackController } from '@/features/midi-editor/playbackController'
import { MidiEditorShortcutController } from '@/features/midi-editor/shortcutController'
import { mappingKeyToCode, normalizeMappingKeyFromEvent } from '@/lib/templateKeys'
import { midiEditorPianoRollTheme } from '@/theme/infinityNikkiTheme'
import NoteContextMenu, { type NoteContextMenuTarget } from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/NoteContextMenu.vue'
import NoteInspector from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/NoteInspector.vue'
import EditorChoiceModal from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/EditorChoiceModal.vue'
import RecorderSettings from './components/RecorderSettings.vue'

const props = defineProps<{ input: TrackRecorderInput; services: TrackRecorderServices }>()
const emit = defineEmits<{ closed: [] }>()
const { t } = useI18n()
const recorder = new TrackRecorder(props.input, props.services.audio)
const version = ref(0)
const localState = shallowRef(recorder.preview())
const keyboard = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
const roll = ref<InstanceType<typeof PianoRoll> | null>(null)
const context = shallowRef<NoteContextMenuTarget | null>(null)
const loadingDraft = ref(true)
const applying = ref(false)
const error = ref('')
const recovery = shallowRef<MidiProject | null>(null)
const recoveryConflict = ref(false)
const closeChoice = ref(false)
const replaying = ref(false)
const labels = usePianoRollLabels()
const scrollRegistration = useMainWindowUiStore().registerBackToTop(() => root.value?.scrollTo({ top: 0, behavior: 'smooth' }))
let draftKey = ''
let draftStamp = ''
let disposed = false
let finalized = false
const accepted = ref(false)
let frameHandle = 0
let paintAt = 0
let draftTimer: ReturnType<typeof setInterval> | undefined
const draftWriter = createMidiDraftWriter(props.services.saveDraft)
const popupContainer = () => root.value ?? document.body
function refresh(): void { version.value++; localState.value = recorder.preview() }
const unsubscribe = recorder.subscribe(refresh)
const ui = computed(() => { void version.value; return { busy: recorder.busy, status: recorder.status, dirty: recorder.dirty } })
const currentTrack = computed(() => localState.value.document.tracks.find(track => track.id === props.input.trackId)!)
const position = computed(() => { void version.value; const p = createTimeline(localState.value.document).tickToBarPosition(recorder.cursorTick); return `${p.bar}.${p.beat}` })
const pitches = computed(() => { void version.value; return new Set(recorder.template.mappings.map(m => m.pitch)) })
const mapping = computed(() => { void version.value; return new Map(recorder.template.mappings.map(m => [mappingKeyToCode(m.key), m.pitch])) })
const active = computed(() => { void version.value; return new Set(recorder.activeKeys().map(mappingKeyToCode)) })
const preflight = computed(() => { void version.value; return checkRecordingPlayback(localState.value.document, recorder.template, props.input.fps ?? 60, props.input.speed ?? 1) })
const editingLocked = computed(() => (ui.value.busy && ui.value.status !== 'paused') || accepted.value || applying.value || loadingDraft.value || !!recovery.value)
const editing = computed(() => ({ enabled: !editingLocked.value, tool: localState.value.tool, selectedNoteIds: localState.value.selection, snapTicks: (tick: number, mode: 'nearest' | 'floor') => snapTick(tick, localState.value.snap, localState.value.document, mode), gridTicks: resolutionTicks(localState.value.snap, localState.value.document) || undefined, defaultDurationTicks: localState.value.document.ticksPerBeat, highlightPitches: pitches.value, loop: recorder.range ?? null }))
const documentView = computed(() => ({ ...localState.value.document, durationTicks: Math.max(localState.value.document.durationTicks, recorder.cursorTick + localState.value.document.ticksPerBeat * 4) }))
const transport = shallowRef({ positionSeconds: 0, isPlaying: false, playbackRate: 1 })
const replay = createMidiEditorPlaybackController({ getDocument: () => localState.value.document, getLoop: () => recorder.range, onChange: state => { replaying.value = state.isPlaying } })
const shortcuts = new MidiEditorShortcutController({ state: () => localState.value, positionSeconds: () => createTimeline(localState.value.document).tickToSeconds(recorder.cursorTick), dispatch, save: () => {}, togglePlayback: () => void play() })
function dispatch(action: EditorAction): void { if (accepted.value || applying.value || loadingDraft.value || recovery.value) return; replay.stop(); recorder.dispatch(action); refresh() }
function handleIntent(intent: PianoRollEditIntent): void {
  if (intent.type === 'context-menu') context.value = intent
  else if (intent.type === 'audition') void replay.audition(intent.pitch, intent.velocity, intent.durationSeconds).catch(showError)
  else dispatch(intent)
}
function showError(cause: unknown): void { error.value = `${t('recording.operationFailed')} ${String(cause)}` }
async function begin(resume = false): Promise<void> {
  error.value = ''; replay.stop()
  try { await (resume ? recorder.resume() : recorder.start()); await nextTick(); keyboard.value?.focus() } catch (cause) { showError(cause) }
}
function stop(): void { recorder.stop(); refresh() }
async function play(): Promise<void> {
  recorder.releaseAll()
  if (replaying.value) { replay.pause(); return }
  try { await replay.play() } catch (cause) { showError(cause) }
}
function seek(seconds: number): void {
  if (ui.value.busy || applying.value || accepted.value || recovery.value || loadingDraft.value) return
  recorder.cursorTick = Math.max(currentTrack.value.startTick ?? 0, Math.round(createTimeline(localState.value.document).secondsToTick(seconds)))
  replay.seek(seconds); refresh()
}
function rangeFromSelection(): void {
  if (editingLocked.value) return
  const selected = localState.value.document.notes.flatMap(note => {
    const visible = note.trackId === props.input.trackId && localState.value.selection.has(note.id) ? clipNoteToTrackRegion(note, currentTrack.value) : null
    return visible ? [visible] : []
  })
  if (!selected.length) return
  recorder.configureMode('replace', { startTick: Math.min(...selected.map(n => n.startTick)), endTick: Math.max(...selected.map(n => n.endTick)) }); refresh()
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
  if (accepted.value || applying.value || loadingDraft.value || recovery.value || closeChoice.value || event.isComposing) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"], [role="combobox"], [role="menu"], [role="listbox"]')) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (ui.value.busy) stop(); else void close(); return }
  if (keyboard.value?.contains(target)) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const key = normalizeMappingKeyFromEvent(event)
    if (!key || !recorder.template.mappings.some(m => m.key.toUpperCase() === key)) return
    event.preventDefault(); event.stopPropagation()
    if (recorder.busy) recorder.press(key, `keyboard:${event.code}`)
    else void recorder.auditionPress(key, `keyboard:${event.code}`).catch(showError)
    return
  }
  if (!ui.value.busy && !target?.closest('button') && shortcuts.handle(event)) { event.preventDefault(); event.stopPropagation() }
}
function handleKeyup(event: KeyboardEvent): void { recorder.release(`keyboard:${event.code}`); shortcuts.end(event.key) }
function pauseForFocus(): void { recorder.pause(); refresh() }
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
  stop(); replay.stop(); applying.value = true; error.value = ''
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
  stop(); replay.stop(); recorder.releaseAll()
  if (accepted.value) { await discard(); return }
  if (ui.value.dirty) closeChoice.value = true
  else emit('closed')
}
async function recoverCopy(): Promise<void> {
  if (applying.value) return
  if (accepted.value) { await discard(); return }
  stop(); replay.stop(); applying.value = true
  try { await draftWriter.flush().catch(() => {}); await props.services.recoverCopy(recovery.value ?? recorder.checkpoint()); accepted.value = true; finalized = true; await props.services.deleteDraft(draftKey); finalized = true; emit('closed') } catch (cause) { showError(cause) } finally { applying.value = false }
}
function recover(): void {
  if (!recovery.value || recoveryConflict.value) return
  recorder.restoreDraft(recovery.value); recovery.value = null; refresh()
}
function frame(time: number): void {
  if (disposed) return
  recorder.advance()
  if (recorder.status === 'recording' && time - paintAt > 60) { refresh(); paintAt = time }
  const positionSeconds = replaying.value ? replay.getState().positionSeconds : createTimeline(localState.value.document).tickToSeconds(recorder.cursorTick)
  transport.value = { positionSeconds, isPlaying: recorder.status === 'recording' || replaying.value, playbackRate: 1 }
  frameHandle = requestAnimationFrame(frame)
}
function onScroll(): void { scrollRegistration.setVisible((root.value?.scrollTop ?? 0) > 200) }
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
  <Modal
    :open="true"
    :title="t('recording.title', { track: currentTrack.name })"
    :footer="null"
    width="min(1160px, calc(100vw - 32px))"
    centered
    :mask="{ closable: false }"
    :keyboard="false"
    :closable="!applying"
    @cancel="close"
  >
    <ConfigProvider :get-popup-container="popupContainer">
      <div
        ref="root"
        class="flex max-h-[calc(100vh-170px)] flex-col gap-3 overflow-y-auto"
        @scroll="onScroll"
      >
        <RecorderSettings
          :recorder="recorder"
          :version="version"
          :templates="input.templates"
          :position="position"
          :disabled="accepted || applying || loadingDraft || !!recovery"
          @change="replay.stop(); refresh()"
          @mode="recorder.configureMode($event); refresh()"
          @setting="recorder[$event.key] = $event.value; refresh()"
        />
        <Alert v-if="error" type="error" show-icon :message="error" />
        <Alert
          v-if="recovery"
          type="warning"
          show-icon
          :message="t(recoveryConflict ? 'recording.draftConflict' : 'recording.draftFound')"
        >
          <template #description>
            <div class="mt-2 flex gap-2">
              <Button v-if="!recoveryConflict" @click="recover">
                {{ t('recording.recover') }} </Button
              ><Button @click="recoverCopy">
                {{ t('recording.recoverCopy') }} </Button
              ><Button
                @click="services.deleteDraft(draftKey).then(() => recovery = null).catch(showError)"
              >
                {{ t('recording.discardDraft') }}
              </Button>
            </div>
          </template>
        </Alert>
        <div
          ref="keyboard"
          tabindex="0"
          class="rounded-lg outline-none focus:ring-2 focus:ring-primary"
          :aria-label="t('recording.keyboard')"
        >
          <KeyboardPreview
            recording-style
            hold-interaction
            :key-code-to-pitch="mapping"
            :active-keys="active"
            @key-press="pointerPress"
            @key-release="recorder.release($event)"
          />
        </div>
        <div
          class="flex flex-wrap items-center gap-2"
          :inert="accepted || applying || loadingDraft || !!recovery"
        >
          <Button
            v-if="!ui.busy"
            type="primary"
            :disabled="!mapping.size || accepted"
            @click="begin()"
          >
            <template #icon>
              <Circle class="size-4" :stroke-width="2" /> </template
            >{{ t('recording.start') }}
          </Button>
          <Button v-else-if="ui.status === 'paused'" type="primary" @click="begin(true)">
            <template #icon>
              <Play class="size-4" :stroke-width="2" /> </template
            >{{ t('recording.resume') }}
          </Button>
          <Button v-else :loading="ui.status === 'preparing'" @click="pauseForFocus">
            <template #icon>
              <Pause class="size-4" :stroke-width="2" /> </template
            >{{ t('recording.pause') }}
          </Button>
          <Button :disabled="!ui.busy" @click="stop">
            <template #icon>
              <Square class="size-4" :stroke-width="2" /> </template
            >{{ t('recording.stop') }}
          </Button>
          <Button :disabled="ui.busy || !localState.document.notes.length" @click="play">
            <template #icon>
              <Play class="size-4" :stroke-width="2" /> </template
            >{{ t(replaying ? 'recording.pausePreview' : 'recording.preview') }}
          </Button>
          <Tooltip :title="t('midiEditor.toolbar.undo')">
            <Button
              :disabled="editingLocked || !localState.canUndo"
              :aria-label="t('midiEditor.toolbar.undo')"
              @click="dispatch({ type: 'undo' })"
            >
              <template #icon>
                <Undo2 class="size-4" :stroke-width="2" />
              </template>
            </Button>
          </Tooltip>
          <Tooltip :title="t('midiEditor.toolbar.redo')">
            <Button
              :disabled="editingLocked || !localState.canRedo"
              :aria-label="t('midiEditor.toolbar.redo')"
              @click="dispatch({ type: 'redo' })"
            >
              <template #icon>
                <Redo2 class="size-4" :stroke-width="2" />
              </template>
            </Button>
          </Tooltip>
          <span
            role="status"
            class="text-sm text-muted-foreground"
            >{{ t(`recording.status.${ui.status}`) }}</span
          >
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            :disabled="editingLocked"
            @click="dispatch({ type: 'set-tool', tool: localState.tool === 'select' ? 'draw' : 'select' })"
          >
            {{ t(localState.tool === 'select' ? 'recording.selectTool' : 'recording.drawTool') }}
          </Button>
          <Select
            :value="localState.snap"
            :aria-label="t('recording.grid')"
            :disabled="editingLocked"
            :options="['off', '1/4', '1/8', '1/16', '1/32'].map(value => ({ value, label: value === 'off' ? t('recording.noSnap') : value }))"
            style="width: 110px"
            @update:value="dispatch({ type: 'set-snap', resolution: $event as SnapResolution })"
          />
          <Button
            :disabled="editingLocked || !localState.selection.size || localState.snap === 'off'"
            @click="dispatch({ type: 'quantize' })"
          >
            {{ t('midiEditor.contextMenu.quantize') }}
          </Button>
          <Button
            :disabled="editingLocked || !localState.selection.size"
            @click="rangeFromSelection"
          >
            {{ t('recording.replaceSelection') }}
          </Button>
          <span
            v-if="recorder.range"
            class="text-sm text-muted-foreground"
            >{{ t('recording.range', { start: recorder.range.startTick, end: recorder.range.endTick }) }}</span
          >
        </div>
        <div
          tabindex="0"
          class="h-[280px] min-h-[220px] shrink-0"
          @focusin="ui.busy && pauseForFocus()"
          @pointerdown="ui.busy && pauseForFocus()"
        >
          <PianoRoll
            ref="roll"
            variant="editor"
            :document="documentView"
            :transport="transport"
            :selected-track-id="input.trackId"
            :show-other-tracks="false"
            :labels="labels"
            :theme="midiEditorPianoRollTheme"
            :editing="editing"
            @edit-intent="handleIntent"
            @seek="seek"
          />
        </div>
        <NoteInspector
          :state="localState"
          :playable-pitches="pitches"
          :inert="editingLocked"
          @dispatch="dispatch"
        />
        <p v-if="recorder.mode === 'replace'" class="text-sm text-muted-foreground">
          {{ t('recording.replaceHint') }}
        </p>
        <div class="text-sm" role="status">
          <p>
            {{ t(preflight.issues.some(issue => issue.kind === 'unmapped') ? 'recording.mappingIssue' : 'recording.mappingOk') }}
            · {{ t('recording.timingProfile', { fps: preflight.fps, speed: preflight.speed }) }}
          </p>
          <div v-if="preflight.issues.length" class="mt-1 flex flex-wrap gap-1">
            <Button
              v-for="kind in ['unmapped', 'merged', 'overlap', 'timing'] as const"
              v-show="preflight.issues.some(issue => issue.kind === kind)"
              :key="kind"
              size="small"
              @click="dispatch({ type: 'select', mode: 'replace', noteIds: preflight.issues.filter(issue => issue.kind === kind).flatMap(issue => issue.noteIds) })"
            >
              {{ t(`recording.issues.${kind}`, { count: preflight.issues.filter(issue => issue.kind === kind).length }) }}
            </Button>
          </div>
          <p class="mt-1 text-muted-foreground">
            {{ t('recording.playbackHint') }}
          </p>
        </div>
        <NoteContextMenu
          :target="context"
          :state="localState"
          :track-id="input.trackId"
          track-only
          :popup-container="popupContainer"
          @dispatch="dispatch"
          @close="context = null"
        />
      </div>
      <div class="mt-4 flex justify-end gap-2">
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
      <EditorChoiceModal
        :open="closeChoice"
        :title="t('recording.closeTitle')"
        :description="t('recording.closeDescription')"
        :options="[{ key: 'continue', label: t('recording.continueEditing'), primary: true }, { key: 'discard', label: t('recording.discard'), danger: true }, { key: 'apply', label: t('recording.applyClose') }]"
        @choose="closeChoice = false; $event === 'apply' ? apply() : $event === 'discard' ? discard() : undefined"
      />
    </ConfigProvider>
  </Modal>
</template>
