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
      type="text"
      :class="['transport-btn', 'prev', { overlay: isOverlay }]"
      :disabled="!hasMedia"
      @click="emit('previous')"
    >
      <template #icon>
        <SkipBack :class="['transport-icon', { overlay: isOverlay }]" />
      </template>
    </Button>

    <Button
      :type="isOverlay ? 'text' : 'primary'"
      :class="['transport-btn', 'play', { overlay: isOverlay }]"
      :disabled="!hasMedia"
      :aria-pressed="isPlaying || isPaused"
      @click="emit('togglePlay')"
    >
      <template #icon>
        <span v-if="countdown > 0" class="countdown-text">{{ countdown }}</span>
        <Pause
          v-else-if="isPlaying"
          :class="['transport-icon', 'play-icon', { overlay: isOverlay }]"
        />
        <Play v-else :class="['transport-icon', 'play-icon', { overlay: isOverlay }]" />
      </template>
    </Button>

    <Button
      type="text"
      :class="['transport-btn', 'next', { overlay: isOverlay }]"
      :disabled="!hasMedia"
      @click="emit('next')"
    >
      <template #icon>
        <SkipForward :class="['transport-icon', { overlay: isOverlay }]" />
      </template>
    </Button>

    <div class="right-controls">
      <Button
        type="text"
        :class="['transport-btn', 'stop', { overlay: isOverlay }]"
        :disabled="!hasMedia"
        @click="emit('stop')"
      >
        <template #icon>
          <Square
            :class="['transport-icon', 'stop-icon', { overlay: isOverlay }]"
            fill="currentColor"
          />
        </template>
      </Button>

      <Popover trigger="click" placement="top" overlay-class-name="volume-popover-overlay">
        <template #content>
          <div class="volume-popover">
            <Button type="text" class="mute-btn" @click="emit('toggleMute')">
              <template #icon>
                <VolumeX v-if="muted" class="volume-popover-icon" />
                <Volume2 v-else class="volume-popover-icon" />
              </template>
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
        <Button
          type="text"
          :class="['transport-btn', 'volume', { overlay: isOverlay, active: muted }]"
        >
          <template #icon>
            <VolumeX v-if="muted" :class="['transport-icon', { overlay: isOverlay }]" />
            <Volume2 v-else :class="['transport-icon', { overlay: isOverlay }]" />
          </template>
        </Button>
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

.transport-btn {
  @apply inline-flex items-center justify-center;
  color: var(--color-primary);
}

.transport-btn :deep(.ant-btn-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.transport-icon {
  width: 20px;
  height: 20px;
  stroke-width: 2.25;
}

.transport-icon.play-icon {
  width: 24px;
  height: 24px;
}

.transport-icon.stop-icon {
  width: 18px;
  height: 18px;
}

.transport-icon.overlay {
  width: 18px;
  height: 18px;
  stroke-width: 2.35;
}

.transport-icon.overlay.play-icon {
  width: 21px;
  height: 21px;
}

.transport-icon.overlay.stop-icon {
  width: 17px;
  height: 17px;
}

.transport-btn:hover {
  background: var(--bg-primary-10);
}

.transport-btn.play {
  @apply w-12 h-12 rounded-full;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-white);
}

.transport-btn.play :deep(svg) {
  color: var(--color-white);
}

.transport-btn.prev,
.transport-btn.next,
.transport-btn.volume,
.transport-btn.stop {
  @apply w-10 h-10 rounded-xl;
}

.transport-btn.overlay {
  @apply h-8 w-8 rounded-lg text-white/90 transition-colors;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: rgba(255, 255, 255, 0.92);
}

.transport-btn.overlay:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.transport-btn.overlay:disabled {
  opacity: 0.45;
}

.transport-btn.overlay.play {
  @apply w-10 h-10 rounded-full text-white;
  background: rgba(255, 255, 255, 0.3);
}

.transport-btn.overlay.play:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.4);
}

.transport-btn.overlay.active {
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
  width: 176px;
  min-height: 34px;
}

.mute-btn {
  @apply h-7 w-7 shrink-0 rounded-lg;
  color: var(--color-primary);
}

.volume-popover-icon {
  width: 18px;
  height: 18px;
  stroke-width: 2.25;
}

.mute-btn:hover {
  background: var(--bg-primary-10);
}

.volume-slider {
  @apply min-w-0 flex-1 cursor-pointer;
  width: 88px;
  margin: 0;
}

.volume-slider :deep(.ant-slider-rail),
.volume-slider :deep(.ant-slider-track) {
  height: 4px;
}

.volume-slider :deep(.ant-slider-rail) {
  background: var(--border-primary-20);
}

.volume-slider :deep(.ant-slider-track) {
  background: var(--color-primary);
}

.volume-slider :deep(.ant-slider-handle::after) {
  box-shadow: 0 0 0 2px var(--color-primary);
}

:global(.volume-popover-overlay .ant-popover-inner) {
  padding: 8px 10px;
  border-radius: 14px;
}

.volume-percent {
  @apply w-9 shrink-0 text-right text-xs font-mono;
  color: var(--color-muted);
}
</style>
