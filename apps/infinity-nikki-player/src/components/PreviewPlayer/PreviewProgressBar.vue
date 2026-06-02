<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Slider } from '@/components/ui/slider'

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

const internalPercentArray = ref<[number]>([0])
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

function onSliderUpdate(value: number[] | undefined) {
  if (!value) return
  internalPercentArray.value = [value[0]]
  if (isDragging.value) {
    emit('preview', percentToTime(value[0]))
  }
}

function onSliderPointerUp() {
  if (!isDragging.value) return
  const time = percentToTime(internalPercentArray.value[0])
  isDragging.value = false
  emit('dragging', false)
  emit('seek', time)
}

watch(currentPercent, (newVal) => {
  if (!isDragging.value) {
    internalPercentArray.value = [newVal]
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
        v-model="internalPercentArray"
        :max="100"
        :step="0.1"
        class="progress-slider"
        @pointerdown="onSliderPointerDown"
        @update:model-value="onSliderUpdate"
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
</style>
