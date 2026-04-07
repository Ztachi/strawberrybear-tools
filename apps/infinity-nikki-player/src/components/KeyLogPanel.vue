<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { Button } from '@/components/ui'
import { FileText, ArrowRight, Keyboard } from 'lucide-vue-next'

const { t } = useI18n()
const playerStore = usePlayerStore()

/** 音高转音名 */
function pitchToName(pitch: number) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  const note = notes[pitch % 12]
  return `${note}${octave}`
}

/** 格式化时间 */
function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}
</script>

<template>
  <div class="key-log-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-title">
        <FileText :size="18" />
        <span>{{ t('log.title') }}</span>
      </div>
      <div class="header-actions">
        <span class="log-count">{{ t('log.count', { count: playerStore.keyLogs.length }) }}</span>
        <Button variant="ghost" size="sm" class="clear-btn" @click="playerStore.clearLogs()">
          {{ t('actions.clear') }}
        </Button>
      </div>
    </div>

    <!-- 日志列表 -->
    <div class="log-list">
      <div
        v-for="entry in playerStore.keyLogs"
        :key="entry.id"
        :class="['log-entry', entry.action]"
      >
        <span class="time">{{ formatTime(entry.timestamp) }}</span>
        <span class="pitch">{{ pitchToName(entry.pitch) }}</span>
        <ArrowRight :size="12" class="arrow" />
        <span class="key">{{ entry.mapped_key }}</span>
        <span :class="['action-badge', entry.action]">
          {{ entry.action === 'press' ? t('log.action.press') : t('log.action.release') }}
        </span>
      </div>

      <div v-if="playerStore.keyLogs.length === 0" class="empty-state">
        <div class="empty-icon">
          <Keyboard :size="24" />
        </div>
        <span>{{ t('log.empty') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.key-log-panel {
  @apply h-full flex flex-col rounded-2xl;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(247, 192, 193, 0.15);
}

.panel-header {
  @apply flex items-center justify-between px-5 py-4 border-b;
  border-color: rgba(247, 192, 193, 0.1) !important;
}

.header-title {
  @apply flex items-center gap-2 text-sm font-medium;
  color: #6b5a5a;
}

.header-actions {
  @apply flex items-center gap-3;
}

.log-count {
  @apply text-xs font-mono;
  color: #a89a9a;
}

.clear-btn {
  @apply text-pink-400 text-xs;
}

.clear-btn:hover {
  @apply text-pink-500 bg-pink-50;
}

.log-list {
  @apply flex-1 overflow-auto p-4 space-y-2;
}

.log-entry {
  @apply grid grid-cols-[auto_auto_auto_auto_1fr] gap-3 items-center px-4 py-3 rounded-xl;
  @apply transition-all duration-150;
}

.log-entry.press {
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.15);
}

.log-entry.release {
  background: rgba(247, 192, 193, 0.04);
  border: 1px solid rgba(247, 192, 193, 0.08);
}

.time {
  @apply text-xs font-mono;
  color: #a89a9a;
}

.pitch {
  @apply text-sm font-mono font-medium;
  color: #d88a8a;
}

.arrow {
  @apply text-pink-300;
}

.key {
  @apply text-lg font-bold font-mono;
  color: #6b5a5a;
}

.action-badge {
  @apply justify-self-end px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider;
}

.action-badge.press {
  @apply bg-green-100 text-green-600;
}

.action-badge.release {
  @apply bg-pink-50 text-pink-400;
}

.empty-state {
  @apply flex flex-col items-center justify-center gap-3 py-16;
  color: #a89a9a;
}

.empty-icon {
  @apply w-12 h-12 rounded-xl flex items-center justify-center;
  background: rgba(247, 192, 193, 0.1);
  color: rgba(247, 192, 193, 0.4);
}

.empty-state span {
  @apply text-sm;
}
</style>
