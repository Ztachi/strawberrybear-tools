<script setup lang="ts">
/**
 * @description: 选中音符属性面板：音高/起点/长度/力度，批量量化与移调
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, InputNumber, Slider } from 'antdv-next'
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
  state: EditorSessionState
  /** 游戏可演奏音高；提供时统计选区内不可演奏音符数。 */
  playablePitches?: ReadonlySet<number> | null
}>()
const emit = defineEmits<{
  dispatch: [action: EditorAction]
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
function handleVelocity(value: number | number[]): void {
  const next = Array.isArray(value) ? value[0] : value
  if (typeof next === 'number') emit('dispatch', { type: 'set-selected-velocity', velocity: next })
}
</script>

<template>
  <aside class="note-inspector">
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

    <template v-if="selectedNotes.length > 0">
      <div class="inspector-row">
        <span class="inspector-label">{{ t('midiEditor.inspector.pitch') }}</span>
        <template v-if="single">
          <InputNumber
            size="small"
            class="inspector-input"
            :min="MIN_PITCH"
            :max="MAX_PITCH"
            :precision="0"
            :value="single.pitch"
            @change="handlePitch"
          />
          <span class="inspector-hint">{{ noteName(single.pitch) }}</span>
        </template>
        <span
          v-else
          class="inspector-value"
        >
          {{ noteName(pitchRange.min) }} – {{ noteName(pitchRange.max) }}
        </span>
      </div>

      <div
        v-if="single"
        class="inspector-row"
      >
        <span class="inspector-label">{{ t('midiEditor.inspector.start') }}</span>
        <span class="inspector-value">{{ formatPosition(single.startTick) }}</span>
      </div>

      <div
        v-if="single"
        class="inspector-row"
      >
        <span class="inspector-label">{{ t('midiEditor.inspector.length') }}</span>
        <InputNumber
          size="small"
          class="inspector-input"
          :min="0.001"
          :step="0.25"
          :value="lengthBeats"
          @change="handleLength"
        />
      </div>

      <div class="inspector-row">
        <span class="inspector-label">{{ t('midiEditor.inspector.velocity') }}</span>
        <Slider
          class="inspector-slider"
          :min="MIN_VELOCITY"
          :max="MAX_VELOCITY"
          :value="velocity"
          @change="handleVelocity"
        />
        <span class="inspector-hint w-7 text-right">{{ velocity }}</span>
      </div>

      <div class="inspector-row">
        <span class="inspector-label">{{ t('midiEditor.inspector.quantize') }}</span>
        <div class="inspector-actions">
          <Button
            size="small"
            color="primary"
            variant="outlined"
            @click="emit('dispatch', { type: 'quantize', start: true })"
          >
            {{ t('midiEditor.inspector.quantizeStart') }}
          </Button>
          <Button
            size="small"
            color="primary"
            variant="outlined"
            @click="emit('dispatch', { type: 'quantize', start: false, length: true })"
          >
            {{ t('midiEditor.inspector.quantizeLength') }}
          </Button>
        </div>
      </div>

      <div class="inspector-row">
        <span class="inspector-label">{{ t('midiEditor.inspector.transpose') }}</span>
        <div class="inspector-actions">
          <Button
            v-for="step in TRANSPOSE_STEPS"
            :key="step.semitones"
            size="small"
            color="primary"
            variant="outlined"
            @click="emit('dispatch', { type: 'transpose', semitones: step.semitones })"
          >
            {{ t(`midiEditor.inspector.${step.key}`) }}
          </Button>
        </div>
      </div>

      <p
        v-if="unplayableCount > 0"
        class="inspector-warning"
      >
        {{ t('midiEditor.inspector.unplayableCount', { count: unplayableCount }) }}
      </p>
    </template>
  </aside>
</template>

<style scoped>
.note-inspector {
  @apply flex flex-wrap content-start items-center gap-x-4 gap-y-2 overflow-y-auto border-t border-primary/10 px-3 py-2 text-xs;
  /* 固定两行高度：选中/取消选中时不改变钢琴卷帘的几何位置，避免拖拽中的指针错位。 */
  height: 4.5rem;
}

.inspector-header {
  @apply flex items-center gap-2;
}

.inspector-title {
  @apply font-semibold;
  color: var(--color-foreground);
}

.inspector-count,
.inspector-label,
.inspector-hint {
  color: var(--color-muted);
}

.inspector-row {
  @apply flex items-center gap-2;
}

.inspector-value {
  @apply font-medium tabular-nums;
  color: var(--color-foreground);
}

.inspector-input {
  width: 84px;
}

.inspector-slider {
  width: 120px;
  margin: 0 4px;
}

.inspector-actions {
  @apply flex items-center gap-1;
}

.inspector-warning {
  @apply m-0 font-medium;
  color: var(--color-danger, #d9534f);
}
</style>
