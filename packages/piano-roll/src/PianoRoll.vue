<script setup lang="ts">
/**
 * @description: 钢琴卷帘组件
 * 左侧 DOM 音轨标签，右侧 Canvas 音符卷轴
 */
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { drawPianoRoll, type NoteEvent, type TrackInfo } from './index'

const props = defineProps<{
  notes: NoteEvent[]
  duration: number
  ticksPerBeat?: number
  tempo?: number
  tracks: TrackInfo[]
  disabledTracks: Set<number>
  currentTime: number
}>()

const emit = defineEmits<{
  toggle: [trackIndex: number]
}>()

const rollContainerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let destroyFn: (() => void) | null = null

const TRACK_HEIGHT = 176 // 88键 x 2px

// 动态计算总高度
const totalHeight = computed(() => props.tracks.length * TRACK_HEIGHT)

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
    trackHeight: TRACK_HEIGHT,
  })
}

onMounted(() => {
  render()
})

onUnmounted(() => {
  destroyFn?.()
})

watch(
  () => [props.notes, props.tracks, props.disabledTracks, props.currentTime],
  () => render()
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
          :class="{ active: !disabledTracks.has(track.index) }"
          @click="handleToggle(track.index)"
        >
          <span class="switch-knob" />
        </div>
        <span class="track-name">{{ track.name || `Track ${track.index + 1}` }}</span>
      </div>
    </div>

    <!-- 右侧：Canvas 卷轴（可横向滚动） -->
    <div ref="rollContainerRef" class="roll-scroll" :style="{ height: `${totalHeight}px` }">
      <canvas ref="canvasRef" class="roll-canvas" :style="{ height: `${totalHeight}px` }" />
    </div>
  </div>
</template>

<style scoped>
.piano-roll {
  @apply flex rounded-xl overflow-hidden;
  background: var(--bg-primary-05);
  border: 1px solid var(--border-primary-15);
  /* 高度由内容决定 */
}

.track-labels {
  @apply flex-shrink-0 flex flex-col;
  width: 120px;
  background: rgba(247, 192, 193, 0.05);
  border-right: 1px solid var(--border-primary-15);
}

.track-label {
  @apply flex items-center gap-2 px-3;
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
  @apply text-xs truncate;
  color: var(--color-text-secondary);
}

.roll-scroll {
  @apply flex-1 overflow-x-auto;
}

.roll-canvas {
  @apply block;
}
</style>
