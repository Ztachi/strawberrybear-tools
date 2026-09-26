<script setup lang="ts">
/**
 * @description: 选中音符属性面板：音高/起点/长度/力度，批量量化与移调
 */
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Popover, Slider, Tooltip } from 'antdv-next'
import { CircleAlert } from 'lucide-vue-next'
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
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'

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

/**
 * @description: 把整数 tick 格式化为可再次换回同一 tick 的最短拍数小数
 * @param {number} ticks 音符长度 tick
 * @param {number} ticksPerBeat 每四分音符 tick 数
 * @return {number} 适合在数字输入框中编辑的拍数
 */
function formatEditableBeatLength(ticks: number, ticksPerBeat: number): number {
  const safeTicksPerBeat = Math.max(1, Math.round(ticksPerBeat))
  const exact = ticks / safeTicksPerBeat
  for (let precision = 0; precision <= 6; precision += 1) {
    const factor = 10 ** precision
    const candidate = Math.round(exact * factor) / factor
    // MIDI 只能保存整数 tick；优先展示能无损换回当前 tick 的最短小数，避免低 PPQ 曲目失焦后跳值。
    if (Math.round(candidate * safeTicksPerBeat) === ticks) return candidate
  }
  return Math.round(exact * 1_000_000) / 1_000_000
}

