<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { Button } from '@/components/ui'
import { Play, Pause, Square, Minus, Plus } from 'lucide-vue-next'

const { t } = useI18n()
const playerStore = usePlayerStore()

const statusText = computed(() => {
  switch (playerStore.playbackState.status) {
    case 'playing':
      return t('player.status.playing')
    case 'paused':
      return t('player.status.paused')
    default:
      return t('player.status.idle')
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
    await playerStore.startPlayback()
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
    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-indicator" :class="playerStore.playbackState.status">
        <span class="indicator-dot" />
        <span class="indicator-glow" />
      </div>
      <span class="status-text">{{ statusText }}</span>
      <span v-if="playerStore.currentMidi" class="template-badge">
        {{ playerStore.currentTemplate?.name || t('player.noTemplate') }}
      </span>
    </div>

    <!-- 控制按钮 -->
    <div class="controls-bar">
      <Button
        :variant="isPlaying ? 'secondary' : 'default'"
        class="play-btn"
        :disabled="!playerStore.currentMidi"
        @click="togglePlay"
      >
        <Pause v-if="isPlaying" :size="20" />
        <Play v-else :size="20" />
        {{ isPlaying ? t('player.pause') : t('player.play') }}
      </Button>

      <Button variant="outline" class="stop-btn" :disabled="isIdle" @click="stop">
        <Square :size="18" />
        {{ t('player.stop') }}
      </Button>

      <!-- 速度控制 -->
      <div class="speed-control">
        <button class="speed-btn" @click="adjustSpeed(-0.1)">
          <Minus :size="14" />
        </button>
        <span class="speed-value">{{ playerStore.speed.toFixed(1) }}x</span>
        <button class="speed-btn" @click="adjustSpeed(0.1)">
          <Plus :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-controls {
  @apply rounded-2xl p-5;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(247, 192, 193, 0.2);
  box-shadow: 0 2px 12px rgba(247, 192, 193, 0.08);
}

.status-bar {
  @apply flex items-center gap-3 mb-4;
}

.status-indicator {
  @apply relative w-8 h-8 flex items-center justify-center;
}

.indicator-dot {
  @apply w-3 h-3 rounded-full z-10;
}

.indicator-glow {
  @apply absolute inset-0 rounded-full;
}

.status-indicator.idle .indicator-dot {
  @apply bg-pink-300;
}

.status-indicator.playing .indicator-dot {
  @apply bg-green-500;
}

.status-indicator.playing .indicator-glow {
  background: rgba(74, 222, 128, 0.3);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-indicator.paused .indicator-dot {
  @apply bg-yellow-500;
}

.status-indicator.paused .indicator-glow {
  background: rgba(250, 204, 21, 0.2);
}

.status-text {
  @apply text-sm font-medium;
  color: #6b5a5a;
}

.template-badge {
  @apply ml-auto px-3 py-1 rounded-full text-xs font-medium;
  background: rgba(247, 192, 193, 0.15);
  color: #d88a8a;
  border: 1px solid rgba(247, 192, 193, 0.2);
}

.controls-bar {
  @apply flex items-center gap-3;
}

.play-btn {
  @apply flex-1 gap-2 h-12 text-base font-semibold;
  background: linear-gradient(135deg, #f7c0c1 0%, #f5b8c0 100%) !important;
  @apply text-pink-900;
  box-shadow: 0 4px 16px rgba(247, 192, 193, 0.3);
}

.play-btn:hover:not(:disabled) {
  @apply opacity-95;
  transform: translateY(-1px);
}

.stop-btn {
  @apply gap-2 h-12 px-6;
  @apply text-pink-600 border-pink-200;
}

.stop-btn:hover:not(:disabled) {
  @apply bg-pink-50;
}

.speed-control {
  @apply flex items-center gap-1 px-3 py-2 rounded-xl;
  background: rgba(247, 192, 193, 0.08);
  border: 1px solid rgba(247, 192, 193, 0.15);
}

.speed-btn {
  @apply w-8 h-8 rounded-lg flex items-center justify-center;
  @apply text-pink-400 transition-all;
}

.speed-btn:hover {
  @apply bg-pink-100;
}

.speed-value {
  @apply min-w-[3rem] text-center text-sm font-mono font-medium;
  color: #6b5a5a;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}
</style>
