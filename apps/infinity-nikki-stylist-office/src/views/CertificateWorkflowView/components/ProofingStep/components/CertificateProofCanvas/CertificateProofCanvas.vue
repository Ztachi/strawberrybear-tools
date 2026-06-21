<script setup lang="ts">
/**
 * @description: CertificateProofCanvas - 证书核对图上交互画布
 * @description 根据模板 manifest 渲染语言底图、动态字段和可编辑热区。
 */
import { computed } from 'vue'
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

/** 模板动态字段按渲染类型拆分，避免模板里写复杂判断。 */
const imageFields = computed(() => props.manifest.fields.filter((field) => field.kind === 'image'))
const textFields = computed(() => props.manifest.fields.filter((field) => field.kind === 'text'))
const editableFields = computed(() => props.manifest.fields.filter((field) => field.editable))

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
</script>

<template>
  <div class="certificate-proof-canvas">
    <div class="certificate-proof-canvas__stage">
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
