<script setup lang="ts">
/**
 * @description: CertificateProofCanvas - 证书核对图上交互画布
 * @description 根据模板 manifest 渲染语言底图、动态字段、可编辑热区，并处理移动端查看手势。
 */
import { computed, ref } from 'vue'
import AutoFitText from '@/components/AutoFitText/AutoFitText.vue'
import type {
  CertificateTemplateEditorKind,
  CertificateTemplateField,
  CertificateTemplateManifest,
} from '@/domain/template/types'

const props = defineProps<{
  /** 当前模板 manifest */
  manifest: CertificateTemplateManifest
  /** 当前语言底图 URL */
  imageSrc: string
  /** 当前头像 URL */
  avatarSrc: string
  /** 当前头像是否来自用户自定义素材 */
  avatarIsCustom: boolean
  /** 动态字段值 */
  fieldValues: Record<string, string>
  /** 可编辑热区提示文案 */
  fieldLabels: Record<string, string>
  /** 校样水印 */
  watermark: string
}>()

const emit = defineEmits<{
  /** 请求打开指定字段编辑器 */
  edit: [editor: CertificateTemplateEditorKind]
}>()

/** 画布缩放倍率，移动端双指缩放和桌面触控板都复用这份状态。 */
const scale = ref(1)
/** 画布横向平移，单位为视口 CSS 像素。 */
const translateX = ref(0)
/** 画布纵向平移，单位为视口 CSS 像素。 */
const translateY = ref(0)
/** 当前按下指针集合，用于区分单指拖拽和双指缩放。 */
const activePointers = new Map<number, PointerEvent>()
/** 单指拖拽起点。 */
const dragStart = ref<{ x: number; y: number; translateX: number; translateY: number } | null>(
  null
)
/** 双指缩放起点。 */
const pinchStart = ref<{
  distance: number
  scale: number
  centerX: number
  centerY: number
  translateX: number
  translateY: number
} | null>(null)
/** 本次指针操作是否已经移动，点击热区时用它避免误触。 */
const hasGestureMoved = ref(false)

/** 模板动态字段按渲染类型拆分，避免模板里写复杂判断。 */
const imageFields = computed(() => props.manifest.fields.filter((field) => field.kind === 'image'))
const textFields = computed(() => props.manifest.fields.filter((field) => field.kind === 'text'))
const editableFields = computed(() => props.manifest.fields.filter((field) => field.editable))

