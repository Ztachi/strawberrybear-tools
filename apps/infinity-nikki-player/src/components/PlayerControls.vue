<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'

const playerStore = usePlayerStore()

const statusText = computed(() => {
  switch (playerStore.playbackState.status) {
    case 'playing':
      return '播放中'
    case 'paused':
      return '已暂停'
    default:
      return '空闲'
  }
})

const isPlaying = computed(() => playerStore.playbackState.status === 'playing')
const isPaused = computed(() => playerStore.playbackState.status === 'paused')
const isIdle = computed(() => playerStore.playbackState.status === 'idle')

/** 播放/暂停切换 */
async function togglePlay() {
  if (isPlaying.value) {
    await playerStore.pausePlayback()
  } else if (isPaused.value) {
    await playerStore.resumePlayback()
  } else if (playerStore.currentMidi) {
    playerStore.startLogPolling()
    await playerStore.startPlayback(playerStore.currentMidi.filename)
  }
}

/** 停止 */
async function stop() {
  await playerStore.stopPlayback()
  playerStore.stopLogPolling()
}

/** 速度调整 */
async function adjustSpeed(delta: number) {
  const newSpeed = Math.max(0.5, Math.min(2.0, playerStore.speed + delta))
  await playerStore.setSpeed(newSpeed)
}
</script>

<template>
  <div class="player-controls">
    <div class="status">
      <span class="status-indicator" :class="playerStore.playbackState.status" />
      <span>{{ statusText }}</span>
    </div>

    <div class="controls">
      <button class="btn-play" :disabled="!playerStore.currentMidi" @click="togglePlay">
        {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
      </button>
      <button class="btn-stop" :disabled="isIdle" @click="stop">⏹ 停止</button>
    </div>

    <div class="speed-control">
      <span class="label">速度:</span>
      <button class="btn-adjust" @click="adjustSpeed(-0.1)">-</button>
      <span class="speed">{{ playerStore.speed.toFixed(1) }}x</span>
      <button class="btn-adjust" @click="adjustSpeed(0.1)">+</button>
    </div>

    <div v-if="playerStore.currentMidi" class="progress-info">
      <span>模板: {{ playerStore.currentTemplate?.name || '未选择' }}</span>
    </div>
  </div>
</template>

<style scoped>
.player-controls {
  @apply p-4 bg-gray-800 rounded-lg space-y-4;
}

.status {
  @apply flex items-center gap-2;
}

.status-indicator {
  @apply w-3 h-3 rounded-full;
}

.status-indicator.idle {
  @apply bg-gray-500;
}

.status-indicator.playing {
  @apply bg-green-500;
}

.status-indicator.paused {
  @apply bg-yellow-500;
}

.controls {
  @apply flex gap-4;
}

.btn-play {
  @apply flex-1 py-3 bg-pink-400 rounded font-semibold
         hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed
         transition-colors;
}

.btn-stop {
  @apply px-6 py-3 bg-gray-700 rounded font-semibold
         hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed
         transition-colors;
}

.speed-control {
  @apply flex items-center gap-2;
}

.label {
  @apply text-gray-400;
}

.btn-adjust {
  @apply w-8 h-8 bg-gray-700 rounded hover:bg-gray-600 transition-colors;
}

.speed {
  @apply min-w-[4rem] text-center font-mono;
}

.progress-info {
  @apply text-sm text-gray-500;
}
</style>
