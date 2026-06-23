<script setup lang="ts">
/**
 * @description: CertificateProofCanvas - 证书核对图上交互画布
 * @description 根据模板 manifest 渲染语言底图、动态字段和可编辑热区。
 */
import { computed, ref } from 'vue'
import AutoFitText from '@/components/AutoFitText/AutoFitText.vue'
import {
  areDraftImageTransformsEqual,
  clampAvatarImageTransform,
  DEFAULT_DRAFT_IMAGE_TRANSFORM,
} from '@/domain/draft/imageTransform'
import type { DraftImageTransform } from '@/domain/draft/types'
import type { LocaleCode } from '@/domain/catalog/types'
import type {
  CertificateTemplateEditorKind,
  CertificateTemplateField,
  CertificateTemplateManifest,
} from '@/domain/template/types'

const props = defineProps<{
  /** 当前模板 manifest */
  manifest: CertificateTemplateManifest
  /** 当前证书语言 */
  locale: LocaleCode
  /** 当前语言底图 URL */
  imageSrc: string
  /** 当前头像 URL */
  avatarSrc: string
  /** 当前头像是否来自用户自定义素材 */
  avatarIsCustom: boolean
  /** 当前头像取景参数 */
  avatarTransform: DraftImageTransform
  /** 动态字段值 */
  fieldValues: Record<string, string>
  /** 可编辑热区提示文案 */
  fieldLabels: Record<string, string>
  /** 头像取景还原按钮文案 */
  avatarResetLabel: string
  /** 校样水印 */
  watermark: string
}>()

const emit = defineEmits<{
  /** 请求打开指定字段编辑器 */
  edit: [editor: CertificateTemplateEditorKind]
  /** 预览头像取景参数，不立即持久化 */
  avatarTransformPreview: [transform: DraftImageTransform]
  /** 提交头像取景参数 */
  avatarTransformCommit: [transform: DraftImageTransform]
}>()

/** 模板动态字段按渲染类型拆分，避免模板里写复杂判断。 */
const imageFields = computed(() => props.manifest.fields.filter((field) => field.kind === 'image'))
const textFields = computed(() => props.manifest.fields.filter((field) => field.kind === 'text'))
const editableFields = computed(() => props.manifest.fields.filter((field) => field.editable))
const hotspotFields = computed(() => editableFields.value.filter((field) => field.id !== 'avatar'))
const canResetAvatarTransform = computed(
  () => !areDraftImageTransformsEqual(props.avatarTransform, DEFAULT_DRAFT_IMAGE_TRANSFORM)
)
/** 头像手势是否正在进行。 */
const isAvatarGestureActive = ref(false)

interface PointerPoint {
  /** 横向坐标 */
  x: number
  /** 纵向坐标 */
  y: number
}

interface PointerSnapshot extends PointerPoint {
  /** pointerId */
  id: number
}

interface DragState {
  /** 操作开始时的指针 */
  pointer: PointerSnapshot
  /** 操作开始时的取景参数 */
  transform: DraftImageTransform
  /** 头像区域宽度 */
  width: number
  /** 头像区域高度 */
  height: number
}

interface PinchState {
  /** 操作开始时双指距离 */
  distance: number
  /** 操作开始时双指中心 */
  midpoint: PointerPoint
  /** 操作开始时的取景参数 */
  transform: DraftImageTransform
  /** 头像区域宽度 */
  width: number
  /** 头像区域高度 */
  height: number
}

/** 当前参与头像手势的指针。 */
const avatarPointers = new Map<number, PointerSnapshot>()
let avatarDragState: DragState | null = null
let avatarPinchState: PinchState | null = null
let latestAvatarTransform: DraftImageTransform = { ...DEFAULT_DRAFT_IMAGE_TRANSFORM }
let avatarGestureHasTransformChange = false

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
 * @description: 获取字段在当前语言底图上的实际坐标
 * @param {CertificateTemplateField} field - 模板字段
 * @return {[number, number]} 语言微调后的坐标
 */
function getFieldPosition(field: CertificateTemplateField): [number, number] {
  const [x, y] = field.position
  const offset = field.localePositionOffset?.[props.locale]

  return [x + (offset?.x ?? 0), y + (offset?.y ?? 0)]
}