/** 画布变换样式。 */
const stageStyle = computed(() => ({
  transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${scale.value})`,
}))

/**
 * @description: 将横向模板像素换算成百分比
 * @param {number} x - 模板横坐标
 * @return {number} 百分比
 */
function xPercent(x: number): number {
  return (x / props.manifest.baseSize.width) * 100
}

/**
 * @description: 将纵向模板像素换算成百分比
 * @param {number} y - 模板纵坐标
 * @return {number} 百分比
 */
function yPercent(y: number): number {
  return (y / props.manifest.baseSize.height) * 100
}

/**
 * @description: 生成图片字段样式
 * @param {CertificateTemplateField} field - 模板图片字段
 * @return {Record<string, string>} Vue 样式
 */
function getImageFieldStyle(field: CertificateTemplateField): Record<string, string> {
  const [x, y] = field.position
  const imageStyle: Record<string, string> = {
    left: `${xPercent(x)}%`,
    top: `${yPercent(y)}%`,
    width: `${xPercent(field.size?.width ?? 0)}%`,
    height: `${yPercent(field.size?.height ?? 0)}%`,
  }

  if (field.imageMask?.shape === 'roundedArch') {
    imageStyle.borderRadius = field.imageMask.borderRadius
  }

  return imageStyle
}

/**
 * @description: 生成文字字段样式
 * @param {CertificateTemplateField} field - 模板文字字段
 * @return {Record<string, string>} Vue 样式
 */
function getTextFieldStyle(field: CertificateTemplateField): Record<string, string> {
  const [x, y] = field.position
  const textStyle = field.textStyle

  return {
    left: `${xPercent(x)}%`,
    top: `${yPercent(y)}%`,
    width: field.contentWidth ? `${xPercent(field.contentWidth)}%` : 'auto',
    color: textStyle?.color ?? '#5c4639',
    fontFamily: textStyle?.fontFamily ?? 'serif',
    fontSize: `${((textStyle?.fontSize ?? 22) / props.manifest.baseSize.width) * 100}cqw`,
    fontWeight: `${textStyle?.fontWeight ?? 600}`,
    lineHeight: `${textStyle?.lineHeight ?? 1.1}`,
    textAlign: textStyle?.align ?? 'left',
  }
}

/**
 * @description: 生成图片字段内部图片样式
 * @description 自定义头像通常没有透明背景，按模板配置缩小一点避免顶满头像框。
 * @param {CertificateTemplateField} field - 模板图片字段
 * @return {Record<string, string>} Vue 样式
 */
function getImageContentStyle(field: CertificateTemplateField): Record<string, string> {
  const imageStyle: Record<string, string> = {}

  if (field.id === 'avatar' && props.avatarIsCustom && field.customImageScale) {
    imageStyle.transform = `scale(${field.customImageScale})`
  }

  return imageStyle
}

/**
 * @description: 获取文字字段最大字号
 * @description AutoFitText 需要拿到与模板坐标同一缩放体系下的最大字号。
 * @param {CertificateTemplateField} field - 模板文字字段
 * @return {string} 最大字号 CSS 值
 */
function getTextFieldMaxFontSize(field: CertificateTemplateField): string {
  return `${((field.textStyle?.fontSize ?? 22) / props.manifest.baseSize.width) * 100}cqw`
}

/**
 * @description: 获取文字字段行高
 * @description 自动缩放文字需要保留最大字号的稳定行盒，避免缩小后上浮。
 * @param {CertificateTemplateField} field - 模板文字字段
 * @return {number} 行高倍率
 */
function getTextFieldLineHeight(field: CertificateTemplateField): number {
  return field.textStyle?.lineHeight ?? 1.1
}

/**
 * @description: 生成热区样式
 * @param {CertificateTemplateField} field - 模板字段
 * @return {Record<string, string>} Vue 样式
 */
function getHotspotStyle(field: CertificateTemplateField): Record<string, string> {
  return {
    left: `${xPercent(field.hitArea.x)}%`,
    top: `${yPercent(field.hitArea.y)}%`,
    width: `${xPercent(field.hitArea.width)}%`,
    height: `${yPercent(field.hitArea.height)}%`,
  }
}

/**
 * @description: 获取字段展示值
 * @param {CertificateTemplateField} field - 模板字段
 * @return {string} 动态字段值
 */
function getFieldValue(field: CertificateTemplateField): string {
  return props.fieldValues[field.id] ?? ''
}

/**
 * @description: 限制缩放倍率
 * @param {number} value - 原始缩放倍率
 * @return {number} 限制后的缩放倍率
 */
function clampScale(value: number): number {
  return Math.min(2.8, Math.max(1, value))
}

/**
 * @description: 计算两指距离
 * @return {number} 两指距离
 */
function getPointerDistance(): number {
  const pointers = Array.from(activePointers.values())

  if (pointers.length < 2) {
    return 0
  }

  return Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY)
}

/**
 * @description: 计算两指中心
 * @return {{ x: number; y: number }} 两指中心
 */
function getPointerCenter(): { x: number; y: number } {
  const pointers = Array.from(activePointers.values())

  if (pointers.length < 2) {
    return { x: 0, y: 0 }
  }

  return {
    x: (pointers[0].clientX + pointers[1].clientX) / 2,
    y: (pointers[0].clientY + pointers[1].clientY) / 2,
  }
}

/**
 * @description: 指针按下
 * @description 单指准备拖拽，两指准备缩放，暂不阻止后续热区 click。
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function handlePointerDown(event: PointerEvent): void {
  activePointers.set(event.pointerId, event)
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  hasGestureMoved.value = false

  if (activePointers.size === 1) {
    dragStart.value = {
      x: event.clientX,
      y: event.clientY,
      translateX: translateX.value,
      translateY: translateY.value,
    }
    return
  }

  if (activePointers.size === 2) {
    const center = getPointerCenter()
    pinchStart.value = {
      distance: getPointerDistance(),
      scale: scale.value,
      centerX: center.x,
      centerY: center.y,
      translateX: translateX.value,
      translateY: translateY.value,
    }
  }
}

/**
 * @description: 指针移动
 * @description 移动超过阈值后视为查看手势，不再触发热区点击。
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function handlePointerMove(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) {
    return
  }

  activePointers.set(event.pointerId, event)

  if (activePointers.size >= 2 && pinchStart.value) {
    const nextDistance = getPointerDistance()

    if (nextDistance <= 0) {
      return
    }

    const nextScale = clampScale((nextDistance / pinchStart.value.distance) * pinchStart.value.scale)
    const scaleDelta = nextScale / pinchStart.value.scale
    translateX.value =
      pinchStart.value.centerX - (pinchStart.value.centerX - pinchStart.value.translateX) * scaleDelta
    translateY.value =
      pinchStart.value.centerY - (pinchStart.value.centerY - pinchStart.value.translateY) * scaleDelta
    scale.value = nextScale
    hasGestureMoved.value = true
    return
  }

  if (!dragStart.value) {
    return
  }

  const deltaX = event.clientX - dragStart.value.x
  const deltaY = event.clientY - dragStart.value.y

  if (Math.hypot(deltaX, deltaY) > 6) {
    hasGestureMoved.value = true
  }

  if (scale.value <= 1) {
    return
  }

  translateX.value = dragStart.value.translateX + deltaX
  translateY.value = dragStart.value.translateY + deltaY
}

/**
 * @description: 指针结束
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function handlePointerEnd(event: PointerEvent): void {
  activePointers.delete(event.pointerId)

  if (activePointers.size === 0) {
    dragStart.value = null
    pinchStart.value = null
  }
}

/**
 * @description: 热区点击准备
 * @description 热区会截断画布拖拽事件，因此这里单独清理上一次查看手势留下的误触标记。
 * @return {void} 无返回值
 */
function prepareHotspotClick(): void {
  hasGestureMoved.value = false
}

/**
 * @description: 触发字段编辑
 * @description 如果本次操作已被判定为拖拽或缩放，则吃掉点击，防止误开弹窗。
 * @param {CertificateTemplateField} field - 被点击字段
 * @return {void} 无返回值
 */
function requestEdit(field: CertificateTemplateField): void {
  if (hasGestureMoved.value || !field.editor) {
    return
  }

  emit('edit', field.editor)
}
</script>

<template>
  <div
    class="certificate-proof-canvas"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
  >
    <div class="certificate-proof-canvas__stage" :style="stageStyle">
      <img :src="imageSrc" alt="" class="certificate-proof-canvas__base" draggable="false" />

      <div
        v-for="field in imageFields"
        :key="field.id"
        class="certificate-proof-canvas__image-field"
        :style="getImageFieldStyle(field)"
      >
        <img
          v-if="field.id === 'avatar' && avatarSrc"
          :src="avatarSrc"
          alt=""
          :style="getImageContentStyle(field)"
          draggable="false"
        />
      </div>

      <div
        v-for="field in textFields"
        :key="field.id"
        class="certificate-proof-canvas__text-field"
        :style="getTextFieldStyle(field)"
      >
        <AutoFitText
          v-if="field.contentWidth"
          :text="getFieldValue(field)"
          :max-font-size="getTextFieldMaxFontSize(field)"
          :line-height="getTextFieldLineHeight(field)"
          vertical-align="bottom"
        />
        <template v-else>
          {{ getFieldValue(field) }}
        </template>
      </div>

      <button
        v-for="field in editableFields"
        :key="`hotspot-${field.id}`"
        type="button"
        class="certificate-proof-canvas__hotspot"
        :style="getHotspotStyle(field)"
        :aria-label="fieldLabels[field.id]"
        data-proof-hotspot="true"
        data-sound="open"
        @pointerdown.stop="prepareHotspotClick"
        @pointermove.stop
        @pointerup.stop
        @pointercancel.stop
        @click.stop="requestEdit(field)"
      >
        <span>{{ fieldLabels[field.id] }}</span>
      </button>

      <div class="certificate-proof-canvas__watermark">
        {{ watermark }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.certificate-proof-canvas {
  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 1672 / 941;
  border: 1px solid rgba(196, 138, 44, 0.34);
  border-radius: 10px;
  background: #fffafc;
  box-shadow: 0 16px 38px rgba(122, 78, 98, 0.16);
  touch-action: none;
}

.certificate-proof-canvas__stage {
  position: absolute;
  inset: 0;
  container-type: inline-size;
  transform-origin: 0 0;
  transition: transform 120ms ease;
}

.certificate-proof-canvas__base {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}

.certificate-proof-canvas__image-field,
.certificate-proof-canvas__text-field,
.certificate-proof-canvas__hotspot {
  position: absolute;
}

.certificate-proof-canvas__image-field {
  overflow: hidden;
  pointer-events: none;
}

.certificate-proof-canvas__image-field img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  mask-image: radial-gradient(
    ellipse at center,
    #000 64%,
    rgba(0, 0, 0, 0.82) 74%,
    transparent 100%
  );
  mask-size: 100% 100%;
  mask-repeat: no-repeat;
  transform-origin: center center;
  -webkit-mask-image: radial-gradient(
    ellipse at center,
    #000 64%,
    rgba(0, 0, 0, 0.82) 74%,
    transparent 100%
  );
  -webkit-mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
}

.certificate-proof-canvas__text-field {
  z-index: 2;
  white-space: nowrap;
  pointer-events: none;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
}

.certificate-proof-canvas__hotspot {
  z-index: 4;
  display: grid;
  place-items: start end;
  padding: 0;
  border: 1px dashed rgba(239, 95, 143, 0.54);
  border-radius: 7px;
  color: #a8446b;
  background: rgba(255, 244, 248, 0.14);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.certificate-proof-canvas__hotspot:hover,
.certificate-proof-canvas__hotspot:focus-visible {
  border-color: rgba(239, 95, 143, 0.95);
  background: rgba(255, 244, 248, 0.34);
  box-shadow: 0 0 0 3px rgba(239, 95, 143, 0.14);
  outline: none;
}

.certificate-proof-canvas__hotspot span {
  max-width: min(180px, 100%);
  margin: -24px -1px 0 0;
  padding: 3px 8px;
  overflow: hidden;
  border-radius: 999px;
  color: #7a3154;
  background: rgba(255, 249, 252, 0.92);
  box-shadow: 0 6px 16px rgba(122, 78, 98, 0.12);
  font-size: 11px;
  font-weight: 720;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.18s ease,
    visibility 0.18s ease;
}

.certificate-proof-canvas__hotspot:hover span,
.certificate-proof-canvas__hotspot:focus-visible span {
  opacity: 1;
  visibility: visible;
}

.certificate-proof-canvas__watermark {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  color: rgba(239, 95, 143, 0.18);
  font-size: clamp(32px, 8cqw, 80px);
  font-weight: 820;
  letter-spacing: 0;
  pointer-events: none;
  transform: rotate(-18deg);
}

@media (max-width: 720px) {
  .certificate-proof-canvas {
    border-radius: 8px;
  }

  .certificate-proof-canvas__hotspot span {
    font-size: 9px;
  }
}
</style>
