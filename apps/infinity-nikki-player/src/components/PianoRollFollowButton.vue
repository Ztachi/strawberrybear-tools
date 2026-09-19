<script setup lang="ts">
/** 标尺左侧的跟随开关；两个视图各自维护跟随状态。 */
import { Button, Tooltip } from 'antdv-next'
import { AimOutlined } from '@antdv-next/icons'
import type { PianoRollLabels, PianoRollView, PianoRollViewport } from '@strawberrybear/piano-roll/browser'

defineProps<{
  view: PianoRollView | null
  viewport: Readonly<PianoRollViewport>
  labels: PianoRollLabels
}>()
</script>

<template>
  <Tooltip :title="viewport.follow ? labels.following : labels.follow">
    <Button
      class="piano-follow-button"
      size="small"
      shape="circle"
      color="primary"
      :variant="viewport.follow ? 'solid' : 'link'"
      :aria-pressed="viewport.follow"
      :aria-label="viewport.follow ? labels.following : labels.follow"
      @click="view?.setFollow(!viewport.follow)"
    >
      <template #icon>
        <AimOutlined />
      </template>
    </Button>
  </Tooltip>
</template>

<style scoped>
.piano-follow-button.ant-btn { width: 20px; min-width: 20px; height: 20px; padding: 0; font-size: 14px; }
</style>
