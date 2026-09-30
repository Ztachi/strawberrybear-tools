<script setup lang="ts">
/** 独立 MIDI 项目编辑窗口；编辑状态与持久化仍由主窗口中的会话负责。 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { App as AntApp, ConfigProvider, Input, Spin, Tooltip } from 'antdv-next'
import type { EditorAction } from '@strawberrybear/midi-editor'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import WindowTitleBar from '@/components/WindowTitleBar/WindowTitleBar.vue'
import { MidiEditorShortcutController } from '@/features/midi-editor/shortcutController'
import type { PianoWorkspaceState } from '@/features/piano-editor'
import {
  deserializeMidiProjectEditorState,
  MIDI_PROJECT_EDITOR_CLIENT_PORT,
  type MidiProjectEditorClientPort,
  type MidiProjectEditorCommand,
  type MidiProjectEditorPresentation,
  type MidiProjectEditorRequest,
} from '@/features/midi-project-editor-window'
import { feedback as toast } from '@/lib/feedback'
import { createMidiProjectEditorClientPort } from '@/platform/tauri/midiProjectEditorWindow'
import { getAntdvLocale, isSupportedLocale } from '@/i18n'
import { midiEditorConfigProviderProps } from '@/theme/infinityNikkiTheme'
import MidiEditorWorkspace from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/MidiEditorWorkspace.vue'
import { useMidiEditorPlayback } from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/useMidiEditorPlayback'
import EditorChoiceModal, {
  type EditorChoiceOption,
} from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/EditorChoiceModal.vue'
import EditorProjectActions from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/EditorProjectActions.vue'
import EditorToolbar from '@/views/MainWindow/MidiEditorTab/MidiEditorPage/components/EditorToolbar.vue'

const port =
  inject<MidiProjectEditorClientPort | undefined>(MIDI_PROJECT_EDITOR_CLIENT_PORT, undefined) ??
  createMidiProjectEditorClientPort()
const params = new URLSearchParams(window.location.search)
const session = params.get('session') ?? ''
const { t, locale } = useI18n()
const presentation = shallowRef<MidiProjectEditorPresentation | null>(null)
const restore = shallowRef<PianoWorkspaceState>()
const workspace = ref<InstanceType<typeof MidiEditorWorkspace> | null>(null)
const error = ref('')
const shown = ref(false)
let active = true
let sent = 0
let received = 0
let lastContact = Date.now()
let sending = Promise.resolve()
let viewportTimer: number | undefined
let pendingViewport: PianoWorkspaceState | undefined
const cleanups: (() => void)[] = []

const state = computed(() =>
  presentation.value ? deserializeMidiProjectEditorState(presentation.value.state) : null
)
const activeDocument = computed(() => state.value?.document ?? null)
const loop = computed(() => state.value?.project.loop ?? null)
const playablePitches = computed<ReadonlySet<number> | null>(() => {
  const current = presentation.value
  return current?.dimUnplayable ? new Set(current.playablePitches) : null
})
const playback = useMidiEditorPlayback(
  activeDocument, loop, (transport) => workspace.value?.setTransport(transport), playablePitches
)
const configLocale = computed(() => getAntdvLocale(locale.value))
const choice = ref<{
  open: boolean
  title: string
  description: string
  options: EditorChoiceOption[]
  resolve: CallableFunction | null
}>({ open: false, title: '', description: '', options: [], resolve: null })

function send(command: MidiProjectEditorCommand): Promise<void> {
  if (!session || !active) return Promise.resolve()
  const request = { ...command, session, sequence: ++sent } as MidiProjectEditorRequest
  sending = sending.then(() => port.send(request)).catch((cause) => {
    error.value = String(cause)
  })
  return sending
}

function queueViewport(viewport: PianoWorkspaceState): void {
  pendingViewport = viewport
  window.clearTimeout(viewportTimer)
  viewportTimer = window.setTimeout(() => {
    const current = pendingViewport
    pendingViewport = undefined
    if (current) void send({ kind: 'viewport', viewport: current })
  }, 100)
}

/** 原生关闭和还原按钮都先提交最终视口，再销毁子窗口。 */
async function dockEditor(): Promise<void> {
  window.clearTimeout(viewportTimer)
  viewportTimer = undefined
  const viewport = workspace.value?.getState() ?? pendingViewport
  pendingViewport = undefined
  playback.pause()
  await send({ kind: 'playback-position', seconds: playback.positionSeconds.value })
  if (viewport) await send({ kind: 'viewport', viewport })
  await send({ kind: 'dock' })
}

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

async function confirm(
  title: string,
  description: string,
  okLabel: string,
  danger = false
): Promise<boolean> {
  const key = await ask(title, description, [
    { key: 'cancel', label: t('actions.cancel') },
    { key: 'ok', label: okLabel, primary: true, danger },
  ])
  return key === 'ok'
}

function dispatch(action: EditorAction): void {
  void send({ kind: 'dispatch', action })
}

