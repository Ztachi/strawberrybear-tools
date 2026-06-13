<script setup lang="ts">
// 悬浮模式视图组件 - 可悬浮于游戏界面上方的迷你播放器，支持展开/收起面板、播放控制、模板切换
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { KeyboardMapper } from '@/lib/keyboardMapper'
import {
  DEFAULT_PLAYBACK_FPS,
  ENABLE_ADAPTIVE_FPS_TIMING,
  createKeyboardTimingProfile,
} from '@/lib/keyboardTiming'
import type { MidiInfo } from '@/types'
import {
  setKeyboardEventCallback,
  setOnPlaybackStopCallback,
  setVolume as setMidiPreviewVolume,
} from '@/lib/midiPlayer'
import { ChevronDown, ChevronUp, Crosshair, X } from 'lucide-vue-next'
import { Tooltip } from 'antdv-next'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import PlaybackModeControl from '@/components/PlaybackModeControl.vue'
import PreviewProgressBar from '@/components/PreviewPlayer/PreviewProgressBar.vue'
import PreviewTransportControls from '@/components/PreviewPlayer/PreviewTransportControls.vue'
import OverlayFpsControl from './components/OverlayFpsControl.vue'

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

const OVERLAY_WIDTH = 360
const OVERLAY_COLLAPSED_HEIGHT = 156
const OVERLAY_EXPANDED_HEIGHT = 320

// 键盘映射器实例
const keyboardMapper = ref<KeyboardMapper | null>(null) as any

interface OverlayFpsControlExpose {
  startCountdownSampling: () => Promise<void>
  resolvePlaybackFps: () => Promise<number>
}

// 悬浮窗 FPS 控件实例，倒计时期间由父组件触发采样和锁定。
const fpsControl = ref<OverlayFpsControlExpose | null>(null)

// 悬浮层独立音量状态（与详情页的 previewVolume / isPreviewMuted 完全独立）
const overlayMuted = ref(true)
const overlayVolume = ref(1)
const detailVolumeBeforeOverlay = ref(1)
const detailMutedBeforeOverlay = ref(false)

function applyOverlayVolume() {
  setMidiPreviewVolume(overlayMuted.value ? 0 : overlayVolume.value)
}

function setOverlayVolume(value: number) {
  overlayVolume.value = Math.min(1, Math.max(0, value))
  if (overlayVolume.value > 0) {
    overlayMuted.value = false
  }
  applyOverlayVolume()
}

// 切换悬浮层静音状态
function toggleOverlayMute() {
  overlayMuted.value = !overlayMuted.value
  // 直接操作 midiPlayer 音量，不写入 playerStore
  applyOverlayVolume()
}

function muteOverlayFromDetailState() {
  detailVolumeBeforeOverlay.value = playerStore.previewVolume
  detailMutedBeforeOverlay.value = playerStore.isPreviewMuted
  overlayVolume.value = playerStore.previewVolume > 0 ? playerStore.previewVolume : 1
  overlayMuted.value = true
  applyOverlayVolume()
}

// 倒计时秒数（悬浮模式播放/恢复时延迟 3 秒）
const countdown = ref(0)

// 倒计时定时器 ID
let countdownTimer: number | null = null

async function lockKeyboardTimingProfile() {
  if (!ENABLE_ADAPTIVE_FPS_TIMING) {
    keyboardMapper.value?.setTimingProfile(createKeyboardTimingProfile(DEFAULT_PLAYBACK_FPS))
    return
  }

  const fps = await fpsControl.value
    ?.resolvePlaybackFps()
    .catch((error) => {
      console.error('锁定 FPS 失败:', error)
      return settingsStore.manualFps
    })
  keyboardMapper.value?.setTimingProfile(createKeyboardTimingProfile(fps ?? settingsStore.manualFps))
}

function runAfterCountdown(action: () => void | Promise<void>) {
  // 清除之前的定时器
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  // 倒计时本身就是播放前等待窗口，正好利用这 3 秒刷新自动 FPS 采样。
  if (ENABLE_ADAPTIVE_FPS_TIMING) {
    void fpsControl.value?.startCountdownSampling()
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
      Promise.resolve()
        .then(lockKeyboardTimingProfile)
        .then(action)
        .catch(console.error)
    }
  }, 1000)
}

function resetOverlayKeyboardState() {
  keyboardMapper.value?.releaseAll(playerStore.previewCurrentTime)
  keyboardMapper.value?.reset()
}

// 开始倒计时播放 - 按下播放按钮时，先显示 3 秒倒计时，让用户有时间切换到游戏窗口
function startWithCountdown() {
  runAfterCountdown(() => playerStore.startPreview())
}