/**
 * @description: 生成图片字段样式
 * @param {CertificateTemplateField} field - 模板图片字段
 * @return {Record<string, string>} Vue 样式
 */
function getImageFieldStyle(field: CertificateTemplateField): Record<string, string> {
  const [x, y] = getFieldPosition(field)
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
  const [x, y] = getFieldPosition(field)
  const textStyle = field.textStyle
  const fontSize = textStyle?.fontSize ?? 22
  const lineHeight = textStyle?.lineHeight ?? 1.1
  return {
    left: `${xPercent(x)}%`,
    top: `${yPercent(y)}%`,
    width: field.contentWidth ? `${xPercent(field.contentWidth)}%` : 'auto',
    color: textStyle?.color ?? '#5c4639',
    fontFamily: textStyle?.fontFamily ?? 'serif',
    fontSize: `${(fontSize / props.manifest.baseSize.width) * 100}cqw`,
    fontWeight: `${textStyle?.fontWeight ?? 600}`,
    lineHeight: `${lineHeight}`,
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

  if (field.id === 'avatar') {
    const avatarTransform = clampAvatarImageTransform(props.avatarTransform)
    const baseScale = props.avatarIsCustom ? (field.customImageScale ?? 1) : 1

    imageStyle.transform = `translate(${avatarTransform.x}%, ${avatarTransform.y}%) scale(${
      baseScale * avatarTransform.scale
    })`
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
 * @description: 获取文字垂直对齐方式
 * @param {CertificateTemplateField} field - 模板文字字段
 * @return {'center' | 'bottom'} AutoFitText 对齐方式
 */
function getTextFieldVerticalAlign(field: CertificateTemplateField): 'center' | 'bottom' {
  return field.textStyle?.verticalAlign === 'middle' ? 'center' : 'bottom'
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
 * @description: 触发字段编辑
 * @param {CertificateTemplateField} field - 被点击字段
 * @return {void} 无返回值
 */
function requestEdit(field: CertificateTemplateField): void {
  if (!field.editor) {
    return
  }

  emit('edit', field.editor)
}

/**
 * @description: 生成指针快照
 * @param {PointerEvent} event - 指针事件
 * @return {PointerSnapshot} 指针快照
 */
function createPointerSnapshot(event: PointerEvent): PointerSnapshot {
  return {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  }
}

/**
 * @description: 获取双指距离
 * @param {PointerSnapshot} first - 第一个指针
 * @param {PointerSnapshot} second - 第二个指针
 * @return {number} 指针距离
 */
function getPointerDistance(first: PointerPoint, second: PointerPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

/**
 * @description: 获取双指中心
 * @param {PointerSnapshot} first - 第一个指针
 * @param {PointerSnapshot} second - 第二个指针
 * @return {Omit<PointerSnapshot, 'id'>} 指针中心
 */
function getPointerMidpoint(
  first: PointerSnapshot,
  second: PointerSnapshot
): PointerPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

/**
 * @description: 发送头像取景预览
 * @param {DraftImageTransform} transform - 待预览的取景参数
 * @return {void} 无返回值
 */
function previewAvatarTransform(transform: DraftImageTransform): void {
  latestAvatarTransform = clampAvatarImageTransform(transform)
  emit('avatarTransformPreview', latestAvatarTransform)
}

/**
 * @description: 提交当前头像取景
 * @return {void} 无返回值
 */
function commitLatestAvatarTransform(): void {
  emit('avatarTransformCommit', latestAvatarTransform)
}

/**
 * @description: 还原头像取景
 * @return {void} 无返回值
 */
function resetAvatarTransform(): void {
  latestAvatarTransform = { ...DEFAULT_DRAFT_IMAGE_TRANSFORM }
  emit('avatarTransformPreview', latestAvatarTransform)
  emit('avatarTransformCommit', latestAvatarTransform)
}

/**
 * @description: 读取头像区域尺寸
 * @param {HTMLElement} element - 头像区域元素
 * @return {{ width: number; height: number }} 尺寸
 */
function getAvatarFieldSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect()

  return {
    width: Math.max(rect.width, 1),
    height: Math.max(rect.height, 1),
  }
}

/**
 * @description: 开始单指拖拽
 * @param {HTMLElement} element - 头像区域元素
 * @param {PointerSnapshot} pointer - 当前指针
 * @return {void} 无返回值
 */
function startAvatarDrag(element: HTMLElement, pointer: PointerSnapshot): void {
  avatarDragState = {
    pointer,
    transform: latestAvatarTransform,
    ...getAvatarFieldSize(element),
  }
  avatarPinchState = null
}

/**
 * @description: 开始双指缩放
 * @param {HTMLElement} element - 头像区域元素
 * @return {void} 无返回值
 */
function startAvatarPinch(element: HTMLElement): void {
  const [first, second] = Array.from(avatarPointers.values())

  if (!first || !second) {
    return
  }

  avatarPinchState = {
    distance: Math.max(getPointerDistance(first, second), 1),
    midpoint: getPointerMidpoint(first, second),
    transform: latestAvatarTransform,
    ...getAvatarFieldSize(element),
  }
  avatarDragState = null
}

/**
 * @description: 处理头像指针按下
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function handleAvatarPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }

  const element = event.currentTarget as HTMLElement
  const pointer = createPointerSnapshot(event)

  if (avatarPointers.size === 0) {
    avatarGestureHasTransformChange = false
    latestAvatarTransform = clampAvatarImageTransform(props.avatarTransform)
  }

  avatarPointers.set(event.pointerId, pointer)
  element.setPointerCapture(event.pointerId)
  isAvatarGestureActive.value = true

  if (avatarPointers.size >= 2) {
    startAvatarPinch(element)
  } else {
    startAvatarDrag(element, pointer)
  }

  event.preventDefault()
}

/**
 * @description: 处理头像指针移动
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function handleAvatarPointerMove(event: PointerEvent): void {
  if (!avatarPointers.has(event.pointerId)) {
    return
  }

  avatarPointers.set(event.pointerId, createPointerSnapshot(event))

  if (avatarPinchState && avatarPointers.size >= 2) {
    const [first, second] = Array.from(avatarPointers.values())

    if (!first || !second) {
      return
    }

    const midpoint = getPointerMidpoint(first, second)
    const distance = getPointerDistance(first, second)
    const movedDistance = getPointerDistance(midpoint, avatarPinchState.midpoint)
    const scaledDistance = Math.abs(distance - avatarPinchState.distance)

    if (movedDistance <= 3 && scaledDistance <= 3) {
      return
    }

    const rawTransform = {
      x:
        avatarPinchState.transform.x +
        ((midpoint.x - avatarPinchState.midpoint.x) / avatarPinchState.width) * 100,
      y:
        avatarPinchState.transform.y +
        ((midpoint.y - avatarPinchState.midpoint.y) / avatarPinchState.height) * 100,
      scale: avatarPinchState.transform.scale * (distance / avatarPinchState.distance),
    }
    const nextTransform = clampAvatarImageTransform(rawTransform)

    avatarGestureHasTransformChange = true
    previewAvatarTransform(nextTransform)
    event.preventDefault()
    return
  }

  if (!avatarDragState) {
    return
  }

  const pointer = avatarPointers.get(event.pointerId)

  if (!pointer) {
    return
  }

  const deltaX = pointer.x - avatarDragState.pointer.x
  const deltaY = pointer.y - avatarDragState.pointer.y

  if (Math.hypot(deltaX, deltaY) <= 3) {
    return
  }

  avatarGestureHasTransformChange = true
  const rawTransform = {
    x: avatarDragState.transform.x + (deltaX / avatarDragState.width) * 100,
    y: avatarDragState.transform.y + (deltaY / avatarDragState.height) * 100,
    scale: avatarDragState.transform.scale,
  }
  const nextTransform = clampAvatarImageTransform(rawTransform)

  if (!areDraftImageTransformsEqual(rawTransform, nextTransform)) {
    avatarDragState = {
      pointer,
      transform: nextTransform,
      width: avatarDragState.width,
      height: avatarDragState.height,
    }
  }

  previewAvatarTransform(nextTransform)
  event.preventDefault()
}

/**
 * @description: 结束头像指针手势
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function handleAvatarPointerEnd(event: PointerEvent): void {
  const element = event.currentTarget as HTMLElement

  if (avatarPointers.has(event.pointerId)) {
    avatarPointers.delete(event.pointerId)
  }

  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId)
  }

  if (avatarPointers.size === 0) {
    if (avatarGestureHasTransformChange) {
      commitLatestAvatarTransform()
    }

    avatarDragState = null
    avatarPinchState = null
    avatarGestureHasTransformChange = false
    isAvatarGestureActive.value = false
    return
  }

  const remainingPointer = Array.from(avatarPointers.values())[0]

  if (remainingPointer) {
    startAvatarDrag(element, remainingPointer)
  }
}

/**
 * @description: 取消头像指针手势
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function handleAvatarPointerCancel(event: PointerEvent): void {
  const element = event.currentTarget as HTMLElement

  if (avatarPointers.has(event.pointerId)) {
    avatarPointers.delete(event.pointerId)
  }

  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId)
  }

  if (avatarPointers.size === 0) {
    if (avatarGestureHasTransformChange) {
      commitLatestAvatarTransform()
    }

    avatarDragState = null
    avatarPinchState = null
    avatarGestureHasTransformChange = false
    isAvatarGestureActive.value = false
  }
}

/**
 * @description: 处理头像滚轮缩放
 * @param {WheelEvent} event - 滚轮事件
 * @return {void} 无返回值
 */
function handleAvatarWheel(event: WheelEvent): void {
  const currentTransform = clampAvatarImageTransform(props.avatarTransform)
  const nextTransform = clampAvatarImageTransform({
    ...currentTransform,
    scale: currentTransform.scale * Math.exp(-event.deltaY * 0.0016),
  })

  previewAvatarTransform(nextTransform)
  commitLatestAvatarTransform()
}
</script>

<template>
  <div class="certificate-proof-canvas">
    <div class="certificate-proof-canvas__stage">
      <img :src="imageSrc" alt="" class="certificate-proof-canvas__base" draggable="false" />

      <div
        v-for="field in imageFields"
        :key="field.id"
        :class="[
          'certificate-proof-canvas__image-field',
          field.id === 'avatar' ? 'certificate-proof-canvas__image-field--avatar' : '',
          field.id === 'avatar' && isAvatarGestureActive ? 'is-dragging' : '',
        ]"
        :style="getImageFieldStyle(field)"
        :aria-label="field.id === 'avatar' ? fieldLabels[field.id] : undefined"
        @pointerdown="field.id === 'avatar' ? handleAvatarPointerDown($event) : undefined"
        @pointermove="field.id === 'avatar' ? handleAvatarPointerMove($event) : undefined"
        @pointerup="field.id === 'avatar' ? handleAvatarPointerEnd($event) : undefined"
        @pointercancel="field.id === 'avatar' ? handleAvatarPointerCancel($event) : undefined"
        @wheel.prevent="field.id === 'avatar' ? handleAvatarWheel($event) : undefined"
      >
        <div class="certificate-proof-canvas__image-clip">
          <img
            v-if="field.id === 'avatar' && avatarSrc"
            :src="avatarSrc"
            alt=""
            :style="getImageContentStyle(field)"
            draggable="false"
          />
        </div>
        <button
          v-if="field.id === 'avatar'"
          type="button"
          class="certificate-proof-canvas__avatar-edit-button"
          :aria-label="fieldLabels[field.id]"
          :title="fieldLabels[field.id]"
          data-sound="open"
          @click.stop="requestEdit(field)"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
          @pointercancel.stop
        >
          <v-icon icon="mdi-pencil-outline" size="1em" aria-hidden="true" />
        </button>
        <button
          v-if="field.id === 'avatar' && canResetAvatarTransform"
          type="button"
          class="certificate-proof-canvas__avatar-reset-button"
          :aria-label="avatarResetLabel"
          :title="avatarResetLabel"
          data-sound="open"
          @click.stop="resetAvatarTransform"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
          @pointercancel.stop
        >
          <v-icon icon="mdi-restore" size="1em" aria-hidden="true" />
        </button>
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
          :vertical-align="getTextFieldVerticalAlign(field)"
        />
        <template v-else>
          {{ getFieldValue(field) }}
        </template>
      </div>

      <button
        v-for="field in hotspotFields"
        :key="`hotspot-${field.id}`"
        type="button"
        class="certificate-proof-canvas__hotspot"
        :style="getHotspotStyle(field)"
        :aria-label="fieldLabels[field.id]"
        data-proof-hotspot="true"
        data-sound="open"
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
  touch-action: manipulation;
}

.certificate-proof-canvas__stage {
  position: absolute;
  inset: 0;
  container-type: inline-size;
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
  pointer-events: none;
}

.certificate-proof-canvas__image-field--avatar {
  --avatar-action-size: clamp(24px, 6.8vw, 34px);
  --avatar-action-offset: calc(var(--avatar-action-size) * -0.44);
  --avatar-action-icon-size: clamp(13px, 3.5vw, 16px);
  z-index: 5;
  overflow: visible;
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}

.certificate-proof-canvas__image-field--avatar.is-dragging {
  cursor: grabbing;
}

.certificate-proof-canvas__image-field--avatar:focus-visible {
  outline: 2px solid rgba(239, 95, 143, 0.85);
  outline-offset: 3px;
}

.certificate-proof-canvas__image-clip {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.certificate-proof-canvas__image-clip img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  mask-image: radial-gradient(
    ellipse at center,
    #000 56%,
    rgba(0, 0, 0, 0.9) 66%,
    rgba(0, 0, 0, 0.45) 84%,
    transparent 100%
  );
  mask-size: 100% 100%;
  mask-repeat: no-repeat;
  transform-origin: center center;
  -webkit-mask-image: radial-gradient(
    ellipse at center,
    #000 56%,
    rgba(0, 0, 0, 0.9) 66%,
    rgba(0, 0, 0, 0.45) 84%,
    transparent 100%
  );
  -webkit-mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
}

.certificate-proof-canvas__avatar-edit-button {
  position: absolute;
  top: var(--avatar-action-offset);
  right: var(--avatar-action-offset);
  z-index: 1;
  display: grid;
  width: var(--avatar-action-size);
  height: var(--avatar-action-size);
  padding: 0;
  place-items: center;
  border-radius: 50%;
  border: 1px solid rgba(239, 95, 143, 0.48);
  color: #7a3154;
  font-size: var(--avatar-action-icon-size);
  background: rgba(255, 249, 252, 0.94);
  box-shadow: 0 6px 16px rgba(122, 78, 98, 0.12);
  cursor: pointer;
  pointer-events: auto;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.certificate-proof-canvas__avatar-edit-button:hover,
.certificate-proof-canvas__avatar-edit-button:focus-visible {
  border-color: rgba(239, 95, 143, 0.95);
  background: rgba(255, 249, 252, 0.98);
  box-shadow: 0 0 0 3px rgba(239, 95, 143, 0.14);
  outline: none;
}

.certificate-proof-canvas__avatar-reset-button {
  position: absolute;
  top: var(--avatar-action-offset);
  left: var(--avatar-action-offset);
  z-index: 1;
  display: grid;
  width: var(--avatar-action-size);
  height: var(--avatar-action-size);
  padding: 0;
  place-items: center;
  border: 1px solid rgba(122, 81, 53, 0.36);
  border-radius: 50%;
  color: #6e4b34;
  font-size: var(--avatar-action-icon-size);
  background: rgba(255, 249, 252, 0.94);
  box-shadow: 0 6px 16px rgba(122, 78, 98, 0.12);
  cursor: pointer;
  pointer-events: auto;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.certificate-proof-canvas__avatar-reset-button:hover,
.certificate-proof-canvas__avatar-reset-button:focus-visible {
  border-color: rgba(122, 81, 53, 0.72);
  background: rgba(255, 249, 252, 0.98);
  box-shadow: 0 0 0 3px rgba(122, 81, 53, 0.12);
  outline: none;
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
