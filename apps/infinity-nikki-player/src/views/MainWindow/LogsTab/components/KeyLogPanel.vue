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
  background: var(--bg-white-90);
  border: 1px solid var(--border-primary-15);
}

.panel-header {
  @apply flex items-center justify-between px-5 py-4;
  border-bottom: 1px solid var(--border-primary-10);
}

.header-title {
  @apply flex items-center gap-2 text-sm font-medium;
  color: var(--color-muted-dark);
}

.header-actions {
  @apply flex items-center gap-3;
}

.log-count {
  @apply text-xs font-mono;
  color: var(--color-muted);
}

.clear-btn {
  color: var(--color-primary);
  @apply text-xs;
}

.clear-btn:hover {
  color: var(--color-primary);
  background: var(--bg-primary-10);
}

.log-list {
  @apply flex-1 overflow-auto p-4 space-y-2;
}

.log-entry {
  @apply grid grid-cols-[auto_auto_auto_auto_1fr] gap-3 items-center px-4 py-3 rounded-xl;
  transition: all 0.15s;
}

.log-entry.press {
  background: var(--bg-success-08);
  border: 1px solid var(--bg-success-15);
}

.log-entry.release {
  background: var(--bg-primary-04);
  border: 1px solid var(--border-primary-10);
}

.time {
  @apply text-xs font-mono;
  color: var(--color-muted);
}

.pitch {
  @apply text-sm font-mono font-medium;
  color: var(--color-primary);
}

.arrow {
  color: var(--color-primary);
}

.key {
  @apply text-lg font-bold font-mono;
  color: var(--color-muted-dark);
}

.action-badge {
  @apply justify-self-end px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider;
}

.action-badge.press {
  background: var(--bg-success-08);
  color: var(--color-success);
}

.action-badge.release {
  background: var(--bg-primary-10);
  color: var(--color-primary);
}

.empty-state {
  @apply flex flex-col items-center justify-center gap-3 py-16;
  color: var(--color-muted);
}

.empty-icon {
  @apply w-12 h-12 rounded-xl flex items-center justify-center;
  background: var(--bg-primary-10);
  color: var(--color-primary);
}

.empty-state span {
  @apply text-sm;
}
</style>