// 恢复播放（带倒计时）
function resumeWithCountdown() {
  runAfterCountdown(() => playerStore.resumePreviewPlayback())
}

// 取消倒计时
function cancelCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  countdown.value = 0
}

// 播放/暂停切换 - 根据当前播放状态决定是开始播放、暂停还是恢复播放
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

async function playFromStartWithCountdown(midi?: MidiInfo) {
  cancelCountdown()
  await playerStore.stopPreviewPlayback()
  resetOverlayKeyboardState()

  if (midi) {
    // 悬浮模式只读取列表播放，不打开主界面详情抽屉，避免影响主界面页面状态
    await playerStore.selectMidi(midi, { openDetail: false })
    resetOverlayKeyboardState()
  }

  startWithCountdown()
}

function stopOverlayPlayback() {
  cancelCountdown()
  void playerStore.stopPreviewPlayback()
}

// 初始化键盘映射器 - 创建键盘映射器实例，设置键盘模拟回调
function initKeyboardMapper() {
  const template = settingsStore.getCurrentTemplate()
  if (template) {
    if (!keyboardMapper.value) {
      keyboardMapper.value = new KeyboardMapper()
      keyboardMapper.value.setTimingProfile(
        createKeyboardTimingProfile(
          ENABLE_ADAPTIVE_FPS_TIMING ? settingsStore.manualFps : DEFAULT_PLAYBACK_FPS
        )
      )
      // 设置键盘模拟回调（悬浮模式强制启用）
      keyboardMapper.value.setKeyboardSimCallback((action: string, key: string) => {
        if (
          (settingsStore.enableKeyboardSim || settingsStore.isOverlayMode) &&
          settingsStore.playMode === 'piano'
        ) {
          if (action === 'press') {
            invoke('simulate_key_down', { key }).catch(console.error)
          } else {
            invoke('simulate_key_up', { key }).catch(console.error)
          }
        }
      })
    }
    keyboardMapper.value.setTemplate(template)

    // 直接同步键盘事件回调（绕过 Vue 响应式批处理，精确到每个 NoteOn/NoteOff）
    setKeyboardEventCallback((type, pitch, _velocity, noteInstanceId, nextNoteDelayMs) => {
      if (!keyboardMapper.value) return
      if (
        !(settingsStore.enableKeyboardSim || settingsStore.isOverlayMode) ||
        settingsStore.playMode !== 'piano'
      )
        return
      if (type === 'on') {
        keyboardMapper.value.noteOn(
          pitch,
          playerStore.previewCurrentTime,
          noteInstanceId,
          nextNoteDelayMs
        )
      } else {
        keyboardMapper.value.noteOff(pitch, playerStore.previewCurrentTime, noteInstanceId)
      }
    })

    // 播放停止时释放所有按键
    setOnPlaybackStopCallback(() => {
      keyboardMapper.value?.releaseAll(playerStore.previewCurrentTime)
    })
  }
}

// 监听暂停状态变化 - 暂停时释放所有按键（游戏不应保持按键状态）
watch(
  () => playerStore.isPreviewPaused,
  (paused) => {
    if (paused && keyboardMapper.value) {
      keyboardMapper.value.releaseAll(playerStore.previewCurrentTime)
    }
  }
)

// 监听模板变化 - 切换模板时停止播放并重置映射器
watch(
  () => settingsStore.currentTemplateId,
  () => {
    cancelCountdown()
    void playerStore.stopPreviewPlayback()
    if (keyboardMapper.value) {
      keyboardMapper.value.releaseAll(playerStore.previewCurrentTime)
      keyboardMapper.value.reset()
    }
    initKeyboardMapper()
  }
)

// 监听当前 MIDI 变化 - 切换歌曲时重置映射器
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

async function resizeOverlayWindow(expanded = isExpanded.value) {
  const window = getCurrentWindow()
  await window.setSize(
    new LogicalSize(
      OVERLAY_WIDTH,
      expanded ? OVERLAY_EXPANDED_HEIGHT : OVERLAY_COLLAPSED_HEIGHT
    )
  )
}

// 组件挂载完成（窗口尺寸/装饰由 Rust enter_overlay_mode 统一设置，这里不再重复 resize）
onMounted(() => {
  initKeyboardMapper()
  muteOverlayFromDetailState()
})

// 组件卸载 - 清理回调，释放所有按键
onUnmounted(() => {
  // 清理直接回调，释放所有按键
  setKeyboardEventCallback(null)
  setOnPlaybackStopCallback(null)
  keyboardMapper.value?.releaseAll(playerStore.previewCurrentTime)
})

