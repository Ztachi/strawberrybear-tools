<script setup lang="ts">
/**
 * @fileOverview 自适应文本跑马灯
 * @description 只在文本宽度超过容器时启用左右往返滚动，避免传统循环跑马灯产生大段空白。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    /** 要展示的单行文本。 */
    text: string
    /** 文本滚动速度，单位 px/s。 */
    speed?: number
  }>(),
  {
    speed: 34,
  }
)

const viewportRef = ref<HTMLSpanElement | null>(null)
const contentRef = ref<HTMLSpanElement | null>(null)
const isOverflowing = ref(false)
const scrollDistance = ref(0)
const animationDuration = ref(8)
let resizeObserver: ResizeObserver | null = null

const marqueeStyle = computed(() => ({
  '--marquee-distance': `${scrollDistance.value}px`,
  '--marquee-duration': `${animationDuration.value}s`,
}))

function updateMarqueeMetrics(): void {
  const viewport = viewportRef.value
  const content = contentRef.value
  if (!viewport || !content) return

  const nextDistance = Math.max(0, content.scrollWidth - viewport.clientWidth)
  isOverflowing.value = nextDistance > 1
  scrollDistance.value = nextDistance

  // 关键帧两端各保留停顿，中间往返移动；duration 按实际溢出距离动态计算。
  const movingKeyframeRatio = 0.7
  const safeSpeed = Math.max(12, props.speed)
  animationDuration.value = Math.max(6, (nextDistance * 2) / safeSpeed / movingKeyframeRatio)
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updateMarqueeMetrics())
  if (viewportRef.value) resizeObserver.observe(viewportRef.value)
  if (contentRef.value) resizeObserver.observe(contentRef.value)
  void nextTick(updateMarqueeMetrics)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

watch(
  () => [props.text, props.speed],
  () => void nextTick(updateMarqueeMetrics)
)
</script>

<template>
  <span
    ref="viewportRef"
    v-bind="$attrs"
    class="marquee-text"
    :class="{ 'is-overflowing': isOverflowing }"
    :style="marqueeStyle"
  >
    <span ref="contentRef" class="marquee-text__content">
      {{ text }}
    </span>
  </span>
</template>

<style scoped>
.marquee-text {
  @apply block w-full max-w-full min-w-0 overflow-hidden whitespace-nowrap;
}

.marquee-text__content {
  @apply inline-block whitespace-nowrap align-bottom;
}

.marquee-text.is-overflowing .marquee-text__content {
  animation: marquee-text-ping-pong var(--marquee-duration) ease-in-out infinite;
}

.marquee-text.is-overflowing:hover .marquee-text__content {
  animation-play-state: paused;
}

@keyframes marquee-text-ping-pong {
  0%,
  10% {
    transform: translateX(0);
  }

  45%,
  55% {
    transform: translateX(calc(var(--marquee-distance) * -1));
  }

  90%,
  100% {
    transform: translateX(0);
  }
}
</style>
