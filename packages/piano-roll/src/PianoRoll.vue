<script setup lang="ts">
/**
 * @description: 钢琴卷帘组件
 * 左侧 DOM 音轨标签，右侧 Canvas 音符卷轴
 */
import { nextTick, ref, onMounted, onUnmounted, watch } from 'vue'
import { drawPianoRoll, type NoteEvent, type TrackInfo } from './index'

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
let resizeObserver: ResizeObserver | null = null
let renderFrame = 0
let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null

// 88键 x (NOTE_HEIGHT 2px + GAP 1px) = 264px
const TRACK_HEIGHT = 88 * 3
/** 容器 resize 高频触发时的防抖间隔，避免拖拽窗口期间反复重绘完整 Canvas。 */
const RESIZE_RENDER_DEBOUNCE_MS = 120

/** 根据 eventTrackValue 检查音轨是否被禁用 */
function isTrackDisabledByMidiPlayerValue(eventTrackValue: number): boolean {
  // midi-player-js 的 track 值比 Rust 解析的大 1
  const midiPlayerTrackValue = eventTrackValue + 1
  return props.disabledTracks.has(midiPlayerTrackValue)
}

function render() {
  if (!canvasRef.value || !rollContainerRef.value) return
  if (rollContainerRef.value.clientWidth <= 0) return
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

/** 播放时间这类连续更新只节流到动画帧，保证指针流畅但不会一帧内重复重绘。 */
function scheduleFrameRender() {
  if (renderFrame) cancelAnimationFrame(renderFrame)
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0
    render()
  })
}

/** 尺寸变化使用真实防抖，等拖拽窗口或抽屉布局稳定后再重算 canvas 宽度。 */
function scheduleDebouncedRender() {
  if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
  resizeDebounceTimer = setTimeout(() => {
    resizeDebounceTimer = null
    scheduleFrameRender()
  }, RESIZE_RENDER_DEBOUNCE_MS)
}

onMounted(() => {
  void nextTick(() => {
    render()
    if (rollContainerRef.value) {
      resizeObserver = new ResizeObserver(() => scheduleDebouncedRender())
      resizeObserver.observe(rollContainerRef.value)
    }
  })
  window.addEventListener('resize', scheduleDebouncedRender)
})

onUnmounted(() => {
  if (renderFrame) cancelAnimationFrame(renderFrame)
  if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
  resizeObserver?.disconnect()
  destroyFn?.()
  window.removeEventListener('resize', scheduleDebouncedRender)
})

watch(
  () => [
    props.notes,
    props.tracks,
    props.duration,
    props.ticksPerBeat,
    props.tempo,
    props.disabledTracksVersion,
  ],
  () => scheduleDebouncedRender(),
  { deep: true }
)

watch(
  () => props.currentTime,
  () => scheduleFrameRender()
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
    <div
      ref="rollContainerRef"
      class="roll-scroll"
    >
      <canvas
        ref="canvasRef"
        class="roll-canvas"
      />
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
  @apply min-w-0 flex-1 overflow-hidden;
}

.roll-canvas {
  @apply block;
}
</style>
