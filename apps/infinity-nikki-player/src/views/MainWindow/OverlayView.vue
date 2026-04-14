<script setup lang="ts">
/**
 * @description: 悬浮模式视图 - 可悬浮于游戏界面上方的播放器
 * 支持迷你悬浮条和展开面板两种形态
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { KeyboardMapper } from '@/lib/keyboardMapper'
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Square,
  ChevronDown,
  ChevronUp,
  X,
  VolumeX,
  Volume2,
} from 'lucide-vue-next'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

/** 键盘映射器实例 */
const keyboardMapper = ref<KeyboardMapper | null>(null)

/** 倒计时秒数（悬浮模式播放/恢复时延迟） */
const countdown = ref(0)

/** 倒计时定时器 */
let countdownTimer: number | null = null

/** 开始倒计时播放 */
function startWithCountdown() {
  // 清除之前的定时器
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  countdown.value = 3
  countdownTimer = window.setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      countdown.value = 0
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
      // 倒计时结束，开始播放
      playerStore.startPreview()
    }
  }, 1000)
}

/** 恢复播放（带倒计时） */
function resumeWithCountdown() {
  // 清除之前的定时器
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  countdown.value = 3
  countdownTimer = window.setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      countdown.value = 0
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
      // 倒计时结束，恢复播放
      playerStore.resumePreviewPlayback()
    }
  }, 1000)
}

/** 取消倒计时 */
function cancelCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  countdown.value = 0
}

/** 播放/暂停切换 */
function togglePlay() {
  if (playerStore.isPreviewPaused) {
    // 暂停状态 -> 恢复播放（带倒计时）
    resumeWithCountdown()
  } else if (playerStore.isPreviewPlaying) {
    // 播放状态 -> 暂停
    playerStore.pausePreviewPlayback()
  } else {
    // 空闲状态 -> 开始播放（带倒计时）
    startWithCountdown()
  }
}

/** 初始化键盘映射器 */
function initKeyboardMapper() {
  const template = settingsStore.getCurrentTemplate()
  if (template) {
    if (!keyboardMapper.value) {
      keyboardMapper.value = new KeyboardMapper()
      // 设置键盘模拟回调（悬浮模式强制启用）
      keyboardMapper.value.setKeyboardSimCallback((action, key) => {
        if ((settingsStore.enableKeyboardSim || settingsStore.isOverlayMode) && settingsStore.playMode === 'piano') {
          if (action === 'press') {
            invoke('simulate_key_down', { key }).catch(console.error)
          } else {
            invoke('simulate_key_up', { key }).catch(console.error)
          }
        }
      })
    }
    keyboardMapper.value.setTemplate(template)
  }
}

/** 监听活跃音符变化，同步到 KeyboardMapper */
watch(
  () => playerStore.activeNotes,
  (notes) => {
    if (settingsStore.playMode !== 'piano') return
    if (!keyboardMapper.value) return
    if (notes.length === 0) {
      keyboardMapper.value.clearKeyState(playerStore.previewCurrentTime)
    } else {
      keyboardMapper.value.setActiveNotes(notes, playerStore.previewCurrentTime)
    }
  }
)

/** 监听模板变化 */
watch(
  () => settingsStore.currentTemplateId,
  () => {
    if (playerStore.isPreviewPlaying) {
      playerStore.stopPreviewPlayback()
    }
    cancelCountdown()
    if (keyboardMapper.value) {
      keyboardMapper.value.reset()
    }
    initKeyboardMapper()
  }
)

/** 监听当前 MIDI 变化 */
watch(
  () => playerStore.currentMidi?.filename,
  () => {
    cancelCountdown()
    if (keyboardMapper.value) {
      keyboardMapper.value.reset()
    }
    initKeyboardMapper()
  }
)

onMounted(() => {
  initKeyboardMapper()
})

/** 开始拖拽 */
async function startDrag() {
  const window = getCurrentWindow()
  await window.startDragging()
}

/** 是否展开面板 */
const isExpanded = ref(false)

