<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { invoke } from '@tauri-apps/api/core'

const playerStore = usePlayerStore()
const isExpanded = ref(false)
const currentLang = ref('zh-CN')

/** 切换语言 */
function toggleLocale() {
  currentLang.value = currentLang.value === 'zh-CN' ? 'en-US' : 'zh-CN'
}

/** 切换展开/收起 */
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

/** 关闭悬浮窗口 */
async function closeOverlay() {
  try {
    await invoke('close_overlay_window')
  } catch (e) {
    console.error('关闭悬浮窗口失败:', e)
  }
}

/** 播放/暂停 */
async function togglePlay() {
  if (playerStore.playbackState.status === 'playing') {
    await playerStore.pausePlayback()
  } else if (playerStore.playbackState.status === 'paused') {
    await playerStore.resumePlayback()
  } else if (playerStore.currentMidi) {
    playerStore.startPlayback(playerStore.currentMidi.filename)
  }
}

/** 停止 */
async function stop() {
  await playerStore.stopPlayback()
}

/** 速度调整 */
async function adjustSpeed(delta: number) {
  const newSpeed = Math.max(0.5, Math.min(2.0, playerStore.speed + delta))
  await playerStore.setSpeed(newSpeed)
}

/** 最近的日志（最多 5 条） */
const recentLogs = computed(() => playerStore.keyLogs.slice(-5))
</script>

<template>
  <div class="overlay-window" :class="{ expanded: isExpanded }" data-tauri-drag-region>
    <!-- 拖拽区域 -->
    <div class="drag-region" data-tauri-drag-region>
      <div class="drag-content">
        <span class="midi-name" data-tauri-drag-region>
          {{ playerStore.playbackState.midi_name || '未选择文件' }}
        </span>
        <button class="btn-lang-small" @click.stop="toggleLocale">
          {{ currentLang === 'zh-CN' ? 'EN' : '中文' }}
        </button>
      </div>
    </div>

    <!-- 控制按钮（极简模式） -->
    <div v-if="!isExpanded" class="controls-mini">
      <button class="btn-icon" @click="togglePlay">
        {{ playerStore.playbackState.status === 'playing' ? '⏸' : '▶' }}
      </button>
      <button class="btn-icon" @click="stop">⏹</button>
      <span class="speed">{{ playerStore.speed.toFixed(1) }}x</span>
      <button class="btn-icon" @click="toggleExpand">⬆</button>
      <button class="btn-icon close" @click="closeOverlay">✕</button>
    </div>

    <!-- 展开模式 -->
    <div v-else class="controls-expanded">
      <div class="top-row">
        <div class="playback-controls">
          <button class="btn-icon" @click="togglePlay">
            {{ playerStore.playbackState.status === 'playing' ? '⏸' : '▶' }}
          </button>
          <button class="btn-icon" @click="stop">⏹</button>
        </div>
        <div class="speed-controls">
          <button class="btn-small" @click="adjustSpeed(-0.1)">-</button>
          <span class="speed">{{ playerStore.speed.toFixed(1) }}x</span>
          <button class="btn-small" @click="adjustSpeed(0.1)">+</button>
        </div>
        <button class="btn-icon" @click="toggleExpand">⬇</button>
        <button class="btn-icon close" @click="closeOverlay">✕</button>
      </div>

      <!-- 进度条 -->
      <div v-if="playerStore.currentMidi" class="progress">
        <div
          class="progress-bar"
          :style="{
            width: `${
              (playerStore.playbackState.current_tick /
                playerStore.currentMidi.duration_ms) *
              100
            }%`,
          }"
        />
      </div>

      <!-- 当前模板 -->
      <div v-if="playerStore.currentTemplate" class="template-name">
        {{ playerStore.currentTemplate.name }}
      </div>

      <!-- 最近按键日志 -->
      <div class="mini-log">
        <span v-for="log in recentLogs" :key="log.id" class="log-item" :class="log.action">
          {{ log.mapped_key }}
        </span>
        <span v-if="recentLogs.length === 0" class="log-empty"> 暂无按键 </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay-window {
  @apply bg-gray-900/95 text-white rounded-lg shadow-2xl;
  @apply border border-pink-400/30;
  width: 320px;
  transition: all 0.2s ease;
}

.overlay-window.expanded {
  width: 360px;
}

.drag-region {
  @apply p-2 cursor-move select-none;
  background-color: #F7C0C1;
  @apply rounded-t-lg;
}

.drag-content {
  @apply flex items-center justify-between;
}

.midi-name {
  @apply text-xs text-gray-700 truncate;
}

.btn-lang-small {
  @apply px-2 py-0.5 text-xs rounded border border-pink-500/50
         text-pink-600 hover:bg-pink-500/20 transition-colors;
}

.controls-mini {
  @apply flex items-center gap-2 px-2 pb-2;
}

.controls-expanded {
  @apply p-2 space-y-2;
}

.top-row {
  @apply flex items-center gap-2;
}

.playback-controls {
  @apply flex gap-1;
}

.speed-controls {
  @apply flex items-center gap-1 flex-1;
}

.speed {
  @apply text-xs text-gray-400 min-w-[3rem] text-center;
}

.btn-icon {
  @apply w-8 h-8 flex items-center justify-center rounded bg-gray-800
         hover:bg-gray-700 transition-colors text-lg;
}

.btn-icon.close {
  @apply text-red-400 hover:text-red-300;
}

.btn-small {
  @apply w-6 h-6 flex items-center justify-center rounded bg-gray-800
         hover:bg-gray-700 transition-colors text-sm;
}

.progress {
  @apply h-1 bg-gray-700 rounded overflow-hidden;
}

.progress-bar {
  @apply h-full bg-pink-400 transition-all;
}

.template-name {
  @apply text-xs text-gray-500;
}

.mini-log {
  @apply flex gap-1 flex-wrap;
}

.log-item {
  @apply px-2 py-0.5 rounded text-xs font-mono;
}

.log-item.press {
  @apply bg-green-600 text-white;
}

.log-item.release {
  @apply bg-gray-600 text-gray-300;
}

.log-empty {
  @apply text-xs text-gray-500;
}
</style>
