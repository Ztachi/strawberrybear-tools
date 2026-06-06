<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Slider } from 'antdv-next'

const props = withDefaults(
  defineProps<{
    currentTime: number
    duration: number
    variant?: 'default' | 'overlay'
  }>(),
  {
    variant: 'default',
  }
)

const emit = defineEmits<{
  preview: [time: number]
  seek: [time: number]
  dragging: [dragging: boolean]
}>()

const internalPercent = ref(0)
const isDragging = ref(false)

const currentPercent = computed(() => {
  if (!props.duration) return 0
  return (props.currentTime / props.duration) * 100
})

function formatTime(ms: number) {
  const safeSeconds = Math.max(0, ms / 1000)
  const mins = Math.floor(safeSeconds / 60)
  const secs = Math.floor(safeSeconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function percentToTime(percent: number) {
  return (percent / 100) * props.duration
}

function onSliderPointerDown() {
  isDragging.value = true
  emit('dragging', true)
}

function onSliderUpdate(value: number | number[] | undefined) {
  if (value === undefined) return
  const nextPercent = Array.isArray(value) ? value[0] : value
  internalPercent.value = nextPercent
  if (isDragging.value) {
    emit('preview', percentToTime(nextPercent))
  }
}

function onSliderPointerUp() {
  if (!isDragging.value) return
  const time = percentToTime(internalPercent.value)
  isDragging.value = false
  emit('dragging', false)
  emit('seek', time)
}

watch(currentPercent, (newVal) => {
  if (!isDragging.value) {
    internalPercent.value = newVal
  }
})

onMounted(() => {
  window.addEventListener('pointerup', onSliderPointerUp)
})

onUnmounted(() => {
  window.removeEventListener('pointerup', onSliderPointerUp)
})
</script>

<template>
  <div class="preview-progress" :class="variant">
    <span class="time current">{{ formatTime(currentTime) }}</span>
    <div class="slider-wrapper">
      <Slider
        v-model:value="internalPercent"
        :max="100"
        :step="0.1"
        class="progress-slider"
        @pointerdown="onSliderPointerDown"
        @update:value="onSliderUpdate"
      />
    </div>
    <span class="time duration">{{ formatTime(duration) }}</span>
  </div>
</template>

<style scoped>
.preview-progress {
  @apply flex items-center gap-3;
}

.preview-progress.overlay {
  @apply gap-2;
}

.time {
  @apply text-xs font-mono w-10 text-center;
  color: var(--color-muted);
}

.overlay .time {
  @apply w-8;
  color: rgba(255, 255, 255, 0.88);
  font-size: 10px;
}

.time.current {
  color: var(--color-primary);
}

.overlay .time.current {
  color: white;
}

.slider-wrapper {
  @apply flex-1 cursor-pointer;
}

.progress-slider {
  @apply w-full cursor-pointer;
}

.progress-slider :deep(.ant-slider-rail),
.progress-slider :deep(.ant-slider-track) {
  height: 4px;
  border-radius: 999px;
}

.progress-slider :deep(.ant-slider-rail) {
  background: var(--border-primary-20);
}

.progress-slider :deep(.ant-slider-track) {
  background: var(--color-primary);
}

.progress-slider :deep(.ant-slider-handle::after) {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.overlay .progress-slider :deep(.ant-slider-rail) {
  background: rgba(255, 255, 255, 0.38);
}

.overlay .progress-slider :deep(.ant-slider-track) {
  background: var(--color-white);
}

.overlay .progress-slider :deep(.ant-slider-handle::after) {
  background: var(--color-white);
  box-shadow: 0 0 0 2px var(--color-white);
}
</style>
