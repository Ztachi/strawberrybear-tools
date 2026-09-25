<script setup lang="ts">
/**
 * @description: 选中音符属性面板：音高/起点/长度/力度，批量量化与移调
 */
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Slider, Tooltip } from 'antdv-next'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import EditorNumberInput from './EditorNumberInput.vue'
import { useEditorValueDraft } from '../useEditorValueDraft'
import { createTimeline } from '@strawberrybear/piano-roll/core'
import {
  MAX_PITCH,
  MAX_VELOCITY,
  MIN_NOTE_TICKS,
  MIN_PITCH,
  MIN_VELOCITY,
} from '@strawberrybear/midi-editor'
import type { EditorAction, EditorSessionState } from '@strawberrybear/midi-editor'

const props = defineProps<{
  detailed?: boolean
  state: EditorSessionState
  /** 游戏可演奏音高；提供时统计选区内不可演奏音符数。 */
  playablePitches?: ReadonlySet<number> | null
}>()
const emit = defineEmits<{
  dispatch: [action: EditorAction]
  'update:detailed': [value: boolean]
}>()
const { t } = useI18n()

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
/** 移调按钮：半音与八度。 */
const TRANSPOSE_STEPS = [
  { semitones: -12, key: 'octaveDown' },
  { semitones: -1, key: 'semitoneDown' },
  { semitones: 1, key: 'semitoneUp' },
  { semitones: 12, key: 'octaveUp' },
] as const

const selectedNotes = computed(() =>
  props.state.document.notes.filter((note) => props.state.selection.has(note.id))
)
const single = computed(() => (selectedNotes.value.length === 1 ? selectedNotes.value[0]! : null))
const pitchRange = computed(() => {
  let min = MAX_PITCH
  let max = MIN_PITCH
  for (const note of selectedNotes.value) {
    min = Math.min(min, note.pitch)
    max = Math.max(max, note.pitch)
  }
  return { min, max }
})
const velocity = computed(() => selectedNotes.value[0]?.velocity ?? 100)
const unplayableCount = computed(() => {
  const playable = props.playablePitches
  if (!playable) return 0
  return selectedNotes.value.reduce((count, note) => count + (playable.has(note.pitch) ? 0 : 1), 0)
})
const timeline = computed(() => createTimeline(props.state.document))

/**
 * @description: 音高转音名
 * @param {number} pitch MIDI 音高
 * @return {string} 音名
 */