/** 独立窗口自己排程音符；开始前只请主窗口停掉可能仍在播放的全局试听。 */
async function playEditor(): Promise<void> {
  // 音频准备必须直接发生在点击手势内；主窗口暂停请求不阻塞本窗口的 AudioContext。
  void send({ kind: 'prepare-playback' })
  await playback.play()
}

const shortcuts = new MidiEditorShortcutController({
  state: () => state.value!,
  positionSeconds: () => playback.positionSeconds.value,
  dispatch,
  save: () => void send({ kind: 'save' }),
  togglePlayback: () => {
    if (playback.isPlaying.value) playback.pause()
    else void playEditor()
  },
})

function isTypingTarget(target: EventTarget | null): boolean {
  if (window.getSelection()?.toString()) return true
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return !!target.closest(
    'input, textarea, select, button, [contenteditable="true"], [data-text-selectable], [role="tooltip"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="menu"], [role="dialog"], [role="listbox"]'
  )
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (!state.value || event.defaultPrevented || isTypingTarget(event.target)) {
    shortcuts.end()
    return
  }
  if (
    shortcuts.handle({
      key: event.key,
      repeat: event.repeat,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    })
  ) {
    event.preventDefault()
  }
}

function handleWindowKeyup(event: KeyboardEvent): void {
  shortcuts.end(event.key)
}

function endShortcutGesture(): void {
  shortcuts.end()
}

async function setBpm(bpm: number): Promise<void> {
  if (
    (state.value?.document.tempoMap.length ?? 0) > 1 &&
    !(await confirm(
      t('midiEditor.toolbar.replaceTempoTitle'),
      t('midiEditor.toolbar.replaceTempoDescription'),
      t('midiEditor.toolbar.replace')
    ))
  )
    return
  dispatch({ type: 'set-tempo', bpm })
}

async function setMeter(numerator: number, denominator: number): Promise<void> {
  if (
    (state.value?.document.timeSignatureMap.length ?? 0) > 1 &&
    !(await confirm(
      t('midiEditor.toolbar.replaceMeterTitle'),
      t('midiEditor.toolbar.replaceMeterDescription'),
      t('midiEditor.toolbar.replace')
    ))
  )
    return
  dispatch({ type: 'set-time-signature', numerator, denominator })
}

async function removeTrack(track: PianoRollTrack): Promise<void> {
  const current = state.value?.document
  if (!current) return
  if (current.tracks.length <= 1) {
    toast.warning(t('midiEditor.lastTrack'), { richColors: true })
    return
  }
  const count = current.notes.reduce(
    (sum, note) => sum + (note.trackId === track.id ? 1 : 0),
    0
  )
  if (
    count > 0 &&
    !(await confirm(
      t('midiEditor.deleteTrack'),
      t('midiEditor.confirmDeleteTrack', { name: track.name, count }),
      t('actions.delete'),
      true
    ))
  )
    return
  dispatch({ type: 'remove-track', trackId: track.id })
}

function renameProject(event: Event): void {
  dispatch({ type: 'rename', name: (event.target as HTMLInputElement).value })
}

function setViewOption(option: 'showVelocity' | 'dimUnplayable', value: boolean): void {
  const current = presentation.value
  if (current) presentation.value = { ...current, [option]: value }
  void send({ kind: 'view-option', option, value })
}

/** 先更新子窗口选中态，再由主窗口持久化并回传可演奏音高。 */
function selectKeyTemplate(templateId: string): void {
  const current = presentation.value
  if (current) presentation.value = { ...current, currentTemplateId: templateId }
  void send({ kind: 'select-template', templateId })
}

async function exitEditor(): Promise<void> {
  if (!presentation.value?.hasChanges) {
    playback.stop()
    await send({ kind: 'exit', mode: 'discard' })
    return
  }
  const decision = await ask(
    t('midiEditor.leaveConfirmTitle'),
    t('midiEditor.leaveConfirmDescription'),
    [
      { key: 'cancel', label: t('actions.cancel') },
      { key: 'discard', label: t('midiEditor.discardAndClose'), danger: true },
      { key: 'save', label: t('midiEditor.saveAndClose'), primary: true },
    ]
  )
  if (decision === 'save' || decision === 'discard') {
    playback.stop()
    await send({ kind: 'exit', mode: decision })
  }
}

async function saveAndClose(): Promise<void> {
  playback.stop()
  await send({ kind: 'exit', mode: 'save' })
}

