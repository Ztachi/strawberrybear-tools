<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { Button } from '@/components/ui'
import { Play, Pause, Square, Minus, Plus } from 'lucide-vue-next'

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

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
        {{ settingsStore.getCurrentTemplate()?.name || t('player.noTemplate') }}
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
  background: var(--bg-white-90);
  border: 1px solid var(--border-primary-20);
  box-shadow: var(--shadow-pink-card);
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
  background: var(--color-primary);
}

.status-indicator.playing .indicator-dot {
  background: var(--color-success);
}

.status-indicator.playing .indicator-glow {
  background: var(--bg-success-30);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-indicator.paused .indicator-dot {
  background: var(--color-warning);
}

.status-indicator.paused .indicator-glow {
  background: var(--bg-warning-20);
}

.status-text {
  @apply text-sm font-medium;
  color: var(--color-muted-dark);
}

.template-badge {
  @apply ml-auto px-3 py-1 rounded-full text-xs font-medium;
  background: var(--bg-primary-15);
  color: var(--color-primary);
  border: 1px solid var(--border-primary-20);
}

.controls-bar {
  @apply flex items-center gap-3;
}

.play-btn {
  @apply flex-1 gap-2 h-12 text-base font-semibold;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%) !important;
  color: var(--color-white) !important;
  box-shadow: 0 4px 16px var(--bg-primary-15);
}

.play-btn :deep(svg) {
  color: var(--color-white);
}

.play-btn:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}

.stop-btn {
  @apply gap-2 h-12 px-6;
  color: var(--color-primary);
  border-color: var(--border-primary-20);
}

.stop-btn:hover:not(:disabled) {
  background: var(--bg-primary-10);
}

.speed-control {
  @apply flex items-center gap-1 px-3 py-2 rounded-xl;
  background: var(--bg-primary-08);
  border: 1px solid var(--border-primary-15);
}

.speed-btn {
  @apply w-8 h-8 rounded-lg flex items-center justify-center;
  color: var(--color-primary);
  transition: all 0.2s;
}

.speed-btn:hover {
  background: var(--bg-primary-10);
}

.speed-value {
  @apply min-w-[3rem] text-center text-sm font-mono font-medium;
  color: var(--color-muted-dark);
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
