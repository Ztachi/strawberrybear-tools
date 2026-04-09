<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { Button } from '@/components/ui'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from 'lucide-vue-next'

const playerStore = usePlayerStore()

/** 内部进度值（包装为响应式数组） */
const internalPercentArray = ref<[number]>([0])
/** 是否正在拖拽 */
const isDragging = ref(false)

/** 格式化时间 */
function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const mins = Math.floor(safeSeconds / 60)
  const secs = Math.floor(safeSeconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** 当前播放时间对应的百分比 */
const currentPercent = computed(() => {
  if (!playerStore.previewDuration) return 0
  return (playerStore.previewCurrentTime / playerStore.previewDuration) * 100
})

/** 音量百分比 */
const volumePercent = computed(() => {
  return Math.round(playerStore.previewVolume * 100)
})

/** 播放/暂停 */
function togglePlay() {
  if (playerStore.isPreviewPlaying && !playerStore.isPreviewPaused) {
    playerStore.pausePreviewPlayback()
  } else if (playerStore.isPreviewPaused) {
    playerStore.resumePreviewPlayback()
  } else {
    playerStore.startPreview()
  }
}

/** 进度条拖拽开始 */
function onSliderPointerDown() {
  isDragging.value = true
  playerStore.setDragging(true)
}

/** 进度条值变化 */
function onSliderUpdate(value: number[] | undefined) {
  if (value) {
    internalPercentArray.value = [value[0]]
    if (isDragging.value) {
      playerStore.setPreviewTime((value[0] / 100) * playerStore.previewDuration)
    }
  }
}

/** 进度条拖拽结束 */
async function onSliderPointerUp() {
  if (isDragging.value) {
    const time = (internalPercentArray.value[0] / 100) * playerStore.previewDuration
    isDragging.value = false
    playerStore.setDragging(false)
    await playerStore.seekPreview(time)
    //---处理点击进度条开始,禁止删除！！
    playerStore.setPreviewTime(time)
    //---处理点击进度条结束
  }
}

/** 播放时同步进度条 */
watch(currentPercent, (newVal) => {
  if (!isDragging.value) {
    internalPercentArray.value = [newVal]
  }
})

onMounted(() => {
  window.addEventListener('pointerup', onSliderPointerUp)
})

onUnmounted(() => {
  window.removeEventListener('pointerup', onSliderPointerUp)
})
</script>

<template>
  <div class="preview-player">
    <!-- 进度条 -->
    <div class="progress-bar">
      <span class="time current">{{ formatTime(playerStore.previewCurrentTime / 1000) }}</span>
      <div class="slider-wrapper">
        <Slider
          v-model="internalPercentArray"
          :max="100"
          :step="0.1"
          class="progress-slider"
          @pointerdown="onSliderPointerDown"
          @update:model-value="onSliderUpdate"
        />
      </div>
      <span class="time duration">{{ formatTime(playerStore.previewDuration / 1000) }}</span>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
      <!-- 上一曲 -->
      <Button variant="ghost" size="icon" class="control-btn prev" @click="playerStore.playPrev">
        <SkipBack :size="18" />
      </Button>

      <!-- 播放/暂停 -->
      <Button variant="default" size="icon" class="control-btn play" @click="togglePlay">
        <Pause v-if="playerStore.isPreviewPlaying && !playerStore.isPreviewPaused" :size="20" />
        <Play v-else :size="20" />
      </Button>

      <!-- 下一曲 -->
      <Button variant="ghost" size="icon" class="control-btn next" @click="playerStore.playNext">
        <SkipForward :size="18" />
      </Button>

      <!-- 音量控制 -->
      <Popover>
        <PopoverTrigger as-child>
          <Button variant="ghost" size="icon" class="control-btn volume">
            <VolumeX v-if="playerStore.isPreviewMuted" :size="18" />
            <Volume2 v-else :size="18" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-48 p-3" align="center" side="top">
          <div class="volume-popover">
            <Button variant="ghost" size="icon" class="mute-btn" @click="playerStore.toggleMute">
              <VolumeX v-if="playerStore.isPreviewMuted" :size="16" />
              <Volume2 v-else :size="16" />
            </Button>
            <Slider
              :model-value="[playerStore.isPreviewMuted ? 0 : playerStore.previewVolume * 100]"
              :max="100"
              class="volume-slider"
              @update:model-value="(v) => v && playerStore.setPreviewVolumeValue(v[0] / 100)"
            />
            <span class="volume-percent">{{ volumePercent }}%</span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </div>
</template>

<style scoped>
.preview-player {
  @apply flex flex-col gap-3;
}

.progress-bar {
  @apply flex items-center gap-3;
}

.time {
  @apply text-xs font-mono w-10 text-center;
  color: var(--color-muted);
}

.time.current {
  color: var(--color-primary);
}

.slider-wrapper {
  @apply flex-1 cursor-pointer;
}

.progress-slider {
  @apply w-full cursor-pointer;
}

.controls {
  @apply flex items-center justify-center gap-2;
}

.control-btn {
  color: var(--color-primary);
}

.control-btn:hover {
  background: var(--bg-primary-10);
}

.control-btn.play {
  @apply w-12 h-12 rounded-full;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%) !important;
  color: var(--color-white) !important;
}

.control-btn.play :deep(svg) {
  color: var(--color-white);
}

.control-btn.play:hover {
  opacity: 0.9;
}

.control-btn.prev,
.control-btn.next {
  @apply w-10 h-10 rounded-xl;
}

.control-btn.volume {
  @apply w-10 h-10 rounded-xl ml-4;
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
