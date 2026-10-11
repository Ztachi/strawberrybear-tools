<script setup lang="ts">
/** 复用组件库滑杆的刻度点击和键盘操作，倍速只写入统一播放器入口。 */
import { Button, Popover, Slider } from 'antdv-next'
import { useI18n } from 'vue-i18n'
defineProps<{ value: number }>()
const emit = defineEmits<{ change: [speed: number] }>()
const { t } = useI18n()
const marks = Object.fromEntries(
  [0.5, 1, 1.5, 2, 2.5, 3].map((speed) => [speed, `${speed.toFixed(1)}x`])
)
</script>
<template>
  <Popover trigger="click" placement="top" :classes="{ root: 'playback-speed-popover' }">
    <template #content>
      <div class="w-[min(280px,calc(100vw-64px))] px-3 pb-3">
        <div class="mb-3 flex items-center justify-between gap-3">
          <span>{{ t('appSettings.playbackSpeed') }}</span>
          <Button type="link" size="small" @click="emit('change', 1)">
            {{ t('appSettings.normalSpeed') }}
          </Button>
        </div>
        <Slider
          :value="value"
          :min="0.5"
          :max="3"
          :step="0.1"
          :marks="marks"
          :aria-label-for-handle="t('appSettings.playbackSpeed')"
          @update:value="emit('change', Number($event))"
        />
      </div>
    </template>
    <Button
      type="text"
      size="small"
      class="playback-speed-button shrink-0 tabular-nums"
      :aria-label="t('appSettings.playbackSpeed')"
    >
      {{ value.toFixed(1) }}x
    </Button>
  </Popover>
</template>