/** 切换展开/收起 */
async function toggleExpand() {
  isExpanded.value = !isExpanded.value
  const window = getCurrentWindow()
  const height = isExpanded.value ? 280.0 : 110.0
  await window.setSize(new LogicalSize(360, height))
}

/** 退出悬浮模式 */
async function exitOverlayMode() {
  try {
    settingsStore.isOverlayMode = false
    await invoke('exit_overlay_mode')
  } catch (e) {
    console.error('退出悬浮模式失败:', e)
  }
}

/** 播放指定 MIDI */
function playMidi(midi: any) {
  playerStore.selectMidi(midi)
  playerStore.startPreview()
}

/** 格式化时长 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

/** 获取模板显示名称 */
function getTemplateDisplayName(name: string, id: string): string {
  const builtinNames = t(`template.builtinNames.${id}` as any)
  return builtinNames && builtinNames !== `template.builtinNames.${id}` ? builtinNames : name
}

/** 当前 MIDI 信息 */
const currentMidiName = computed(() => playerStore.currentMidi?.filename || t('overlay.noFile'))

/** 播放状态 */
const isPlaying = computed(() => playerStore.isPreviewPlaying && !playerStore.isPreviewPaused)
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="overlay-view" :class="{ expanded: isExpanded }">
      <!-- 迷你悬浮条 - 整个区域可拖拽 -->
      <div class="mini-bar" @mousedown="startDrag">
        <!-- 曲目名称（走马灯效果）- 悬停显示全名 -->
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="track-info">
              <div class="marquee-wrapper">
                <div class="marquee-track">
                  <span class="marquee-text">{{ currentMidiName }}</span>
                  <span class="marquee-text" aria-hidden="true">{{ currentMidiName }}</span>
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {{ currentMidiName }}
          </TooltipContent>
        </Tooltip>
        <!-- 操作按钮 -->
        <div class="action-buttons">
          <!-- 模板选择 -->
          <select
            class="template-select"
            :value="settingsStore.currentTemplateId"
            @change="(e) => settingsStore.selectTemplate((e.target as HTMLSelectElement).value)"
          >
            <option v-for="tmpl in settingsStore.templates" :key="tmpl.id" :value="tmpl.id">
              {{ getTemplateDisplayName(tmpl.name, tmpl.id) }}
            </option>
          </select>

          <!-- 关闭 -->
          <Tooltip>
            <TooltipTrigger as-child>
              <button class="ctrl-btn close" @click.stop="exitOverlayMode">
                <X :size="16" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ t('overlay.close') }}
            </TooltipContent>
          </Tooltip>
        </div>
        <!-- 播放控制 -->
        <div class="playback-controls">
          <Tooltip>
            <TooltipTrigger as-child>
              <button class="ctrl-btn" @click.stop="playerStore.playPrev">
                <SkipBack :size="16" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ t('overlay.playPrev') }}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <button class="ctrl-btn play" @click.stop="togglePlay">
                <!-- 倒计时状态 -->
                <span v-if="countdown > 0" class="countdown-text">{{ countdown }}</span>
                <!-- 暂停状态 -->
                <Pause v-else-if="isPlaying" :size="18" />
                <!-- 空闲状态 -->
                <Play v-else :size="18" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ isPlaying ? t('player.pause') : t('player.play') }}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <button class="ctrl-btn" @click.stop="playerStore.playNext">
                <SkipForward :size="16" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ t('overlay.playNext') }}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <button
                class="ctrl-btn"
                @click.stop="cancelCountdown(); playerStore.stopPreviewPlayback()"
              >
                <Square :size="14" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ t('overlay.stop') }}
            </TooltipContent>
          </Tooltip>

          <!-- 静音 -->
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                class="ctrl-btn"
                :class="{ active: playerStore.isPreviewMuted }"
                @click.stop="playerStore.toggleMute()"
              >
                <VolumeX v-if="playerStore.isPreviewMuted" :size="16" />
                <Volume2 v-else :size="16" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ playerStore.isPreviewMuted ? t('overlay.unmute') : t('overlay.mute') }}
            </TooltipContent>
          </Tooltip>

          <!-- 展开/收起 -->
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                class="ctrl-btn justify-self-end"
                :class="{ active: isExpanded }"
                @click.stop="toggleExpand"
              >
                <ChevronUp v-if="isExpanded" :size="16" />
                <ChevronDown v-else :size="16" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ isExpanded ? t('overlay.collapse') : t('overlay.expand') }}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <!-- 展开面板 -->
      <div v-if="isExpanded" class="expand-panel">
        <div class="playlist">
          <div
            v-for="midi in playerStore.midiLibrary"
            :key="midi.filename"
            class="playlist-item"
            :class="{ active: playerStore.currentMidi?.filename === midi.filename }"
            @click="playMidi(midi)"
          >
            <Tooltip>
              <TooltipTrigger as-child>
                <span class="playlist-name">{{ midi.filename }}</span>
              </TooltipTrigger>
              <TooltipContent>
                {{ midi.filename }}
              </TooltipContent>
            </Tooltip>
            <span class="playlist-duration">{{ formatDuration(midi.duration_ms) }}</span>
          </div>
          <div v-if="playerStore.midiLibrary.length === 0" class="playlist-empty">
            {{ t('midi.libraryEmpty') }}
          </div>
        </div>
      </div>
    </div>
  </TooltipProvider>
