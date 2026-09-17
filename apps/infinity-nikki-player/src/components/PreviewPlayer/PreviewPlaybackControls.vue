<script setup lang="ts">
/** 纯展示的播放操作行；主窗口直接执行，独立窗口通过会话转发同一组语义动作。 */
import PlaybackModeControl from '@/components/PlaybackModeControl.vue'
import PreviewTransportControls from './PreviewTransportControls.vue'
import type { PreviewControlCommand, PreviewControlState } from '@/features/player/previewControls'
withDefaults(defineProps<{
  state: PreviewControlState
  variant?: 'default' | 'compact' | 'overlay'
  volume?: number
  muted?: boolean
  countdown?: number
  showVolume?: boolean
}>(), { variant: 'compact', volume: 1, muted: false, countdown: 0, showVolume: true })
const emit = defineEmits<{
  command: [command: PreviewControlCommand]
  toggleMute: []
  setVolume: [volume: number]
}>()
</script>

<template>
  <div class="preview-playback-controls">
    <PlaybackModeControl
      :mode="state.mode"
      :variant="variant"
      @change="emit('command', { action: 'mode', mode: $event })"
    />
    <PreviewTransportControls
      :variant="variant"
      :is-playing="state.isPlaying"
      :is-paused="state.isPaused"
      :has-media="!!state.mediaId"
      :volume="volume"
      :muted="muted"
      :countdown="countdown"
      :show-volume="showVolume"
      @previous="emit('command', { action: 'previous' })"
      @next="emit('command', { action: 'next' })"
      @toggle-play="emit('command', { action: 'toggle-play' })"
      @stop="emit('command', { action: 'stop' })"
      @toggle-mute="emit('toggleMute')"
      @set-volume="emit('setVolume', $event)"
    />
  </div>
</template>

<style scoped>
.preview-playback-controls { @apply flex shrink-0 items-center justify-center gap-3; }
</style>