function noteName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`
}
/**
 * @description: tick 转 “小节.拍.tick” 位置文本
 * @param {number} tick 位置
 * @return {string} 位置文本
 */
function formatPosition(tick: number): string {
  const position = timeline.value.tickToBarPosition(tick)
  // bar 与 beat 均已从 1 计，与标尺一致。
  return `${position.bar}.${position.beat}.${String(Math.round(position.tickInBeat)).padStart(3, '0')}`
}
/** 长度以拍数展示，便于与吸附网格对应。 */
const lengthBeats = computed(() =>
  single.value
    ? Math.round(((single.value.endTick - single.value.startTick) / props.state.document.ticksPerBeat) * 1000) / 1000
    : null
)

function handlePitch(value: number | string | null): void {
  if (!single.value) return
  const next = Number(value)
  if (!Number.isFinite(next)) return
  const delta = Math.round(next) - single.value.pitch
  if (delta !== 0) emit('dispatch', { type: 'transpose', semitones: delta })
}
function handleLength(value: number | string | null): void {
  if (!single.value) return
  const beats = Number(value)
  if (!Number.isFinite(beats) || beats <= 0) return
  const targetTicks = Math.max(MIN_NOTE_TICKS, Math.round(beats * props.state.document.ticksPerBeat))
  const delta = targetTicks - (single.value.endTick - single.value.startTick)
  if (delta !== 0) {
    emit('dispatch', { type: 'resize', noteIds: [single.value.id], edge: 'end', deltaTick: delta })
  }
}
const velocityDraft = useEditorValueDraft(() => velocity.value, next => {
  emit('dispatch', { type: 'set-selected-velocity', velocity: next })
})
let velocityCancelled = false
function beginVelocity(): void { velocityCancelled = false }
function discardVelocity(): void {
  velocityCancelled = true
  velocityDraft.cancel()
}
function previewVelocity(value: number | number[]): void {
  // 框架在 Escape/失焦后可能仍收到旧手势的 move/end，直到下一次按下前全部忽略。
  if (velocityCancelled) return
  const next = Array.isArray(value) ? value[0] : value
  if (typeof next === 'number') velocityDraft.update(next)
}
function cancelVelocity(event: KeyboardEvent): void {
  if (event.key !== 'Escape') {
    if (!event.repeat) beginVelocity()
    return
  }
  event.preventDefault()
  event.stopPropagation()
  discardVelocity()
}
// 相同力度的不同选区也要重置；撤销或其它编辑不能被旧手势的完成事件覆盖。
watch(() => [props.state.selection, props.state.document], discardVelocity, { flush: 'sync' })
onMounted(() => window.addEventListener('blur', discardVelocity))
onBeforeUnmount(() => window.removeEventListener('blur', discardVelocity))
</script>

<template>
  <aside class="note-inspector" :class="{ 'note-inspector--detailed': detailed }">
    <div class="inspector-main">
      <header class="inspector-header">
        <span class="inspector-title">{{ t('midiEditor.inspector.title') }}</span>
        <span class="inspector-count">
          {{
            selectedNotes.length === 0
              ? t('midiEditor.inspector.noSelection')
              : t('midiEditor.inspector.selectedCount', { count: selectedNotes.length })
          }}
        </span>
      </header>
      <div class="inspector-properties">
        <template v-if="selectedNotes.length > 0">
          <div class="inspector-row">
            <span class="inspector-label">{{ t('midiEditor.inspector.pitch') }}</span>
            <template v-if="single">
              <EditorNumberInput
                :key="single.id"
                :aria-label="t('midiEditor.inspector.pitch')"
                size="small"
                class="inspector-input"
                :style="{ width: '76px' }"
                :min="MIN_PITCH"
                :max="MAX_PITCH"
                :precision="0"
                :value="single.pitch"
                @commit="handlePitch"
              />
              <span class="inspector-hint">{{ noteName(single.pitch) }}</span>
            </template>
            <span v-else class="inspector-value">
              {{ noteName(pitchRange.min) }} – {{ noteName(pitchRange.max) }}
            </span>
          </div>

          <div v-if="single" class="inspector-row">
            <span class="inspector-label">{{ t('midiEditor.inspector.length') }}</span>
            <EditorNumberInput
              :key="single.id"
              :aria-label="t('midiEditor.inspector.length')"
              size="small"
              class="inspector-input"
              :style="{ width: '76px' }"
              :min="0.001"
              :step="0.25"
              :value="lengthBeats"
              @commit="handleLength"
            />
          </div>

          <div class="inspector-row">
            <span class="inspector-label">{{ t('midiEditor.inspector.velocity') }}</span>
            <Slider
              class="inspector-slider"
              :style="{ width: '96px', margin: '0 4px' }"
              :min="MIN_VELOCITY"
              :max="MAX_VELOCITY"
              :value="velocityDraft.value.value"
              @change="previewVelocity"
              @change-complete="velocityDraft.commit"
              @pointerdown.capture="beginVelocity"
              @keydown.capture="cancelVelocity"
              @pointercancel="discardVelocity"
              @touchcancel="discardVelocity"
            />
            <span class="inspector-hint w-7 text-right">{{ velocityDraft.value.value }}</span>
          </div>
        </template>
      </div>
      <Tooltip :title="t('midiEditor.toolbar.detailTip')" :trigger="['hover', 'focus']">
        <Button
          size="small"
          color="primary"
          variant="text"
          :aria-expanded="Boolean(detailed)"
          aria-controls="midi-note-details"
          @click="emit('update:detailed', !detailed)"
        >
          {{ t(detailed ? 'midiEditor.toolbar.compact' : 'midiEditor.toolbar.detailed') }}
          <component :is="detailed ? ChevronDown : ChevronUp" class="size-3" />
        </Button>
      </Tooltip>
    </div>
    <div v-if="detailed" id="midi-note-details" class="inspector-details">
      <template v-if="selectedNotes.length > 0">
        <div v-if="single" class="inspector-row">
          <span class="inspector-label">{{ t('midiEditor.inspector.start') }}</span>
          <span class="inspector-value">{{ formatPosition(single.startTick) }}</span>
        </div>
        <div class="inspector-row">
          <span class="inspector-label">{{ t('midiEditor.inspector.quantize') }}</span>
          <div class="inspector-actions">
            <Tooltip :title="t('midiEditor.inspector.quantizeStartTip')">
              <Button
                size="small"
                color="primary"
                variant="outlined"
                @click="emit('dispatch', { type: 'quantize', start: true })"
              >
                {{ t('midiEditor.inspector.quantizeStart') }}
              </Button>
            </Tooltip>
            <Tooltip :title="t('midiEditor.inspector.quantizeLengthTip')">
              <Button
                size="small"
                color="primary"
                variant="outlined"
                @click="emit('dispatch', { type: 'quantize', start: false, length: true })"
              >
                {{ t('midiEditor.inspector.quantizeLength') }}
              </Button>
            </Tooltip>
          </div>
        </div>

        <div class="inspector-row">
          <span class="inspector-label">{{ t('midiEditor.inspector.transpose') }}</span>
          <div class="inspector-actions">
            <Tooltip
              v-for="step in TRANSPOSE_STEPS"
              :key="step.semitones"
              :title="t('midiEditor.inspector.transposeTip', { semitones: step.semitones > 0 ? `+${step.semitones}` : step.semitones })"
            >
              <Button
                size="small"
                color="primary"
                variant="outlined"
                @click="emit('dispatch', { type: 'transpose', semitones: step.semitones })"
              >
                {{ t(`midiEditor.inspector.${step.key}`) }}
              </Button>
            </Tooltip>
          </div>
        </div>

        <p v-if="unplayableCount > 0" class="inspector-warning">
          {{ t('midiEditor.inspector.unplayableCount', { count: unplayableCount }) }}
        </p>
      </template>
      <span v-else class="inspector-hint">{{ t('midiEditor.inspector.noSelection') }}</span>
    </div>
  </aside>
</template>

<style scoped>
.note-inspector { @apply shrink-0 border-t border-primary/10 bg-white/80 text-xs; container-type: inline-size; }
.inspector-main { @apply flex items-center gap-4 px-3; height: 60px; }
.inspector-header { @apply flex shrink-0 flex-col gap-1; width: 120px; }
.inspector-title { @apply font-semibold; color: var(--color-foreground); }
.inspector-count, .inspector-label, .inspector-hint { color: var(--color-muted-dark); }
.inspector-properties { @apply flex min-w-0 flex-1 items-center gap-5; }
.inspector-row { @apply flex shrink-0 items-center gap-2 whitespace-nowrap; }
.inspector-value { @apply font-medium tabular-nums; color: var(--color-foreground); }
.inspector-details { @apply flex items-center gap-5 border-t border-primary/10 px-3; min-height: 48px; }
.inspector-actions { @apply flex items-center gap-1; }
.inspector-warning { @apply m-0 text-xs; color: var(--color-danger, #d9534f); }
@container (max-width: 760px) {
  .inspector-header { width: 90px; }
  .inspector-main, .inspector-properties { gap: 8px; }
  .inspector-properties .inspector-row { gap: 4px; }
  .inspector-properties :deep(.inspector-slider) { width: 64px !important; }
  .inspector-details { @apply grid grid-cols-2 gap-x-3 gap-y-2 py-2; }
}
</style>
