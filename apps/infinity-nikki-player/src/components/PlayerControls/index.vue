<script setup lang="ts">
/**
 * @description: 演奏控制组件
 * @description 提供游戏内演奏的播放控制界面，包括播放/暂停、停止、速度调节等功能
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { Button } from '@/components/ui'
import { Play, Pause, Square, Minus, Plus } from 'lucide-vue-next'

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

/** 状态文本 @return {string} 根据播放状态返回对应的本地化文本 */
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

/** 是否正在播放 @return {boolean} */
const isPlaying = computed(() => playerStore.playbackState.status === 'playing')
/** 是否已暂停 @return {boolean} */
const isPaused = computed(() => playerStore.playbackState.status === 'paused')
/** 是否空闲 @return {boolean} */
const isIdle = computed(() => playerStore.playbackState.status === 'idle')

/**
 * @description: 切换播放/暂停状态
 * 根据当前状态调用 playerStore 的不同方法
 */
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

/**
 * @description: 停止播放
 * 停止播放并停止日志轮询
 */
async function stop() {
  await playerStore.stopPlayback()
  playerStore.stopLogPolling()
}

/**
 * @description: 调整播放速度
 * @param {number} delta - 速度变化量（正数加速，负数减速）
 * 速度范围限制在 0.5x - 2.0x
 */
async function adjustSpeed(delta: number) {
  const newSpeed = Math.max(0.5, Math.min(2.0, playerStore.speed + delta))
  await playerStore.setSpeed(newSpeed)
}
</script>

<template>
  <div class="player-controls">
    <!-- 状态栏 -->
    <div class="status-bar">
      <!-- 状态指示器 -->
      <div class="status-indicator" :class="playerStore.playbackState.status">
        <span class="indicator-dot" />
        <span class="indicator-glow" />
      </div>
      <!-- 状态文本 -->
      <span class="status-text">{{ statusText }}</span>
      <!-- 当前模板徽章 -->
      <span v-if="playerStore.currentMidi" class="template-badge">
        {{ settingsStore.getCurrentTemplate()?.name || t('player.noTemplate') }}
      </span>
    </div>

    <!-- 控制按钮 -->
    <div class="controls-bar">
      <!-- 播放/暂停按钮 -->
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

      <!-- 停止按钮 -->
      <Button variant="outline" class="stop-btn" :disabled="isIdle" @click="stop">
        <Square :size="18" />
        {{ t('player.stop') }}
      </Button>

      <!-- 速度控制 -->
      <div class="speed-control">
        <!-- 减速按钮 -->
        <button class="speed-btn" @click="adjustSpeed(-0.1)">
          <Minus :size="14" />
        </button>
        <!-- 当前速度显示 -->
        <span class="speed-value">{{ playerStore.speed.toFixed(1) }}x</span>
        <!-- 加速按钮 -->
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
