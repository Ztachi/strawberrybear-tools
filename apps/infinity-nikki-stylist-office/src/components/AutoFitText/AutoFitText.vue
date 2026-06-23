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
    /** 外层行盒高度；不传时按最大字号行高生成 */
    boxHeight?: string
    /** 缩小后在最大行盒内的垂直对齐方式 */
    verticalAlign?: 'center' | 'bottom'
    /** 宽度安全系数，避免临界文本因小数像素或字形渲染被裁掉末尾 */
    fitSafety?: number
    /** 最小字号比例，避免极端长文本缩到不可读 */
    minScale?: number
  }>(),
  {
    lineHeight: 1.1,
    boxHeight: '',
    verticalAlign: 'bottom',
    fitSafety: 0.96,
    minScale: 0.55,
  }
)

/** 外层容器引用，ResizeObserver 用来感知可用宽度变化。 */
const rootElement = ref<HTMLElement | null>(null)
/** 隐藏测量文本引用，始终使用最大字号测量原始宽度。 */
const measureElement = ref<HTMLElement | null>(null)
/** 可见文字像素字号，用于 SVG 基线计算。 */
const fontSizePx = ref(0)
/** SVG 文本 baseline，单位为当前容器 CSS 像素。 */
const baselineY = ref(0)
/** SVG viewBox 宽度，单位为当前容器 CSS 像素。 */
const svgWidth = ref(1)
/** SVG viewBox 高度，单位为当前容器 CSS 像素。 */
const svgHeight = ref(1)
/** 容器尺寸监听器。 */
let resizeObserver: ResizeObserver | null = null

/** 外层保留最大字号行盒高度，避免缩小字号后文字上浮。 */
const lineBoxStyle = computed(() => ({
  height: props.boxHeight || `calc(${props.maxFontSize} * ${props.lineHeight})`,
}))
/** 可见文字样式；SVG baseline 由真实字形边界计算。 */
const visibleTextStyle = computed(() => ({
  fontSize: `${fontSizePx.value}px`,
  lineHeight: `${props.lineHeight}`,
}))
/** 测量文字始终使用最大字号，保证宽度计算不受当前缩放影响。 */
const measureTextStyle = computed(() => ({
  fontSize: props.maxFontSize,
  lineHeight: `${props.lineHeight}`,
}))
/** SVG 坐标系与实际 CSS 像素保持一致。 */
const svgViewBox = computed(() => `0 0 ${svgWidth.value} ${svgHeight.value}`)

interface TextVerticalMetrics {
  /** 字体上边界到 alphabetic baseline 的距离。 */
  ascent: number
  /** 字体下边界到 alphabetic baseline 的距离。 */
  descent: number
}

/**
 * @description: 创建文字测量上下文
 * @return {CanvasRenderingContext2D | null} Canvas 2D 上下文
 */
function createMeasureContext(): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas')

  return canvas.getContext('2d')
}

/**
 * @description: 根据 TextMetrics 解析字体垂直边界
 * @description fontBoundingBox 以字体包围盒为准，比单个字形 bbox 更适合中英日统一基线。
 * @param {HTMLElement} element - 字体样式来源元素
 * @param {number} nextFontSizePx - 实际字号
 * @return {TextVerticalMetrics} 字体垂直边界
 */
function measureFontBounds(element: HTMLElement, nextFontSizePx: number): TextVerticalMetrics {
  const context = createMeasureContext()

  if (!context) {
    return {
      ascent: nextFontSizePx * 0.82,
      descent: nextFontSizePx * 0.18,
    }
  }

  const style = getComputedStyle(element)

  context.font = [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    `${nextFontSizePx}px`,
    style.fontFamily,
  ].join(' ')

  const metrics = context.measureText(props.text || ' ')

  return {
    ascent: metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || nextFontSizePx * 0.82,
    descent:
      metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || nextFontSizePx * 0.18,
  }
}

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
  const availableHeight = root.getBoundingClientRect().height
  const measuredWidth = measure.getBoundingClientRect().width
  const maxFontSizePx = parseFloat(getComputedStyle(measure).fontSize)

  if (availableWidth <= 0 || availableHeight <= 0 || measuredWidth <= 0 || maxFontSizePx <= 0) {
    return
  }

  const nextScale = Math.max(
    props.minScale,
    Math.min(1, (availableWidth / measuredWidth) * props.fitSafety)
  )

  fontSizePx.value = maxFontSizePx * nextScale
  svgWidth.value = Math.max(availableWidth, 1)
  svgHeight.value = Math.max(availableHeight, 1)
  const { ascent, descent } = measureFontBounds(measure, fontSizePx.value)

  baselineY.value =
    props.verticalAlign === 'center'
      ? availableHeight / 2 + (ascent - descent) / 2
      : availableHeight - descent
}

watch(
  [
    () => props.text,
    () => props.maxFontSize,
    () => props.minScale,
    () => props.lineHeight,
    () => props.fitSafety,
    () => props.verticalAlign,
    () => props.boxHeight,
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
    <svg class="auto-fit-text__visible" :viewBox="svgViewBox" preserveAspectRatio="none">
      <text class="auto-fit-text__svg-text" x="0" :y="baselineY" :style="visibleTextStyle">
        {{ text }}
      </text>
    </svg>
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
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  white-space: nowrap;
  pointer-events: none;
}

.auto-fit-text__svg-text {
  fill: currentColor;
  font-family: inherit;
  font-weight: inherit;
  letter-spacing: 0;
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