</template>

<style scoped>
.overlay-view {
  @apply flex flex-col overflow-hidden;
  border-radius: 16px;
}

/* 迷你悬浮条 */
.mini-bar {
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  background: linear-gradient(135deg, rgba(247, 192, 193, 0.8) 0%, rgba(245, 184, 192, 0.8) 100%);
  cursor: move;
  user-select: none;
}

/* 交互元素保持可点击 */
.playback-controls {
  grid-column: 1 / -1;
}


.track-info {
  min-width: 0;
  overflow: hidden;
}

.marquee-wrapper {
  overflow: hidden;
  position: relative;
}

.marquee-track {
  display: flex;
  width: max-content;
  animation: marquee-scroll 8s linear infinite;
}

.marquee-text {
  @apply text-sm text-white whitespace-nowrap;
  padding-right: 50px;
  user-select: none;
}

.marquee-wrapper:hover .marquee-track {
  animation-play-state: paused;
}

@keyframes marquee-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.playback-controls {
  @apply flex justify-center items-center gap-1;
}

.ctrl-btn {
  @apply w-8 h-8 flex items-center justify-center rounded-lg text-white/90;
  @apply transition-colors;
  background: transparent;
}

.ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.ctrl-btn.play {
  @apply w-10 h-10 rounded-full text-white;
  background: rgba(255, 255, 255, 0.3);
}

.ctrl-btn.play:hover {
  background: rgba(255, 255, 255, 0.4);
}

.countdown-text {
  @apply text-sm font-bold;
  color: white;
}

.ctrl-btn.active {
  background: rgba(255, 255, 255, 0.4);
  color: white;
}

.ctrl-btn.close:hover {
  background: rgba(239, 68, 68, 0.6);
  color: white;
}

.action-buttons {
  @apply flex justify-end items-center gap-1;
}

.template-select {
  @apply h-8 px-2 rounded-lg text-sm text-white;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  outline: none;
  cursor: pointer;
}

.template-select option {
  color: #4a3f3f;
  background: white;
}

/* 展开面板 */
.expand-panel {
  @apply flex-1 overflow-hidden;
  background: rgba(255, 255, 255, 0.92);
}

.playlist {
  @apply h-full overflow-y-auto py-2;
}

.playlist-item {
  @apply flex items-center justify-between px-4 py-2 cursor-pointer;
}

.playlist-item:hover {
  background: rgba(247, 192, 193, 0.1);
}

.playlist-item.active {
  background: rgba(247, 192, 193, 0.2);
}

.playlist-name {
  @apply text-sm text-gray-700 truncate flex-1 mr-3;
}

.playlist-duration {
  @apply text-xs text-gray-400 font-mono;
}

.playlist-empty {
  @apply px-4 py-8 text-center text-gray-400 text-sm;
}
</style>
