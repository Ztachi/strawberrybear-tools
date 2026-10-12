<script setup lang="ts">
/** 复用组件库滑杆的刻度点击和键盘操作，倍速只写入统一播放器入口。 */
import { Button, Popover, Slider } from 'antdv-next'
import { RotateCcw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
defineProps<{ value: number; inverse?: boolean }>()
const emit = defineEmits<{ change: [speed: number] }>()
const { t } = useI18n()
const marks = Object.fromEntries(
  [0.5, 1, 1.5, 2, 2.5, 3].map((speed) => [speed, speed.toFixed(1)])
)
</script>
<template>
  <Popover
    trigger="click"
    placement="top"
    :classes="{ root: 'playback-speed-popover' }"
    :styles="{ container: { padding: '8px 12px' } }"
  >
    <template #content>
      <div class="flex w-[min(224px,calc(100vw-48px))] items-start gap-2">
        <Slider
          :value="value"
          :min="0.5"
          :max="3"
          :step="0.1"
          :marks="marks"
          :tooltip="{ open: false }"
          :styles="{ root: { flex: 1, minWidth: 0, margin: '6px 8px 22px' } }"
          :aria-label-for-handle="t('appSettings.playbackSpeed')"
          @update:value="emit('change', Number($event))"
        />
        <button
          type="button"
          class="nikki-icon-button mt-0.5 flex size-4 shrink-0 items-center justify-center rounded p-0"
          :aria-label="t('appSettings.normalSpeed')"
          :title="t('appSettings.normalSpeed')"
          @click="emit('change', 1)"
        >
          <RotateCcw :size="14" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </template>
    <Button
      type="text"
      size="small"
      class="playback-speed-button shrink-0 tabular-nums"
      :class="{ 'nikki-inverse-controls': inverse }"
      :aria-label="t('appSettings.playbackSpeed')"
    >
      {{ value.toFixed(1) }}x
    </Button>
  </Popover>
</template>