onMounted(async () => {
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('keyup', handleWindowKeyup)
  window.addEventListener('blur', endShortcutGesture)
  window.addEventListener('pointerdown', endShortcutGesture)
  cleanups.push(() => {
    window.removeEventListener('keydown', handleWindowKeydown)
    window.removeEventListener('keyup', handleWindowKeyup)
    window.removeEventListener('blur', endShortcutGesture)
    window.removeEventListener('pointerdown', endShortcutGesture)
  })
  try {
    const unlisten = await port.listen(async (update) => {
      if (!active || update.session !== session || update.sequence <= received) return
      received = update.sequence
      lastContact = Date.now()
      if (update.kind === 'notice') {
        toast[update.level](update.title, {
          ...(update.description ? { description: update.description } : {}),
          richColors: true,
        })
        return
      }
      if (update.kind === 'dock') {
        await dockEditor()
        return
      }
      if (update.kind === 'pong') return
      const initializePlayback = !presentation.value
      presentation.value = update.presentation
      if (update.viewport) restore.value = update.viewport
      if (isSupportedLocale(update.presentation.locale)) locale.value = update.presentation.locale
      await nextTick()
      if (!active) return
      if (initializePlayback) playback.seek(update.presentation.transport.positionSeconds)
      await port.setTitle(update.presentation.state.project.name)
      if (!shown.value) {
        await port.show()
        shown.value = true
      }
      await send({ kind: 'shown' })
    })
    if (!active) return unlisten()
    cleanups.push(unlisten)
    const close = await port.onCloseRequested(() => {
      void dockEditor()
    })
    if (!active) return close()
    cleanups.push(close)
    await send({ kind: 'ready' })
    const heartbeat = window.setInterval(() => {
      if (Date.now() - lastContact > 10000) {
        clearInterval(heartbeat)
        void port.destroy().catch((cause) => {
          error.value = String(cause)
        })
      } else void send({ kind: 'ping' })
    }, 2000)
    cleanups.push(() => clearInterval(heartbeat))
  } catch (cause) {
    error.value = String(cause)
    await port.show()
  }
})

onBeforeUnmount(() => {
  active = false
  window.clearTimeout(viewportTimer)
  choice.value.resolve?.('cancel')
  for (const cleanup of cleanups) cleanup()
})
</script>

<template>
  <ConfigProvider v-bind="midiEditorConfigProviderProps" :locale="configLocale">
    <AntApp>
      <main class="detached-midi-editor">
        <template v-if="presentation && state">
          <WindowTitleBar :snap-layouts="false">
            <template #title>
              <div class="editor-project-identity">
                <Input
                  class="midi-editor-name"
                  size="small"
                  variant="outlined"
                  :value="state.project.name"
                  :maxlength="30"
                  :placeholder="t('midiEditor.name')"
                  :aria-label="t('midiEditor.name')"
                  @change="renameProject"
                />
                <Tooltip v-if="presentation.hasChanges" :title="t('midiEditor.unsaved')">
                  <span
                    class="editor-unsaved"
                    :aria-label="t('midiEditor.unsaved')"
                    role="status"
                  />
                </Tooltip>
              </div>
              <EditorToolbar
                :show-velocity="presentation.showVelocity"
                :dim-unplayable="presentation.dimUnplayable"
                :current-template-id="presentation.currentTemplateId"
                :templates="presentation.templates"
                :state="state"
                :is-playing="playback.isPlaying.value"
                @update:show-velocity="setViewOption('showVelocity', $event)"
                @update:dim-unplayable="setViewOption('dimUnplayable', $event)"
                @select-template="selectKeyTemplate"
                @dispatch="dispatch"
                @play="playEditor"
                @pause="playback.pause()"
                @stop="playback.stop()"
                @set-bpm="setBpm"
                @set-meter="setMeter"
              />
            </template>
            <template #actions>
              <EditorProjectActions
                :saving="presentation.saving"
                @save="send({ kind: 'save' })"
                @export="send({ kind: 'export' })"
                @close="exitEditor"
                @save-and-close="saveAndClose"
              />
            </template>
          </WindowTitleBar>

          <MidiEditorWorkspace
            ref="workspace"
            :state="state"
            :transport="playback.transport.value"
            :labels="presentation.labels"
            :playable-pitches="playablePitches"
            :show-velocity="presentation.showVelocity"
            :dim-unplayable="presentation.dimUnplayable"
            :restore="restore"
            detached
            @dispatch="dispatch"
            @seek="playback.seek"
            @audition="playback.audition"
            @remove-track="removeTrack"
            @state-change="queueViewport"
            @migrate="dockEditor"
          />
        </template>
        <Spin v-else size="large" />
        <p v-if="error" class="detached-error" role="alert">
          {{ error }}
        </p>
      </main>

      <EditorChoiceModal
        :open="choice.open"
        :title="choice.title"
        :description="choice.description"
        :options="choice.options"
        @choose="resolveChoice"
      />
    </AntApp>
  </ConfigProvider>
</template>

<style scoped>
.detached-midi-editor {
  @apply flex h-screen min-h-0 flex-col overflow-hidden bg-white;
}

.editor-project-identity {
  @apply flex min-w-0 shrink items-center gap-2;
  width: min(220px, 23vw);
  -webkit-app-region: no-drag;
}
.editor-project-identity :deep(.midi-editor-name) {
  width: 100%;
  min-width: 0;
  font-weight: 600;
}
.editor-unsaved { @apply size-1.5 shrink-0 rounded-full bg-primary; }
.detached-error { @apply m-0 px-3 py-1 text-sm; color: var(--color-error); }
</style>
