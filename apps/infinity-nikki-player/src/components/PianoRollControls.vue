<script setup lang="ts">
import { Button, Slider, Tooltip } from 'antdv-next'
import { sliderToTimeZoom, timeZoomToSlider } from '@strawberrybear/piano-roll/browser'
import { Crosshair } from 'lucide-vue-next'
import type {
  PianoRollLabels,
  PianoRollView,
  PianoRollViewport,
} from '@strawberrybear/piano-roll/browser'

defineProps<{
  view: PianoRollView | null
  viewport: Readonly<PianoRollViewport>
  labels: PianoRollLabels
  editor?: boolean
}>()

/** 滑块保留小数精度，键盘则每次调整 5%：避免方向键只移动百万分之一像素。 */
function onTimeKey(
  event: KeyboardEvent,
  view: PianoRollView | null,
  viewport: Readonly<PianoRollViewport>
): void {
  const values: Record<string, number> = {
    ArrowLeft: viewport.timeZoom / 1.05,
    ArrowDown: viewport.timeZoom / 1.05,
    ArrowRight: viewport.timeZoom * 1.05,
    ArrowUp: viewport.timeZoom * 1.05,
    Home: viewport.minTimeZoom,
    End: viewport.maxTimeZoom,
  }
  const value = values[event.key]
  if (value === undefined) return
  event.preventDefault()
  event.stopPropagation()
  view?.setTimeZoom(value)
}
</script>

<template>
  <Tooltip :title="viewport.follow ? labels.following : labels.follow">
    <Button
      size="small"
      shape="circle"
      :type="viewport.follow ? 'primary' : 'default'"
      :aria-pressed="viewport.follow"
      :aria-label="viewport.follow ? labels.following : labels.follow"
      @click="view?.setFollow(!viewport.follow)"
    >
      <template #icon>
        <Crosshair
          class="size-4"
          :stroke-width="2.2"
        />
      </template>
    </Button>
  </Tooltip>
  <span class="piano-roll-app-slider">
    <span>{{ labels.timeZoom }}</span>
    <!-- 仅转换显示刻度，不持有第二份值；滑块端点与手势边界均来自控制器。 -->
    <Slider
      :value="timeZoomToSlider(viewport.timeZoom, viewport.minTimeZoom, viewport.maxTimeZoom)"
      :min="0"
      :max="100"
      :step="0.000001"
      :disabled="viewport.minTimeZoom === viewport.maxTimeZoom"
      :tooltip="{ open: false }"
      :aria-label-for-handle="labels.timeZoom"
      @keydown.capture="onTimeKey($event, view, viewport)"
      @update:value="view?.setTimeZoom(sliderToTimeZoom(Number($event), viewport.minTimeZoom, viewport.maxTimeZoom))"
    />
  </span>
  <span
    v-if="editor"
    class="piano-roll-app-slider"
  >
    <span>{{ labels.pitchZoom }}</span>
    <Slider
      :value="viewport.pitchZoom"
      :min="8"
      :max="36"
      :step="1"
      :tooltip="{ open: false }"
      :aria-label-for-handle="labels.pitchZoom"
      @update:value="view?.setPitchZoom(Number($event))"
    />
  </span>
</template>

<style scoped>
.piano-roll-app-slider { @apply flex min-w-0 items-center gap-1; }
.piano-roll-app-slider > span { @apply shrink-0; }
.piano-roll-app-slider :deep(.ant-slider) { @apply w-20 min-w-8; }
</style>
