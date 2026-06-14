<script setup lang="ts">
/**
 * @description: 共享音乐播放器核心控制区
 */
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { Switch, Tooltip } from 'antdv-next'
import { HelpCircle } from 'lucide-vue-next'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import PlaybackModeControl from '@/components/PlaybackModeControl.vue'
import PreviewProgressBar from '@/components/PreviewPlayer/PreviewProgressBar.vue'
import PreviewTransportControls from '@/components/PreviewPlayer/PreviewTransportControls.vue'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'

const props = withDefaults(
  defineProps<{
    variant?: 'bar' | 'compact' | 'overlay'
    volume?: number
    muted?: boolean
    countdown?: number
    showTemplate?: boolean
    showModeRow?: boolean
  }>(),
  {
    variant: 'bar',
    volume: undefined,
    muted: undefined,
    countdown: 0,
    showTemplate: true,
    showModeRow: true,
  }
)

const emit = defineEmits<{
  previous: []
  next: []
  togglePlay: []
  stop: []
  toggleMute: []
  setVolume: [volume: number]
  seek: [time: number]
}>()

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const controlVariant = computed(() =>
  props.variant === 'overlay' ? 'overlay' : props.variant === 'compact' ? 'compact' : 'default'
)

function togglePlay(): void {
  if (props.variant === 'overlay') {
    emit('togglePlay')
    return
  }
  if (playerStore.isPreviewPlaying && !playerStore.isPreviewPaused) {
    playerStore.pausePreviewPlayback()
    return
  }
  if (playerStore.isPreviewPaused) {
    playerStore.resumePreviewPlayback()
    return
  }
  void playerStore.startPreview()
}

function handleModeSwitch(isPiano: unknown): void {
  void settingsStore.setPlayMode(isPiano === true ? 'piano' : 'auto')
  if (playerStore.isPreviewPlaying) {
    playerStore.applyPlayModeFilter()
  }
}

function stopPlayback(): void {
  if (props.variant === 'overlay') {
    emit('stop')
    return
  }
  void playerStore.stopPreviewPlayback()
  playerStore.setPreviewTime(0)
}

function playPrevious(): void {
  if (props.variant === 'overlay') {
    emit('previous')
    return
  }
  void playerStore.playPrev()
}

function playNext(): void {
  if (props.variant === 'overlay') {
    emit('next')
    return
  }
  void playerStore.playNext()
}

function toggleMute(): void {
  if (props.variant === 'overlay') {
    emit('toggleMute')
    return
  }
  playerStore.toggleMute()
}

function setVolume(value: number): void {
  if (props.variant === 'overlay') {
    emit('setVolume', value)
    return
  }
  playerStore.setPreviewVolumeValue(value)
}

function handleSeek(time: number): void {
  if (props.variant === 'overlay') {
    emit('seek', time)
    return
  }
  if (!playerStore.isPreviewPlaying && !playerStore.isPreviewPaused) {
    void playerStore.seekPreviewAndPlay(time)
    return
  }
  void playerStore.seekPreview(time)
}
</script>

<template>
  <div class="music-player-core" :class="props.variant">
    <div class="core-control-row" :class="{ 'no-template': !props.showTemplate }">
      <PlaybackModeControl
        :mode="playerStore.previewPlaybackMode"
        :variant="controlVariant"
        @change="playerStore.setPlaylistPlaybackMode"
      />

      <PreviewTransportControls
        class="core-transport"
        :variant="controlVariant"
        :is-playing="playerStore.isPreviewPlaying && !playerStore.isPreviewPaused"
        :is-paused="playerStore.isPreviewPaused"
        :has-media="!!playerStore.currentMidi"
        :volume="props.volume ?? playerStore.previewVolume"
        :muted="props.muted ?? playerStore.isPreviewMuted"
        :countdown="props.countdown"
        @previous="playPrevious"
        @next="playNext"
        @toggle-play="togglePlay"
        @stop="stopPlayback"
        @toggle-mute="toggleMute"
        @set-volume="setVolume"
      />

      <div v-if="props.showTemplate" class="core-template-wrap">
        <KeyTemplateSelect class="core-template-select" />
      </div>
    </div>

    <PreviewProgressBar
      :variant="controlVariant"
      :current-time="playerStore.previewCurrentTime"
      :duration="playerStore.previewDuration"
      @dragging="playerStore.setDragging"
      @preview="playerStore.setPreviewTime"
      @seek="handleSeek"
    />

    <div v-if="props.showModeRow" class="core-mode-row">
      <div class="mode-toggle">
        <Switch :checked="settingsStore.playMode === 'piano'" @update:checked="handleModeSwitch" />
        <span class="mode-label">{{ t('player.pianoMode') }}</span>
      </div>
      <div class="mode-toggle">
        <Switch
          :checked="settingsStore.enableKeyboardSim"
          :disabled="settingsStore.playMode !== 'piano'"
          @update:checked="(v) => settingsStore.setEnableKeyboardSim(!!v)"
        />
        <span class="mode-label" :class="{ disabled: settingsStore.playMode !== 'piano' }">
          {{ t('player.keyboardSim') }}
        </span>
        <Tooltip :title="t('player.keyboardSimTip')">
          <HelpCircle class="help-icon" />
        </Tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.music-player-core {
  @apply w-[300px] flex flex-col gap-2;
}

.core-control-row{
  @apply flex justify-center items-center gap-3;
}

.core-transport {
  @apply min-w-0;
}

.core-template-wrap {
  @apply min-w-0;
}

.core-template-select {
  @apply w-full;
}

.core-mode-row {
  @apply flex min-w-0 items-center justify-center gap-5;
}

.mode-toggle {
  @apply flex items-center gap-2;
}

.mode-label {
  @apply whitespace-nowrap text-xs;
  color: var(--color-muted-dark);
}

.mode-label.disabled {
  opacity: 0.5;
}

.help-icon {
  width: 14px;
  height: 14px;
  color: var(--color-muted);
}

@media (max-width: 1180px) {

  .core-template-wrap {
    display: none;
  }
}
</style>
