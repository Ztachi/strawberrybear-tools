<script setup lang="ts">
import { computed } from 'vue'
import { Button, Popover, Slider } from 'antdv-next'
import { Pause, Play, SkipBack, SkipForward, Square, Volume2, VolumeX } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    isPlaying: boolean
    isPaused: boolean
    hasMedia: boolean
    volume: number
    muted: boolean
    countdown?: number
    variant?: 'default' | 'overlay'
  }>(),
  {
    countdown: 0,
    variant: 'default',
  }
)

const emit = defineEmits<{
  previous: []
  next: []
  togglePlay: []
  stop: []
  toggleMute: []
  setVolume: [volume: number]
}>()

const volumePercent = computed(() => Math.round(props.volume * 100))
const isOverlay = computed(() => props.variant === 'overlay')
</script>

<template>
  <div class="transport-controls" :class="variant">
    <Button
      v-if="!isOverlay"
      type="text"
      class="control-btn prev"
      :disabled="!hasMedia"
      @click="emit('previous')"
    >
      <SkipBack :size="18" />
    </Button>
    <button v-else class="overlay-btn" :disabled="!hasMedia" @click="emit('previous')">
      <SkipBack :size="16" />
    </button>

    <Button
      v-if="!isOverlay"
      type="primary"
      class="control-btn play"
      :disabled="!hasMedia"
      :aria-pressed="isPlaying || isPaused"
      @click="emit('togglePlay')"
    >
      <Pause v-if="isPlaying" :size="20" />
      <Play v-else :size="20" />
    </Button>
    <button
      v-else
      class="overlay-btn play"
      :disabled="!hasMedia"
      :aria-pressed="isPlaying || isPaused"
      @click="emit('togglePlay')"
    >
      <span v-if="countdown > 0" class="countdown-text">{{ countdown }}</span>
      <Pause v-else-if="isPlaying" :size="18" />
      <Play v-else :size="18" />
    </button>

    <Button
      v-if="!isOverlay"
      type="text"
      class="control-btn next"
      :disabled="!hasMedia"
      @click="emit('next')"
    >
      <SkipForward :size="18" />
    </Button>
    <button v-else class="overlay-btn" :disabled="!hasMedia" @click="emit('next')">
      <SkipForward :size="16" />
    </button>

    <div class="right-controls">
      <Button
        v-if="!isOverlay"
        type="text"
        class="control-btn stop"
        :disabled="!hasMedia"
        @click="emit('stop')"
      >
        <Square :size="16" fill="currentColor" />
      </Button>
      <button v-else class="overlay-btn" :disabled="!hasMedia" @click="emit('stop')">
        <Square :size="14" />
      </button>

      <Popover trigger="click" placement="top">
        <template #content>
          <div class="volume-popover">
            <Button type="text" class="mute-btn" @click="emit('toggleMute')">
              <VolumeX v-if="muted" :size="16" />
              <Volume2 v-else :size="16" />
            </Button>
            <Slider
              :value="muted ? 0 : volume * 100"
              :max="100"
              class="volume-slider"
              @update:value="(v) => emit('setVolume', Number(v) / 100)"
            />
            <span class="volume-percent">{{ volumePercent }}%</span>
          </div>
        </template>
        <Button v-if="!isOverlay" type="text" class="control-btn volume">
          <VolumeX v-if="muted" :size="18" />
          <Volume2 v-else :size="18" />
        </Button>
        <button v-else class="overlay-btn" :class="{ active: muted }">
          <VolumeX v-if="muted" :size="16" />
          <Volume2 v-else :size="16" />
        </button>
      </Popover>
    </div>
  </div>
</template>

<style scoped>
.transport-controls {
  @apply relative flex items-center justify-center gap-2;
}

.transport-controls.overlay {
  @apply gap-1;
}

.control-btn {
  color: var(--color-primary);
}

.control-btn:hover {
  background: var(--bg-primary-10);
}

.control-btn.play {
  @apply w-12 h-12 rounded-full;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-white);
}

.control-btn.play :deep(svg) {
  color: var(--color-white);
}

.control-btn.prev,
.control-btn.next,
.control-btn.volume,
.control-btn.stop {
  @apply w-10 h-10 rounded-xl;
}

.overlay-btn {
  @apply w-8 h-8 flex items-center justify-center rounded-lg text-white/90 transition-colors;
  background: transparent;
}

.overlay-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.overlay-btn:disabled {
  opacity: 0.45;
}

.overlay-btn.play {
  @apply w-10 h-10 rounded-full text-white;
  background: rgba(255, 255, 255, 0.3);
}

.overlay-btn.play:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.4);
}

.overlay-btn.active {
  background: rgba(255, 255, 255, 0.4);
  color: white;
}

.countdown-text {
  @apply text-sm font-bold;
  color: white;
}

.right-controls {
  @apply absolute flex items-center gap-1;
  right: 0;
}

.overlay .right-controls {
  @apply static;
}

.volume-popover {
  @apply flex items-center gap-2;
}

.mute-btn {
  @apply w-8 h-8 rounded-lg;
  color: var(--color-primary);
}

.mute-btn:hover {
  background: var(--bg-primary-10);
}

.volume-slider {
  @apply flex-1 cursor-pointer;
}

.volume-percent {
  @apply text-xs w-8 text-right font-mono;
  color: var(--color-muted);
}
</style>
