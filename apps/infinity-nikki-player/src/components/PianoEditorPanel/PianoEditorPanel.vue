<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Button, Tooltip } from 'antdv-next'
import { X } from 'lucide-vue-next'
import PianoRoll from '@strawberrybear/piano-roll/vue'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type {
  PianoRollLabels,
  PianoRollTransport,
  PianoRollView,
  PianoRollViewport,
} from '@strawberrybear/piano-roll/browser'
import PianoRollControls from '@/components/PianoRollControls.vue'
import PianoTrackLabel from '@/components/PianoTrackLabel.vue'

const props = defineProps<{
  document: PianoRollDocument
  transport: PianoRollTransport
  labels: PianoRollLabels
  selectedTrackId: string | null
  timeZoom?: number
  pitchZoom?: number
  restore?: PianoRollViewport
}>()
const emit = defineEmits<{
  seek: [seconds: number]
  'seek-preview': [seconds: number | null]
  'viewport-change': [viewport: Readonly<PianoRollViewport>]
  close: []
}>()
const roll = ref<{ getView: () => PianoRollView | null } | null>(null)
/** 首次挂载和显式迁移时恢复视口，普通播放帧或轨道切换不会触发恢复。 */
function restoreSavedViewport(): void {
  if (props.restore) roll.value?.getView()?.restoreViewport(props.restore)
}
onMounted(restoreSavedViewport)
watch(() => props.restore, restoreSavedViewport, { flush: 'post' })
defineExpose({ getView: () => roll.value?.getView() ?? null })
</script>

<template>
  <PianoRoll
    ref="roll"
    class="detail-piano-editor"
    variant="editor"
    :document="document"
    :transport="transport"
    :labels="labels"
    :selected-track-id="selectedTrackId"
    :time-zoom="timeZoom"
    :pitch-zoom="pitchZoom"
    :show-toolbar-controls="false"
    @seek="emit('seek', $event)"
    @seek-preview="emit('seek-preview', $event)"
    @viewport-change="emit('viewport-change', $event)"
  >
    <template #title="{ label }">
      <strong class="piano-roll-slot-title"><PianoTrackLabel :name="label" /></strong>
    </template>
    <template #toolbar="{ view, viewport }">
      <div class="piano-roll-app-toolbar">
        <PianoRollControls
          :view="view"
          :viewport="viewport"
          :labels="labels"
          editor
        />
        <Tooltip
          :title="labels.close"
        >
          <Button
            class="piano-roll-trailing-action"
            type="text"
            size="small"
            danger
            :aria-label="labels.close"
            @click="emit('close')"
          >
            <template #icon>
              <X
                class="size-4"
                :stroke-width="2"
              />
            </template>
          </Button>
        </Tooltip>
      </div>
    </template>
  </PianoRoll>
</template>

<style scoped>
.detail-piano-editor { @apply min-h-0 flex-1; border: 0; border-radius: 0; }
.piano-roll-slot-title { @apply mr-4 min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap; max-width: 30%; }
.piano-roll-app-toolbar { @apply flex min-w-0 flex-1 items-center gap-2; }
.piano-roll-trailing-action { @apply ml-auto shrink-0; }
.detail-piano-editor :deep(.pr-gutter), .detail-piano-editor :deep(.pr-track) { border-color: var(--border-primary-10); }
</style>
