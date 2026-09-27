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
import EditorToolbar from './EditorToolbar.vue'
import NoteContextMenu, { type NoteContextMenuTarget } from './NoteContextMenu.vue'
import NoteInspector from './NoteInspector.vue'
import TrackActionsMenu from './TrackActionsMenu.vue'

const props = defineProps<{
  state: EditorSessionState
  transport: PianoRollTransport
  labels: PianoRollLabels
  isPlaying: boolean
  playablePitches: ReadonlySet<number> | null
  showVelocity: boolean
  dimUnplayable: boolean
  detached?: boolean
  opening?: boolean
  restore?: PianoWorkspaceState
}>()

const emit = defineEmits<{
  dispatch: [action: EditorAction]
  play: []
  pause: []
  stop: []
  seek: [seconds: number]
  audition: [pitch: number, velocity: number]
  'set-bpm': [bpm: number]
  'set-meter': [numerator: number, denominator: number]
  'remove-track': [track: PianoRollTrack]
  'state-change': [state: PianoWorkspaceState]
  migrate: []
  'update:showVelocity': [value: boolean]
  'update:dimUnplayable': [value: boolean]
}>()

const { t } = useI18n()
const VELOCITY_LANE_HEIGHT = 72
const workspace = ref<InstanceType<typeof PianoWorkspace> | null>(null)
const contextTarget = ref<NoteContextMenuTarget | null>(null)
const selectedTrackId = ref<string | null>(null)
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

function setMeter(numerator: number, denominator: number): void {
  emit('set-meter', numerator, denominator)
}

watch(() => props.state.document.tracks.length, openPendingTrack)

defineExpose({
  getState: () => workspace.value?.getState(),
  setTransport: (transport: PianoRollTransport) => workspace.value?.setTransport(transport),
  openTrack: (trackId: string) => workspace.value?.openTrack(trackId),
})
</script>

<template>
  <EditorToolbar
    :show-velocity="showVelocity"
    :dim-unplayable="dimUnplayable"
    :state="state"
    :is-playing="isPlaying"
    @update:show-velocity="emit('update:showVelocity', $event)"
    @update:dim-unplayable="emit('update:dimUnplayable', $event)"
    @dispatch="emit('dispatch', $event)"
    @play="emit('play')"
    @pause="emit('pause')"
    @stop="emit('stop')"
    @set-bpm="emit('set-bpm', $event)"
    @set-meter="setMeter"
  />

  <div class="midi-editor-body">
    <PianoWorkspace
      ref="workspace"
      :filename="`midi-editor:${state.project.id}`"
      :document="state.document"
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

  <NoteInspector
    :state="state"
    :playable-pitches="playablePitches"
    @dispatch="emit('dispatch', $event)"
  />

  <TrackActionsMenu
    :hosts="trackActions.hosts"
    :tracks="state.document.tracks"
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
</style>
