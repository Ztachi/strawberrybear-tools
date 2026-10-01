<script setup lang="ts">
/**
 * @description: 共享音乐播放器核心控制区
 */
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { Switch, Tooltip } from 'antdv-next'
import { HelpCircle } from 'lucide-vue-next'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import PreviewProgressBar from '@/components/PreviewPlayer/PreviewProgressBar.vue'
import PreviewPlaybackControls from '@/components/PreviewPlayer/PreviewPlaybackControls.vue'
import { usePreviewPlaybackControls } from '@/composables/usePreviewPlaybackControls'
import type { PreviewControlCommand } from '@/features/player/previewControls'
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

const controls = usePreviewPlaybackControls()
function handleCommand(command: PreviewControlCommand): void {
  if (props.variant === 'overlay' && command.action !== 'mode') {
    if (command.action === 'toggle-play') emit('togglePlay')
    else if (command.action === 'previous') emit('previous')
    else if (command.action === 'next') emit('next')
    else emit('stop')
    return
  }
  void controls.execute(command)
}

function handleModeSwitch(isPiano: unknown): void {
  void settingsStore.setPlayMode(isPiano === true ? 'piano' : 'auto')
  if (playerStore.isPreviewPlaying) {
    playerStore.applyPlayModeFilter()
  }
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
  <div
    class="music-player-core"
    :class="props.variant"
  >
    <div
      class="core-control-row"
      :class="{ 'no-template': !props.showTemplate }"
    >
      <PreviewPlaybackControls
        class="core-transport"
        :state="controls.state.value"
        :variant="controlVariant"
        :volume="props.volume ?? playerStore.previewVolume"
        :muted="props.muted ?? playerStore.isPreviewMuted"
        :countdown="props.countdown"
        @command="handleCommand"
        @toggle-mute="toggleMute"
        @set-volume="setVolume"
      />

      <div
        v-if="props.showTemplate"
        class="core-template-wrap"
      >
        <KeyTemplateSelect class="core-template-select" />
      </div>
    </div>

    <p
      v-if="controls.state.value.error"
      role="status"
      class="text-xs text-red-600"
    >
      {{ controls.state.value.error }}
    </p>
    <PreviewProgressBar
      :variant="controlVariant"
      :current-time="playerStore.previewCurrentTime"
      :duration="playerStore.previewDuration"
      @dragging="playerStore.setDragging"
      @preview="playerStore.setPreviewTime"
      @seek="handleSeek"
    />

    <div
      v-if="props.showModeRow"
      class="core-mode-row"
    >
      <div class="mode-toggle">
        <Switch
          :checked="settingsStore.playMode === 'piano'"
          @update:checked="handleModeSwitch"
        />
        <span class="mode-label">{{ t('player.pianoMode') }}</span>
      </div>
      <div class="mode-toggle">
        <Switch
          :checked="settingsStore.enableKeyboardSim"
          :disabled="settingsStore.playMode !== 'piano'"
          @update:checked="(v) => settingsStore.setEnableKeyboardSim(!!v)"
        />
        <span
          class="mode-label"
          :class="{ disabled: settingsStore.playMode !== 'piano' }"
        >
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
  @apply w-[300px] flex flex-col;
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