/** 长度以可往返的拍数展示，便于与吸附网格对应。 */
const lengthBeats = computed(() =>
  single.value
    ? formatEditableBeatLength(
        single.value.endTick - single.value.startTick,
        props.state.document.ticksPerBeat
      )
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
  <aside class="note-inspector">
    <header class="inspector-header">
      <span class="inspector-title">
        {{ t('midiEditor.inspector.title') }}
        <Tooltip :title="t('midiEditor.inspector.noteTip')" :trigger="['hover', 'focus']">
          <CircleAlert
            class="property-help-icon"
            tabindex="0"
            role="img"
            :aria-label="t('midiEditor.inspector.noteTip')"
          />
        </Tooltip>
      </span>
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
          <EditorNumberInput
            :key="single.id"
            :aria-label="t('midiEditor.inspector.pitch')"
            size="small"
            :style="{ width: '60px' }"
            :min="MIN_PITCH"
            :max="MAX_PITCH"
            :precision="0"
            :value="single.pitch"
            @commit="handlePitch"
          />
          <span class="inspector-hint">{{ noteName(single.pitch) }}</span>
        </template>
        <span v-else class="inspector-value">
          {{ noteName(pitchRange.min) }}–{{ noteName(pitchRange.max) }}
        </span>
      </div>

      <div v-if="single" class="inspector-row inspector-position">
        <span class="inspector-label">{{ t('midiEditor.inspector.start') }}</span>
        <span class="inspector-value">{{ formatPosition(single.startTick) }}</span>
      </div>

      <div v-if="single" class="inspector-row">
        <span class="inspector-label">{{ t('midiEditor.inspector.length') }}</span>
        <EditorNumberInput
          :key="single.id"
          :aria-label="t('midiEditor.inspector.length')"
          size="small"
          :style="{ width: '60px' }"
          :min="0.001"
          :step="0.25"
          :value="lengthBeats"
          @commit="handleLength"
        />
      </div>

      <div class="inspector-row">
        <span class="inspector-label">{{ t('midiEditor.inspector.velocity') }}</span>
        <Popover
          :trigger="['hover', 'focus']"
          placement="top"
          :get-popup-container="getMainWindowPopupContainer"
        >
          <template #content>
            <div class="velocity-popover">
              <span class="inspector-value">{{ velocityDraft.value.value }}</span>
              <Slider
                vertical
                :style="{ height: '112px' }"
                :min="MIN_VELOCITY"
                :max="MAX_VELOCITY"
                :value="velocityDraft.value.value"
                :tooltip="{ open: false }"
                :aria-label-for-handle="t('midiEditor.inspector.velocity')"
                @change="previewVelocity"
                @change-complete="velocityDraft.commit"
                @pointerdown.capture="beginVelocity"
                @keydown.capture="cancelVelocity"
                @pointercancel="discardVelocity"
                @touchcancel="discardVelocity"
              />
            </div>
          </template>
          <Button
            class="velocity-trigger"
            size="small"
            color="primary"
            variant="outlined"
            :aria-label="t('midiEditor.inspector.velocity')"
          >
            {{ velocityDraft.value.value }}
          </Button>
        </Popover>
      </div>

      <div class="inspector-row inspector-action-group">
        <span class="inspector-label inspector-group-label">
          {{ t('midiEditor.inspector.quantize') }}
          <Tooltip :title="t('midiEditor.inspector.quantizeTip')" :trigger="['hover', 'focus']">
            <CircleAlert
              class="property-help-icon"
              tabindex="0"
              role="img"
              :aria-label="t('midiEditor.inspector.quantizeTip')"
            />
          </Tooltip>
        </span>
        <div class="inspector-actions">
          <Button
            size="small"
            color="primary"
            variant="outlined"
            :aria-label="t('midiEditor.inspector.quantizeStart')"
            @click="emit('dispatch', { type: 'quantize', start: true })"
          >
            {{ t('midiEditor.inspector.start') }}
          </Button>
          <Button
            size="small"
            color="primary"
            variant="outlined"
            :aria-label="t('midiEditor.inspector.quantizeLength')"
            @click="emit('dispatch', { type: 'quantize', start: false, length: true })"
          >
            {{ t('midiEditor.inspector.length') }}
          </Button>
        </div>
      </div>

      <div class="inspector-row inspector-action-group">
        <span class="inspector-label inspector-group-label">
          {{ t('midiEditor.inspector.transpose') }}
          <Tooltip
            :title="t('midiEditor.inspector.transposeGroupTip')"
            :trigger="['hover', 'focus']"
          >
            <CircleAlert
              class="property-help-icon"
              tabindex="0"
              role="img"
              :aria-label="t('midiEditor.inspector.transposeGroupTip')"
            />
          </Tooltip>
        </span>
        <div class="inspector-actions">
          <Button
            v-for="step in TRANSPOSE_STEPS"
            :key="step.semitones"
            size="small"
            color="primary"
            variant="outlined"
            :aria-label="t(`midiEditor.inspector.${step.key}`)"
            @click="emit('dispatch', { type: 'transpose', semitones: step.semitones })"
          >
            {{ t(`midiEditor.inspector.${step.key}`) }}
          </Button>
        </div>
      </div>

      <p v-if="unplayableCount > 0" class="inspector-warning">
        {{ t('midiEditor.inspector.unplayableCount', { count: unplayableCount }) }}
      </p>
    </template>
  </aside>
</template>

<style scoped>
.note-inspector {
  @apply flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-primary/10 bg-white/80 px-3 py-2 text-xs;
  min-height: 52px;
}
.inspector-header { @apply mr-1 flex shrink-0 items-center gap-2 whitespace-nowrap; }
.inspector-title { @apply flex items-center gap-1 font-semibold; color: var(--color-foreground); }
.inspector-count, .inspector-label, .inspector-hint { color: var(--color-muted-dark); }
.inspector-row { @apply flex shrink-0 items-center gap-1.5 whitespace-nowrap; }
.inspector-value { @apply font-medium tabular-nums; color: var(--color-foreground); }
.inspector-actions { @apply flex items-center gap-1; }
.inspector-actions :deep(.ant-btn) { min-width: 30px; padding-inline: 7px; }
.inspector-group-label { @apply flex items-center gap-1; }
.property-help-icon { @apply cursor-help; width: 13px; height: 13px; color: var(--color-muted); }
.velocity-trigger.ant-btn { min-width: 42px; padding-inline: 7px; font-variant-numeric: tabular-nums; }
.velocity-popover { @apply flex w-10 flex-col items-center gap-2 py-1; }
.inspector-warning { @apply m-0 text-xs; color: var(--color-danger, #d9534f); }
</style>
