<script setup lang="ts">
/**
 * @description: 钢琴卷帘组件
 * 左侧 DOM 音轨标签，右侧 Canvas 音符卷轴
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { drawPianoRoll, type NoteEvent, type TrackInfo } from './index'

/** 防抖函数 */
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

const props = defineProps<{
  notes: NoteEvent[]
  duration: number
  ticksPerBeat?: number
  tempo?: number
  tracks: TrackInfo[]
  disabledTracks: Set<number>
  disabledTracksVersion?: number
  currentTime: number
}>()

const emit = defineEmits<{
  toggle: [eventTrackValue: number]
}>()

const rollContainerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let destroyFn: (() => void) | null = null

// 88键 x (NOTE_HEIGHT 2px + GAP 1px) = 264px
const TRACK_HEIGHT = 88 * 3

/** 根据 eventTrackValue 检查音轨是否被禁用 */
function isTrackDisabledByMidiPlayerValue(eventTrackValue: number): boolean {
  // midi-player-js 的 track 值比 Rust 解析的大 1
  const midiPlayerTrackValue = eventTrackValue + 1
  return props.disabledTracks.has(midiPlayerTrackValue)
}

function render() {
  if (!canvasRef.value || !rollContainerRef.value) return
  destroyFn?.()
  destroyFn = drawPianoRoll(canvasRef.value, {
    container: rollContainerRef.value,
    notes: props.notes,
    duration: props.duration,
    ticksPerBeat: props.ticksPerBeat || 480,
    tempo: props.tempo || 500000,
    tracks: props.tracks,
    disabledTracks: props.disabledTracks,
    currentTime: props.currentTime,
  })
}

// 窗口缩放时重绘（防抖）
const handleResize = debounce(() => {
  render()
}, 200)

onMounted(() => {
  render()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  destroyFn?.()
  window.removeEventListener('resize', handleResize)
})

watch(
  () => [props.notes, props.tracks, props.currentTime, props.disabledTracksVersion],
  () => render(),
  { deep: true }
)

function handleToggle(trackIndex: number) {
  emit('toggle', trackIndex)
}
</script>

<template>
  <div class="piano-roll">
    <!-- 左侧：音轨标签（固定不滚动） -->
    <div class="track-labels">
      <div
        v-for="track in tracks"
        :key="track.index"
        class="track-label"
        :style="{ height: `${TRACK_HEIGHT}px` }"
      >
<div
        class="switch"
        :class="{ active: !isTrackDisabledByMidiPlayerValue(track.eventTrackValue) }"
        @click="handleToggle(track.index)"
      >
          <span class="switch-knob" />
        </div>
        <span class="track-name">{{ track.name }}</span>
      </div>
    </div>

    <!-- 右侧：Canvas 卷轴（可横向滚动） -->
    <div ref="rollContainerRef" class="roll-scroll">
      <canvas ref="canvasRef" class="roll-canvas" />
    </div>
  </div>
</template>

<style scoped>
.piano-roll {
  @apply flex rounded-xl overflow-hidden;
  background: var(--bg-primary-05);
  border: 1px solid var(--border-primary-15);
}

.track-labels {
  @apply flex-shrink-0 flex flex-col;
  width: 120px;
  background: rgba(247, 192, 193, 0.05);
  border-right: 1px solid var(--border-primary-15);
}

.track-label {
  @apply flex flex-col items-center justify-center gap-1 px-3 py-2;
  border-bottom: 2px solid rgba(247, 192, 193, 0.3);
}

.switch {
  @apply w-8 h-4 rounded-full relative cursor-pointer transition-colors;
  background: #6B7280;
}

.switch.active {
  background: #10B981;
}

.switch-knob {
  @apply absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform;
  left: 2px;
}

.switch.active .switch-knob {
  transform: translateX(16px);
}

.track-name {
  @apply text-xs break-words leading-tight;
  color: var(--color-text-secondary);
}

.roll-scroll {
  @apply flex-1 overflow-x-auto;
}

.roll-canvas {
  @apply block;
}
</style>