// 开始拖拽窗口 - 仅当点击的是非交互元素时才触发拖拽
async function startDrag(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (
    target.closest(
      'button, select, input, textarea, [role="button"], .ant-select, .playlist-item, .overlay-progress, .overlay-fps-control, .playback-controls',
    )
  ) {
    return
  }
  const window = getCurrentWindow()
  await window.startDragging()
}

// 是否展开面板
const isExpanded = ref(false)

// 展开面板播放列表滚动容器，用于“定位当前歌曲”。
const playlistRef = ref<HTMLElement | null>(null)

// 切换展开/收起面板
async function toggleExpand() {
  isExpanded.value = !isExpanded.value
  await resizeOverlayWindow()
}

/**
 * @description: 平滑滚动到当前选中歌曲
 * @return {Promise<void>} 无返回值
 */
async function locateCurrentMidi() {
  await nextTick()
  const activeItem = playlistRef.value?.querySelector<HTMLElement>('.playlist-item.active')
  if (!activeItem) return

  // 使用 scrollIntoView 让浏览器处理容器内偏移，避免手写高度测量。
  activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// 退出悬浮模式 - 恢复窗口状态、保存配置、重置模式
async function exitOverlayMode() {
  try {
    void playerStore.stopPreviewPlayback()
    // 退出前清理键盘回调
    setKeyboardEventCallback(null)
    setOnPlaybackStopCallback(null)
    keyboardMapper.value?.releaseAll(playerStore.previewCurrentTime)
    // 恢复进入前的 playMode
    settingsStore.setPlayMode(settingsStore.modeBeforeOverlay)
    // 恢复进入悬浮前的主窗口音量状态，悬浮期间的音量改动不带回主窗口。
    await playerStore.restorePreviewVolumeState(
      detailVolumeBeforeOverlay.value,
      detailMutedBeforeOverlay.value
    )
    settingsStore.isOverlayMode = false
    await invoke('exit_overlay_mode')
  } catch (e) {
    console.error('退出悬浮模式失败:', e)
  }
}

// 播放指定 MIDI
async function playMidi(midi: MidiInfo) {
  await playFromStartWithCountdown(midi)
}

async function playRelativeMidi(direction: 'prev' | 'next') {
  if (playerStore.midiLibrary.length === 0) return

  cancelCountdown()
  await playerStore.stopPreviewPlayback()
  resetOverlayKeyboardState()

  // 相邻曲目由公共播放器按当前播放模式计算，悬浮窗只负责倒计时后的实际播放。
  const selected = await playerStore.selectRelativePreview(direction, { openDetail: false })
  if (!selected) return

  resetOverlayKeyboardState()
  startWithCountdown()
}

// 格式化时长
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// 当前 MIDI 文件名
const currentMidiName = computed(
  () => playerStore.currentMidi?.filename || t('overlay.noFile')
)

// 是否正在播放
const isPlaying = computed(() => playerStore.isPreviewPlaying && !playerStore.isPreviewPaused)
</script>

<template>
  <div class="overlay-view" :class="{ expanded: isExpanded }">
    <!-- 迷你悬浮条 - 整个区域可拖拽 -->
    <div class="mini-bar" @mousedown="startDrag">
      <div class="track-stack">
        <OverlayFpsControl v-if="ENABLE_ADAPTIVE_FPS_TIMING" ref="fpsControl" />

        <!-- 曲目名称（走马灯效果）- 悬停显示全名 -->
        <Tooltip :title="currentMidiName">
          <div class="track-info">
            <div class="marquee-wrapper">
              <div class="marquee-track">
                <span class="marquee-text">{{ currentMidiName }}</span>
                <span class="marquee-text" aria-hidden="true">{{ currentMidiName }}</span>
              </div>
            </div>
          </div>
        </Tooltip>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <!-- 模板选择 -->
        <KeyTemplateSelect
          class="template-select"
          width="120px"
          :list-height="96"
          :list-item-height="32"
          popup-class-name="overlay-template-select-popup"
          @mousedown.stop
          @pointerdown.stop
        />

        <!-- 关闭按钮 -->
        <Tooltip :title="t('overlay.close')">
          <button class="ctrl-btn close" @click.stop="exitOverlayMode">
            <X :size="16" />
          </button>
        </Tooltip>
      </div>

      <div class="overlay-progress" @mousedown.stop @pointerdown.stop>
        <PreviewProgressBar
          variant="overlay"
          :current-time="playerStore.previewCurrentTime"
          :duration="playerStore.previewDuration"
          @dragging="playerStore.setDragging"
          @preview="playerStore.setPreviewTime"
          @seek="playerStore.seekPreview"
        />
      </div>

      <!-- 播放控制按钮 -->
      <div class="playback-controls" @mousedown.stop @pointerdown.stop>
        <PlaybackModeControl
          :mode="playerStore.previewPlaybackMode"
          variant="overlay"
          @change="playerStore.setPlaylistPlaybackMode"
        />
        <PreviewTransportControls
          variant="overlay"
          :is-playing="isPlaying"
          :is-paused="playerStore.isPreviewPaused"
          :has-media="!!playerStore.currentMidi"
          :volume="overlayVolume"
          :muted="overlayMuted"
          :countdown="countdown"
          @previous="playRelativeMidi('prev')"
          @next="playRelativeMidi('next')"
          @toggle-play="togglePlay"
          @stop="stopOverlayPlayback"
          @toggle-mute="toggleOverlayMute"
          @set-volume="setOverlayVolume"
        />

        <!-- 展开/收起按钮 -->
        <Tooltip :title="isExpanded ? t('overlay.collapse') : t('overlay.expand')">
          <button
            class="ctrl-btn justify-self-end"
            :class="{ active: isExpanded }"
            @click.stop="toggleExpand"
          >
            <ChevronUp v-if="isExpanded" :size="16" />
            <ChevronDown v-else :size="16" />
          </button>
        </Tooltip>
      </div>
    </div>

    <!-- 展开面板 - 显示播放列表 -->
    <div v-if="isExpanded" class="expand-panel">
      <div ref="playlistRef" class="playlist">
        <div
          v-for="midi in playerStore.midiLibrary"
          :key="midi.filename"
          class="playlist-item"
          :class="{ active: playerStore.currentMidi?.filename === midi.filename }"
          @click="playMidi(midi)"
        >
          <Tooltip :title="midi.filename">
            <span class="playlist-name">{{ midi.filename }}</span>
          </Tooltip>
          <span class="playlist-duration">
            {{ formatDuration(midi.duration_ms) }}
          </span>
        </div>
        <!-- 空状态 -->
        <div v-if="playerStore.midiLibrary.length === 0" class="playlist-empty">
          {{ t('midi.libraryEmpty') }}
        </div>
      </div>

      <Tooltip :title="t('overlay.locateCurrent')" placement="left">
        <Crosshair class="locate-current-btn" @click.stop="locateCurrentMidi" />
      </Tooltip>
    </div>
  </div>
</template>

<style scoped>
.overlay-view {
  @apply relative h-screen overflow-hidden;
  border-radius: 16px;
}

.mini-bar {
  min-height: 156px;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 10px;
  background: linear-gradient(135deg, rgba(247, 192, 193, 0.8) 0%, rgba(245, 184, 192, 0.8) 100%);
  cursor: move;
  user-select: none;
}

.overlay-progress {
  grid-column: 1 / -1;
}

.playback-controls {
  grid-column: 1 / -1;
}

.track-info {
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.track-stack {
  @apply flex min-w-0 flex-col gap-1;
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
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  align-items: center;
  gap: 4px;
}

.overlay-progress,
.playback-controls,
.action-buttons {
  cursor: default;
}

.playback-controls :deep(.transport-controls.overlay) {
  justify-self: center;
}

.ctrl-btn {
  @apply w-8 h-8 flex items-center justify-center rounded-lg text-white/90;
  @apply transition-colors;
  background: transparent;
  cursor: pointer;
}

.ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.2);
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

:global(.overlay-template-select-popup .rc-virtual-list-holder) {
  max-height: 96px;
}

.expand-panel {
  @apply absolute bottom-0 left-0 right-0 overflow-hidden;
  top: 156px;
  background: rgba(255, 255, 255, 0.92);
}

.playlist {
  @apply h-full overflow-y-auto rounded-sm p-2;
}

.playlist-item {
  @apply flex items-center justify-between px-4 py-2 cursor-pointer rounded-sm;
}

.playlist-item:hover {
  background: rgba(247, 192, 193, 0.1);
}

.playlist-item.active {
  background: rgba(247, 192, 193, 0.2);
}

.playlist-name {
  @apply text-sm truncate flex-1 mr-3;
  color: var(--color-foreground);
}

.playlist-duration {
  @apply text-xs font-mono;
  color: var(--color-muted-dark);
}

.playlist-empty {
  @apply px-4 py-8 text-center text-sm;
  color: var(--color-muted-dark);
}

.locate-current-btn {
  @apply absolute bottom-3 right-3 flex h-4 w-4 items-center justify-center transition-colors cursor-pointer;
  color: var(--color-primary);
  stroke-width: 2.25;
}

.locate-current-btn:hover {
  color: var(--color-primary-hover);
}
</style>
