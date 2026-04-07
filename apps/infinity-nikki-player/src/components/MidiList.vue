<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MidiInfo } from '@/types'

defineProps<{
  list: MidiInfo[]
  current: MidiInfo | null
}>()

const emit = defineEmits<{
  select: [midi: MidiInfo]
}>()

const { t } = useI18n()

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
      <div class="item-icon">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <div class="item-info">
        <span class="filename">{{ midi.filename }}</span>
        <span class="meta"
          >{{ formatDuration(midi.duration_ms) }} · {{ midi.track_count }}
          {{ t('midi.tracks') }}</span
        >
      </div>
      <div class="item-arrow">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
    <div v-if="list.length === 0" class="empty-state glass">
      <div class="empty-icon">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <span class="empty-text">{{ t('midi.noFiles') }}</span>
    </div>
  </div>
</template>

<style scoped>
.midi-list {
  @apply space-y-3;
}

.midi-item {
  @apply flex items-center gap-4 p-4 rounded-xl cursor-pointer;
  @apply transition-all duration-200;
  background: rgba(20, 20, 25, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.midi-item:hover {
  background: rgba(30, 30, 35, 0.5);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.midi-item.active {
  background: rgba(247, 192, 193, 0.1) !important;
  border-color: rgba(247, 192, 193, 0.3) !important;
}

.item-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0;
  background: rgba(247, 192, 193, 0.1);
  color: #f7c0c1;
}

.item-info {
  @apply flex-1 min-w-0;
}

.filename {
  @apply block text-sm font-medium text-white truncate;
}

.meta {
  @apply text-xs text-white/50 mt-0.5;
}

.item-arrow {
  @apply text-white/30;
  @apply opacity-0 transition-opacity;
}

.midi-item:hover .item-arrow,
.midi-item.active .item-arrow {
  @apply opacity-100;
}

.midi-item.active .item-arrow {
  @apply text-pink-400;
}

.empty-state {
  @apply flex flex-col items-center justify-center gap-4 py-12 rounded-2xl;
  background: rgba(20, 20, 25, 0.3) !important;
  border: 1px dashed rgba(255, 255, 255, 0.1) !important;
}

.empty-icon {
  @apply w-16 h-16 rounded-2xl flex items-center justify-center;
  background: rgba(247, 192, 193, 0.05);
  color: rgba(247, 192, 193, 0.5);
}

.empty-text {
  @apply text-sm text-white/40;
}
</style>
