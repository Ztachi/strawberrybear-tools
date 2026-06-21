<script setup lang="ts">
/**
 * @description: AutoFitText - 单行文字自动缩放
 * @description 在固定宽度内使用最大可用字号展示文字，适合证书、徽章和紧凑卡片文本。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 要展示的单行文本 */
    text: string
    /** 最大字号 CSS 值，例如 28px 或 1.6cqw */
    maxFontSize: string
    /** 最大字号对应的行高，用来保留稳定的垂直占位 */
    lineHeight?: number
    /** 缩小后在最大行盒内的垂直对齐方式 */
    verticalAlign?: 'center' | 'bottom'
    /** 宽度安全系数，避免临界文本因小数像素或字形渲染被裁掉末尾 */
    fitSafety?: number
    /** 最小字号比例，避免极端长文本缩到不可读 */
    minScale?: number
  }>(),
  {
    lineHeight: 1.1,
    verticalAlign: 'bottom',
    fitSafety: 0.96,
    minScale: 0.55,
  }
)

/** 外层容器引用，ResizeObserver 用来感知可用宽度变化。 */
const rootElement = ref<HTMLElement | null>(null)
/** 隐藏测量文本引用，始终使用最大字号测量原始宽度。 */
const measureElement = ref<HTMLElement | null>(null)
/** 当前字号缩放比例。 */
const scale = ref(1)
/** 容器尺寸监听器。 */
let resizeObserver: ResizeObserver | null = null

/** 实际应用到可见文字上的字号。 */
const fittedFontSize = computed(() => `calc(${props.maxFontSize} * ${scale.value})`)
/** 外层保留最大字号行盒高度，避免缩小字号后文字上浮。 */
const lineBoxStyle = computed(() => ({
  height: `calc(${props.maxFontSize} * ${props.lineHeight})`,
}))
/** 可见文字样式；缩放后在最大行盒内垂直居中。 */
const visibleTextStyle = computed(() => ({
  top: props.verticalAlign === 'center' ? '50%' : 'auto',
  bottom: props.verticalAlign === 'bottom' ? '0' : 'auto',
  fontSize: fittedFontSize.value,
  lineHeight: `${props.lineHeight}`,
  transform: props.verticalAlign === 'center' ? 'translateY(-50%)' : 'none',
}))
/** 测量文字始终使用最大字号，保证宽度计算不受当前缩放影响。 */
const measureTextStyle = computed(() => ({
  fontSize: props.maxFontSize,
  lineHeight: `${props.lineHeight}`,
}))

/**
 * @description: 更新字号缩放比例
 * @description 用最大字号测量文本宽度，再按容器宽度缩小到可容纳的最大比例。
 * @return {Promise<void>} 无返回值
 */
async function updateScale(): Promise<void> {
  await nextTick()

  const root = rootElement.value
  const measure = measureElement.value

  if (!root || !measure) {
    return
  }

  const availableWidth = root.getBoundingClientRect().width
  const measuredWidth = measure.getBoundingClientRect().width

  if (availableWidth <= 0 || measuredWidth <= 0) {
    scale.value = 1
    return
  }

  scale.value = Math.max(props.minScale, Math.min(1, (availableWidth / measuredWidth) * props.fitSafety))
}

watch(
  [
    () => props.text,
    () => props.maxFontSize,
    () => props.minScale,
    () => props.lineHeight,
    () => props.fitSafety,
  ],
  () => {
    void updateScale()
  }
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    void updateScale()
  })

  if (rootElement.value) {
    resizeObserver.observe(rootElement.value)
  }

  void updateScale()

  if ('fonts' in document) {
    void document.fonts.ready.then(() => updateScale())
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <span ref="rootElement" class="auto-fit-text" :style="lineBoxStyle">
    <span class="auto-fit-text__visible" :style="visibleTextStyle">
      {{ text }}
    </span>
    <span ref="measureElement" class="auto-fit-text__measure" :style="measureTextStyle">
      {{ text }}
    </span>
  </span>
</template>

<style scoped>
.auto-fit-text {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  white-space: nowrap;
}

.auto-fit-text__visible {
  position: absolute;
  top: 50%;
  left: 0;
  display: block;
  overflow: visible;
  white-space: nowrap;
}

.auto-fit-text__measure {
  position: absolute;
  inset: 0 auto auto 0;
  display: block;
  width: max-content;
  max-width: none;
  visibility: hidden;
  white-space: nowrap;
  pointer-events: none;
}
</style>
