<script setup lang="ts">
/** MIDI 编辑器主工作区；主窗口与独立窗口复用同一套工具栏、卷帘和检查器。 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Tooltip } from 'antdv-next'
import { Plus } from 'lucide-vue-next'
import { resolutionTicks, snapTick } from '@strawberrybear/midi-editor'
import type { EditorAction, EditorSessionState } from '@strawberrybear/midi-editor'
import type { PianoRollEditIntent, PianoRollLabels, PianoRollTransport } from '@strawberrybear/piano-roll/browser'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import type { PianoRollProps } from '@strawberrybear/piano-roll/vue'
import PianoWorkspace from '@/components/PianoWorkspace/PianoWorkspace.vue'
import {
  createPianoHostRegistry,
  type PianoTrackActionsRegistry,
} from '@/components/PianoWorkspace/usePianoTrackHosts'
import type { PianoWorkspaceState } from '@/features/piano-editor'
import { midiEditorPianoRollTheme } from '@/theme/infinityNikkiTheme'
import NoteContextMenu, { type NoteContextMenuTarget } from './NoteContextMenu.vue'
import NoteInspector from './NoteInspector.vue'
import TrackActionsMenu from './TrackActionsMenu.vue'
import MidiEditorTour from './MidiEditorTour.vue'

const props = defineProps<{
  state: EditorSessionState
  transport: PianoRollTransport
  labels: PianoRollLabels
  playablePitches: ReadonlySet<number> | null
  showVelocity: boolean
  dimUnplayable: boolean
  detached?: boolean
  opening?: boolean
  restore?: PianoWorkspaceState
}>()

const emit = defineEmits<{
  dispatch: [action: EditorAction]
  seek: [seconds: number]
  audition: [pitch: number, velocity: number]
  'remove-track': [track: PianoRollTrack]
  'state-change': [state: PianoWorkspaceState]
  migrate: []
}>()

const { t } = useI18n()
const VELOCITY_LANE_HEIGHT = 72
const workspace = ref<InstanceType<typeof PianoWorkspace> | null>(null)
const workspaceRoot = ref<HTMLElement | null>(null)
const contextTarget = ref<NoteContextMenuTarget | null>(null)
const selectedTrackId = ref<string | null>(null)
const editorOpen = ref(props.restore?.editorOpen ?? false)
const trackActions: PianoTrackActionsRegistry = createPianoHostRegistry()
let pendingOpenTrackCount: number | null = null

const editing = computed<PianoRollProps['editing']>(() => ({
  enabled: true,
  tool: props.state.tool,
  selectedNoteIds: props.state.selection,
  snapTicks: (tick, mode) => snapTick(tick, props.state.snap, props.state.document, mode),
  defaultDurationTicks:
    resolutionTicks(props.state.snap, props.state.document) || props.state.document.ticksPerBeat,
  highlightPitches: props.playablePitches,
  loop: props.state.project.loop ?? null,
  velocityLaneHeight: props.showVelocity ? VELOCITY_LANE_HEIGHT : 0,
}))

function handleIntent(intent: PianoRollEditIntent): void {
  if (intent.type === 'audition') {
    emit('audition', intent.pitch, intent.velocity)
    return
  }
  if (intent.type === 'context-menu') {
    contextTarget.value = intent
    return
  }
  emit('dispatch', intent)
}

function rememberWorkspace(state: PianoWorkspaceState): void {
  selectedTrackId.value = state.selectedTrackId
  editorOpen.value = state.editorOpen
  emit('state-change', state)
}

function toggleTrackEnabled(trackId: string): void {
  const track = props.state.document.tracks.find((item) => item.id === trackId)
  if (track)
    emit('dispatch', {
      type: 'update-track',
      trackId,
      patch: { enabled: !track.enabled },
    })
}

async function addTrack(): Promise<void> {
  pendingOpenTrackCount = props.state.document.tracks.length
  emit('dispatch', { type: 'add-track' })
  await nextTick()
  openPendingTrack()
}

function openPendingTrack(): void {
  if (pendingOpenTrackCount === null) return
  const tracks = props.state.document.tracks
  if (tracks.length <= pendingOpenTrackCount) return
  pendingOpenTrackCount = null
  const created = tracks.at(-1)
  if (created) workspace.value?.openTrack(created.id)
}

watch(() => props.state.document.tracks.length, openPendingTrack)

defineExpose({
  getState: () => workspace.value?.getState(),
  setTransport: (transport: PianoRollTransport) => workspace.value?.setTransport(transport),
  openTrack: (trackId: string) => workspace.value?.openTrack(trackId),
})
</script>

<template>
  <div ref="workspaceRoot" class="midi-editor-body">
    <PianoWorkspace
      ref="workspace"
      :filename="`midi-editor:${state.project.id}`"
      :document="state.document"
      :theme="midiEditorPianoRollTheme"
      :transport="transport"
      :labels="labels"
      :editing="editing"
      :render-track-actions="trackActions.render"
      :detached="detached"
      :opening="opening"
      :restore="restore"
      @state-change="rememberWorkspace"
      @toggle-track="toggleTrackEnabled"
      @seek="emit('seek', $event)"
      @edit-intent="handleIntent"
      @migrate="emit('migrate')"
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

  <MidiEditorTour
    :root="workspaceRoot"
    :ready="!detached && !opening && trackActions.hosts.size > 0"
  />

  <NoteInspector
    v-if="editorOpen"
    :state="state"
    :playable-pitches="playablePitches"
    @dispatch="emit('dispatch', $event)"
  />

  <TrackActionsMenu
    :hosts="trackActions.hosts"
    :tracks="state.document.tracks"
    @edit-track="workspace?.openTrack($event)"
    @dispatch="emit('dispatch', $event)"
    @remove-track="emit('remove-track', $event)"
  />
  <NoteContextMenu
    :target="contextTarget"
    :state="state"
    :track-id="selectedTrackId"
    @dispatch="emit('dispatch', $event)"
    @close="contextTarget = null"
  />
</template>

<style scoped>
.midi-editor-body {
  @apply flex min-h-0 flex-1 flex-col;
}

.piano-corner-button.ant-btn {
  width: 20px;
  min-width: 20px;
  height: 20px;
  padding: 0;
}

.midi-editor-body :deep(.pr-track) {
  padding-left: 30px;
  cursor: default;
}

.midi-editor-body :deep(.pr-view[data-track-sorting='true']),
.midi-editor-body :deep(.pr-view[data-track-sorting='true'] .pr-track),
.midi-editor-body :deep(.pr-view[data-track-sorting='true'] .pr-track-select),
.midi-editor-body :deep(.pr-view[data-track-sorting='true'] .track-drag-handle) {
  cursor: grabbing;
  user-select: none;
}

.midi-editor-body :deep(.midi-track-shifting),
.midi-editor-body :deep(.midi-track-settling) {
  transition: transform 180ms cubic-bezier(0.77, 0, 0.175, 1);
}

.midi-editor-body :deep(.midi-track-drag-source) {
  opacity: 0.28;
}

.midi-editor-body :deep(.midi-track-drag-ghost) {
  position: absolute;
  z-index: 8;
  margin: 0;
  pointer-events: none;
  opacity: 0.96;
  background: color-mix(in srgb, var(--pr-track-selected, #ffe2e8), white 18%);
  border: 1px solid var(--pr-primary, #e36f86);
  border-radius: var(--pr-control-radius, 6px);
  box-shadow: 0 8px 22px rgb(74 63 63 / 18%);
  cursor: grabbing;
  will-change: transform;
}

.midi-editor-body :deep(.midi-track-drop-indicator) {
  position: absolute;
  z-index: 7;
  right: 0;
  left: 0;
  top: -1px;
  height: 2px;
  pointer-events: none;
  background: var(--pr-primary, #e36f86);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--pr-primary, #e36f86), transparent 72%);
}

@media (prefers-reduced-motion: reduce) {
  .midi-editor-body :deep(.midi-track-shifting),
  .midi-editor-body :deep(.midi-track-settling) {
    transition: none;
  }
}
</style>
