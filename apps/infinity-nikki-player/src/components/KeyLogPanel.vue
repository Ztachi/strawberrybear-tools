<script setup lang="ts">
import { usePlayerStore } from '@/stores/player'

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
    <div class="log-header">
      <span>按键日志</span>
      <span class="count">{{ playerStore.keyLogs.length }}/50</span>
      <button class="btn-clear" @click="playerStore.clearLogs()">清空</button>
    </div>

    <div class="log-list">
      <div
        v-for="entry in playerStore.keyLogs"
        :key="entry.id"
        :class="['log-entry', entry.action]"
      >
        <span class="time">{{ formatTime(entry.timestamp) }}</span>
        <span class="pitch">{{ pitchToName(entry.pitch) }}</span>
        <span class="arrow">-&gt;</span>
        <span class="key">{{ entry.mapped_key }}</span>
        <span
          :class="['action', entry.action]"
          >{{ entry.action === 'press' ? '按下' : '释放' }}</span
        >
      </div>

      <div v-if="playerStore.keyLogs.length === 0" class="empty">暂无按键日志</div>
    </div>
  </div>
</template>

<style scoped>
.key-log-panel {
  @apply flex flex-col h-full;
}

.log-header {
  @apply flex items-center gap-4 pb-4 border-b border-gray-700;
}

.log-header span:first-child {
  @apply font-semibold;
}

.count {
  @apply text-sm text-gray-500;
}

.btn-clear {
  @apply ml-auto px-3 py-1 text-sm bg-gray-700 rounded
         hover:bg-gray-600 transition-colors;
}

.log-list {
  @apply flex-1 overflow-auto py-4 space-y-1;
}

.log-entry {
  @apply grid grid-cols-[5rem_3rem_2rem_2rem_4rem] gap-2 items-center
         px-3 py-2 rounded;
}

.log-entry.press {
  @apply bg-green-900/30;
}

.log-entry.release {
  @apply bg-gray-800/50;
}

.time {
  @apply text-xs text-gray-500 font-mono;
}

.pitch {
  @apply text-sm font-mono text-pink-400;
}

.arrow {
  @apply text-gray-600;
}

.key {
  @apply text-lg font-bold font-mono;
}

.action {
  @apply text-xs uppercase;
}

.action.press {
  @apply text-green-400;
}

.action.release {
  @apply text-gray-500;
}

.empty {
  @apply text-center text-gray-500 py-12;
}
</style>
