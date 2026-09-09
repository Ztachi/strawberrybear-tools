<script setup lang="ts">
/** @description: 只有实际省略的音轨名称才出现 Tooltip，并继承页面的 antdv 主题。 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Tooltip } from 'antdv-next'

const props = defineProps<{ name: string }>()
const label = ref<HTMLElement | null>(null)
const overflowing = ref(false)
let observer: ResizeObserver | null = null
let frame = 0

function measure(): void {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const element = label.value
    overflowing.value = Boolean(element && element.scrollWidth > element.clientWidth + 1)
  })
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (label.value) observer.observe(label.value)
  measure()
})
watch(() => props.name, measure, { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
</script>

<template>
  <Tooltip
    :title="overflowing ? name : undefined"
    placement="topLeft"
  >
    <span
      ref="label"
      class="piano-roll-track-name"
    >{{ name }}</span>
  </Tooltip>
</template>

<style scoped>
.piano-roll-track-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
