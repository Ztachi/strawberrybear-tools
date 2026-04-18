<script setup lang="ts">
/**
 * @description: 按键日志面板组件
 * @description 显示游戏内演奏时的按键日志记录，支持实时查看按键动作历史
 */
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { Button } from '@/components/ui'
import { FileText, ArrowRight, Keyboard } from 'lucide-vue-next'

const { t } = useI18n()
const playerStore = usePlayerStore()

/**
 * @description: 将 MIDI 音符号转换为音名
 * @param {number} pitch - MIDI 音符号 (0-127)
 * @return {string} 音名（如 "C4"、"F#5"）
 */
function pitchToName(pitch: number) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  const note = notes[pitch % 12]
  return `${note}${octave}`
}

/**
 * @description: 格式化时间戳
 * @param {number} timestamp - Unix 时间戳（毫秒）
 * @return {string} 本地化时间字符串
 */
function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}
</script>

<template>
  <div class="key-log-panel">
    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="header-title">
        <FileText :size="18" />
        <span>{{ t('log.title') }}</span>
      </div>
      <div class="header-actions">
        <!-- 日志数量 -->
        <span class="log-count">{{ t('log.count', { count: playerStore.keyLogs.length }) }}</span>
        <!-- 清空按钮 -->
        <Button variant="ghost" size="sm" class="clear-btn" @click="playerStore.clearLogs()">
          {{ t('actions.clear') }}
        </Button>
      </div>
    </div>

    <!-- 日志列表 -->
    <div class="log-list">
      <!-- 遍历每个日志条目 -->
      <div
        v-for="entry in playerStore.keyLogs"
        :key="entry.id"
        :class="['log-entry', entry.action]"
      >
        <!-- 时间 -->
        <span class="time">{{ formatTime(entry.timestamp) }}</span>
        <!-- 音高 -->
        <span class="pitch">{{ pitchToName(entry.pitch) }}</span>
        <!-- 箭头 -->
        <ArrowRight :size="12" class="arrow" />
        <!-- 映射的按键 -->
        <span class="key">{{ entry.mapped_key }}</span>
        <!-- 动作徽章 -->
        <span :class="['action-badge', entry.action]">
          {{ entry.action === 'press' ? t('log.action.press') : t('log.action.release') }}
        </span>
      </div>

      <!-- 空状态 -->
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

/* 按下状态样式 */
.log-entry.press {
  background: var(--bg-success-08);
  border: 1px solid var(--bg-success-15);
}

/* 释放状态样式 */
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
