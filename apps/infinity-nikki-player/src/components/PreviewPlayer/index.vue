<script setup lang="ts">
/**
 * @description: 预览播放器组件
 * @description 提供 MIDI 预览播放的完整控制界面，包括播放/暂停、进度拖拽、音量控制、演奏模式切换等功能
 */
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { Switch, Tooltip } from 'antdv-next'
import { HelpCircle } from 'lucide-vue-next'
import PreviewProgressBar from './PreviewProgressBar.vue'
import PreviewTransportControls from './PreviewTransportControls.vue'

/**
 * @description: 组件属性
 * @param {boolean} compact - 是否为精简模式（悬浮模式使用），默认 false
 */
withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false
})

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

/**
 * @description: 切换播放/暂停状态
 * 根据当前状态调用 playerStore 的不同方法
 */
function togglePlay() {
  if (playerStore.isPreviewPlaying && !playerStore.isPreviewPaused) {
    playerStore.pausePreviewPlayback()
  } else if (playerStore.isPreviewPaused) {
    playerStore.resumePreviewPlayback()
  } else {
    playerStore.startPreview()
  }
}

/**
 * @description: 处理演奏模式切换
 * @param {unknown} isPiano - antdv Switch 变更值；只有 true 表示切换到钢琴模式
 * 切换后实时更新过滤器，无需重启播放
 */
function handleModeSwitch(isPiano: unknown) {
  settingsStore.setPlayMode(isPiano === true ? 'piano' : 'auto')
  // 实时更新过滤器，无需重启播放
  if (playerStore.isPreviewPlaying) {
    playerStore.applyPlayModeFilter()
  }
}

/**
 * @description: 停止播放并回到起点
 */
function stopPlayback() {
  void playerStore.stopPreviewPlayback()
  playerStore.setPreviewTime(0)
}
</script>

<template>
  <div class="preview-player" :class="{ compact }">
    <PreviewProgressBar
      :current-time="playerStore.previewCurrentTime"
      :duration="playerStore.previewDuration"
      @dragging="playerStore.setDragging"
      @preview="playerStore.setPreviewTime"
      @seek="playerStore.seekPreview"
    />

    <PreviewTransportControls
      :is-playing="playerStore.isPreviewPlaying && !playerStore.isPreviewPaused"
      :is-paused="playerStore.isPreviewPaused"
      :has-media="!!playerStore.currentMidi"
      :volume="playerStore.previewVolume"
      :muted="playerStore.isPreviewMuted"
      @previous="playerStore.playPrev"
      @next="playerStore.playNext"
      @toggle-play="togglePlay"
      @stop="stopPlayback"
      @toggle-mute="playerStore.toggleMute"
      @set-volume="playerStore.setPreviewVolumeValue"
    />

    <!-- 演奏模式切换（非精简模式显示） -->
    <template v-if="!compact">
      <div class="play-mode-row">
        <!-- 钢琴模式开关 -->
        <div class="play-mode-toggle">
          <Switch
            :checked="settingsStore.playMode === 'piano'"
            @update:checked="handleModeSwitch"
          />
          <span class="mode-label">{{ t('player.pianoMode') }}</span>
        </div>
        <!-- 键盘模拟开关 -->
        <div class="keyboard-sim-toggle">
          <Switch
            :checked="settingsStore.enableKeyboardSim"
            :disabled="settingsStore.playMode !== 'piano'"
            @update:checked="(v) => settingsStore.setEnableKeyboardSim(!!v)"
          />
          <span class="mode-label" :class="{ disabled: settingsStore.playMode !== 'piano' }">
            {{ t('player.keyboardSim') }}
          </span>
          <!-- 帮助提示 -->
          <Tooltip :title="t('player.keyboardSimTip')">
            <HelpCircle :size="14" class="help-icon" />
          </Tooltip>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview-player {
  @apply flex flex-col gap-3;
}

.preview-player.compact {
  @apply gap-2;
}

.play-mode-row {
  @apply flex items-center justify-between;
}

.play-mode-toggle {
  @apply flex items-center gap-2;
}

.keyboard-sim-toggle {
  @apply flex items-center gap-2;
}

.mode-label {
  @apply text-sm whitespace-nowrap;
  color: var(--color-muted);
}

.mode-label.disabled {
  @apply opacity-50;
}

.help-icon {
  @apply cursor-help;
  color: var(--color-muted);
}

.tooltip-text {
  @apply text-xs max-w-48;
}
</style>
