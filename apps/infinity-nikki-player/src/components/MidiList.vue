<script setup lang="ts">
import type { MidiInfo } from '@/types'

defineProps<{
  list: MidiInfo[]
  current: MidiInfo | null
}>()

const emit = defineEmits<{
  select: [midi: MidiInfo]
}>()

/** 格式化时长 */
function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="midi-list">
    <div
      v-for="midi in list"
      :key="midi.filename"
      :class="['midi-item', { active: current?.filename === midi.filename }]"
      @click="emit('select', midi)"
    >
      <span class="filename">{{ midi.filename }}</span>
      <span class="info"> {{ formatDuration(midi.duration_ms) }} | {{ midi.track_count }} 轨 </span>
    </div>
    <div v-if="list.length === 0" class="empty">暂无 MIDI 文件</div>
  </div>
</template>

<style scoped>
.midi-list {
  @apply space-y-2 max-h-64 overflow-auto;
}

.midi-item {
  @apply p-3 bg-gray-800 rounded cursor-pointer
         hover:bg-gray-700 transition-colors;
}

.midi-item.active {
  @apply bg-pink-400/20 border border-pink-400;
}

.filename {
  @apply block font-medium truncate;
}

.info {
  @apply text-xs text-gray-500;
}

.empty {
  @apply text-center text-gray-500 py-8;
}
</style>
