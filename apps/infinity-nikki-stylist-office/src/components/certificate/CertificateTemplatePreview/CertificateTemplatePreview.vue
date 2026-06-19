<script setup lang="ts">
/**
 * @description: CertificateTemplatePreview - 证书模板预览
 * @description 使用 bg.png 临时底图渲染证书校样，并叠加当前草稿的多语言模板文字。
 */
import { computed, ref } from 'vue'
import templateBaseImage from '@/assets/images/bg.png'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { resolveTemplateTextPosition } from '@/domain/draft/templatePositions'
import { getTemplateLocaleMessages } from '@/i18n/template'
import type {
  CertificateDraft,
  TemplateTextLayerId,
  TemplateTextPosition,
} from '@/domain/draft/types'

/**
 * @description: 证书预览属性
 * @param {CertificateDraft} draft - 当前办理草稿
 * @param {TemplateTextLayerId | null} [selectedLayerId] - 正在编辑的文字层
 * @param {boolean} [editable] - 是否允许直接拖动文字层
 */
const props = defineProps<{
  draft: CertificateDraft
  selectedLayerId?: TemplateTextLayerId | null
  editable?: boolean
}>()

const emit = defineEmits<{
  selectLayer: [layerId: TemplateTextLayerId]
  positionChange: [layerId: TemplateTextLayerId, position: TemplateTextPosition]
  positionCommit: [layerId: TemplateTextLayerId, position: TemplateTextPosition]
}>()

/** 当前正在拖动的文字层，拖动结束时用于提交保存。 */
const draggingLayerId = ref<TemplateTextLayerId | null>(null)

/** 当前模板固定文案，跟随草稿证书语言即时切换。 */
const templateCopy = computed(() => getTemplateLocaleMessages(props.draft.certificateLocale))

/** 当前称号资料，缺失时返回 undefined 让视图展示占位。 */
const selectedTitle = computed(() =>
  associationCatalogSeed.titleOptions.find((option) => option.id === props.draft.titleId)
)

/** 当前地区资料，用于显示地区名和编号前缀。 */
const selectedRegion = computed(() =>
  associationCatalogSeed.regions.find((option) => option.id === props.draft.regionId)
)

/** 当前协会评语资料，评语 ID 在草稿创建时已固定。 */
const selectedComment = computed(() =>
  associationCatalogSeed.comments.find((option) => option.id === props.draft.commentId)
)

/** 证书编号在正式签发前只展示地区前缀和待编录占位。 */
const pendingCertificateNo = computed(() => {
  const regionCode = selectedRegion.value?.code ?? '---'
  return `MC-${regionCode}-${templateCopy.value.pendingCertificateNo}`
})

/** 当前语言下的称号名称。 */
const titleName = computed(() =>
  selectedTitle.value
    ? resolveLocalizedText(selectedTitle.value.name, props.draft.certificateLocale)
    : ''
)

/** 当前语言下的地区名称。 */
const regionName = computed(() =>
  selectedRegion.value
    ? resolveLocalizedText(selectedRegion.value.name, props.draft.certificateLocale)
    : ''
)

/** 当前语言下的协会评语。 */
const commentText = computed(() =>
  selectedComment.value
    ? resolveLocalizedText(selectedComment.value.text, props.draft.certificateLocale)
    : ''
)

/**
 * @description: 生成文字层定位样式
 * @description 使用百分比定位，让 bg.png 缩放后文字仍跟随版面。
 * @param {TemplateTextLayerId} layerId - 文字层 ID
 * @return {Record<string, string>} Vue style 对象
 */
function getLayerStyle(layerId: TemplateTextLayerId): Record<string, string> {
  const position = resolveTemplateTextPosition(layerId, props.draft.templateTextPositions)

  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
  }
}

/**
 * @description: 按指针位置换算模板百分比坐标
 * @description 文字层位置存百分比，保证预览尺寸变化后仍能落在同一版面位置。
 * @param {PointerEvent} event - 指针事件
 * @return {TemplateTextPosition} 百分比坐标
 */
function getPointerPosition(event: PointerEvent): TemplateTextPosition {
  const bounds = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect()

  if (!bounds) {
    return { x: 0, y: 0 }
  }

  return {
    x: Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)),
    y: Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100)),
  }
}

/**
 * @description: 开始拖动文字层
 * @description 校样页用这个能力完成最简单的模板定位，登记页保持只读预览。
 * @param {TemplateTextLayerId} layerId - 被拖动的文字层
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function beginLayerDrag(layerId: TemplateTextLayerId, event: PointerEvent): void {
  if (!props.editable) {
    return
  }

  draggingLayerId.value = layerId
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  emit('selectLayer', layerId)
  emit('positionChange', layerId, getPointerPosition(event))
}

/**
 * @description: 拖动中更新文字层位置
 * @description 只通知父组件更新当前画面，不在每一次移动中写入 Dexie。
 * @param {TemplateTextLayerId} layerId - 被拖动的文字层
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function moveLayer(layerId: TemplateTextLayerId, event: PointerEvent): void {
  if (!props.editable || draggingLayerId.value !== layerId) {
    return
  }

  emit('positionChange', layerId, getPointerPosition(event))
}

/**
 * @description: 结束拖动文字层
 * @description 松开指针后提交最终位置，保证刷新后仍能恢复。
 * @param {TemplateTextLayerId} layerId - 被拖动的文字层
 * @param {PointerEvent} event - 指针事件
 * @return {void} 无返回值
 */
function endLayerDrag(layerId: TemplateTextLayerId, event: PointerEvent): void {
  if (!props.editable || draggingLayerId.value !== layerId) {
    return
  }

  const position = getPointerPosition(event)
  draggingLayerId.value = null
  emit('positionChange', layerId, position)
  emit('positionCommit', layerId, position)
}
</script>

<template>
  <div
    :class="['certificate-template-preview', { 'certificate-template-preview--editable': editable }]"
  >
    <img :src="templateBaseImage" alt="" class="certificate-template-preview__base" />

    <div
      :class="[
        'certificate-template-preview__layer',
        'certificate-template-preview__layer--title',
        { 'certificate-template-preview__layer--selected': selectedLayerId === 'certificateTitle' },
      ]"
      :style="getLayerStyle('certificateTitle')"
      data-sound="drag"
      @click.stop="emit('selectLayer', 'certificateTitle')"
      @pointerdown.stop.prevent="beginLayerDrag('certificateTitle', $event)"
      @pointermove.stop.prevent="moveLayer('certificateTitle', $event)"
      @pointerup.stop.prevent="endLayerDrag('certificateTitle', $event)"
      @pointercancel.stop.prevent="endLayerDrag('certificateTitle', $event)"
    >
      {{ templateCopy.certificateTitle }}
    </div>

    <div
      :class="[
        'certificate-template-preview__layer',
        { 'certificate-template-preview__layer--selected': selectedLayerId === 'name' },
      ]"
      :style="getLayerStyle('name')"
      data-sound="drag"
      @click.stop="emit('selectLayer', 'name')"
      @pointerdown.stop.prevent="beginLayerDrag('name', $event)"
      @pointermove.stop.prevent="moveLayer('name', $event)"
      @pointerup.stop.prevent="endLayerDrag('name', $event)"
      @pointercancel.stop.prevent="endLayerDrag('name', $event)"
    >
      <span>{{ templateCopy.nameLabel }}</span>
      <strong>{{ draft.stylistName || templateCopy.namePlaceholder }}</strong>
    </div>

    <div
      :class="[
        'certificate-template-preview__layer',
        { 'certificate-template-preview__layer--selected': selectedLayerId === 'stylistTitle' },
      ]"
      :style="getLayerStyle('stylistTitle')"
      data-sound="drag"
      @click.stop="emit('selectLayer', 'stylistTitle')"
      @pointerdown.stop.prevent="beginLayerDrag('stylistTitle', $event)"
      @pointermove.stop.prevent="moveLayer('stylistTitle', $event)"
      @pointerup.stop.prevent="endLayerDrag('stylistTitle', $event)"
      @pointercancel.stop.prevent="endLayerDrag('stylistTitle', $event)"
    >
      <span>{{ templateCopy.stylistTitleLabel }}</span>
      <strong>{{ titleName || templateCopy.fieldPlaceholder }}</strong>
    </div>

    <div
      :class="[
        'certificate-template-preview__layer',
        { 'certificate-template-preview__layer--selected': selectedLayerId === 'region' },
      ]"
      :style="getLayerStyle('region')"
      data-sound="drag"
      @click.stop="emit('selectLayer', 'region')"
      @pointerdown.stop.prevent="beginLayerDrag('region', $event)"
      @pointermove.stop.prevent="moveLayer('region', $event)"
      @pointerup.stop.prevent="endLayerDrag('region', $event)"
      @pointercancel.stop.prevent="endLayerDrag('region', $event)"
    >
      <span>{{ templateCopy.regionLabel }}</span>
      <strong>{{ regionName || templateCopy.fieldPlaceholder }}</strong>
    </div>

    <div
      :class="[
        'certificate-template-preview__layer',
        'certificate-template-preview__layer--comment',
        { 'certificate-template-preview__layer--selected': selectedLayerId === 'comment' },
      ]"
      :style="getLayerStyle('comment')"
      data-sound="drag"
      @click.stop="emit('selectLayer', 'comment')"
      @pointerdown.stop.prevent="beginLayerDrag('comment', $event)"
      @pointermove.stop.prevent="moveLayer('comment', $event)"
      @pointerup.stop.prevent="endLayerDrag('comment', $event)"
      @pointercancel.stop.prevent="endLayerDrag('comment', $event)"
    >
      <span>{{ templateCopy.commentLabel }}</span>
      <strong>{{ commentText }}</strong>
    </div>

    <div
      :class="[
        'certificate-template-preview__layer',
        'certificate-template-preview__layer--number',
        { 'certificate-template-preview__layer--selected': selectedLayerId === 'certificateNo' },
      ]"
      :style="getLayerStyle('certificateNo')"
      data-sound="drag"
      @click.stop="emit('selectLayer', 'certificateNo')"
      @pointerdown.stop.prevent="beginLayerDrag('certificateNo', $event)"
      @pointermove.stop.prevent="moveLayer('certificateNo', $event)"
      @pointerup.stop.prevent="endLayerDrag('certificateNo', $event)"
      @pointercancel.stop.prevent="endLayerDrag('certificateNo', $event)"
    >
      <span>{{ templateCopy.certificateNoLabel }}</span>
      <strong>{{ pendingCertificateNo }}</strong>
    </div>

    <div
      :class="[
        'certificate-template-preview__layer',
        'certificate-template-preview__layer--president',
        { 'certificate-template-preview__layer--selected': selectedLayerId === 'president' },
      ]"
      :style="getLayerStyle('president')"
      data-sound="drag"
      @click.stop="emit('selectLayer', 'president')"
      @pointerdown.stop.prevent="beginLayerDrag('president', $event)"
      @pointermove.stop.prevent="moveLayer('president', $event)"
      @pointerup.stop.prevent="endLayerDrag('president', $event)"
      @pointercancel.stop.prevent="endLayerDrag('president', $event)"
    >
      <span>{{ templateCopy.presidentLabel }}</span>
      <strong>{{ templateCopy.presidentName }}</strong>
    </div>

    <div class="certificate-template-preview__watermark">
      {{ templateCopy.proofWatermark }}
    </div>
  </div>
</template>

<style scoped>
.certificate-template-preview {
  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 1672 / 941;
  border: 1px solid rgba(196, 138, 44, 0.34);
  border-radius: 12px;
  background: #fffafc;
  box-shadow: 0 16px 38px rgba(122, 78, 98, 0.16);
}

.certificate-template-preview__base {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.certificate-template-preview__layer {
  position: absolute;
  display: grid;
  max-width: 35%;
  gap: 0.18em;
  padding: 0.2% 0.5%;
  color: #5c4639;
  font-family: Georgia, 'Times New Roman', 'Noto Serif SC', serif;
  font-size: 14px;
  line-height: 1.25;
  transform: translateY(-50%);
}

.certificate-template-preview--editable .certificate-template-preview__layer {
  cursor: grab;
  touch-action: none;
}

.certificate-template-preview--editable .certificate-template-preview__layer:active {
  cursor: grabbing;
}

.certificate-template-preview__layer span {
  color: #9a6d2f;
  font-size: 0.68em;
  font-weight: 700;
  text-transform: uppercase;
}

.certificate-template-preview__layer strong {
  display: block;
  overflow-wrap: anywhere;
  font-weight: 760;
}

.certificate-template-preview__layer--title {
  max-width: 38%;
  color: #9a6d2f;
  font-size: 16px;
  font-weight: 780;
  letter-spacing: 0;
  text-transform: uppercase;
}

.certificate-template-preview__layer--comment {
  max-width: 34%;
  font-size: 11px;
  line-height: 1.45;
}

.certificate-template-preview__layer--number,
.certificate-template-preview__layer--president {
  max-width: 28%;
  font-size: 11px;
}

.certificate-template-preview__layer--selected {
  outline: 1px dashed rgba(239, 95, 143, 0.9);
  background: rgba(255, 234, 242, 0.76);
}

.certificate-template-preview__watermark {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(239, 95, 143, 0.22);
  font-size: 72px;
  font-weight: 820;
  letter-spacing: 0;
  pointer-events: none;
  transform: rotate(-18deg);
}

@media (max-width: 720px) {
  .certificate-template-preview__layer {
    font-size: 8px;
  }

  .certificate-template-preview__layer--title {
    font-size: 9px;
  }

  .certificate-template-preview__layer--comment {
    font-size: 7px;
  }

  .certificate-template-preview__watermark {
    font-size: 32px;
  }
}

@media (min-width: 1120px) {
  .certificate-template-preview__layer {
    font-size: 15px;
  }

  .certificate-template-preview__layer--title {
    font-size: 17px;
  }

  .certificate-template-preview__layer--comment,
  .certificate-template-preview__layer--number,
  .certificate-template-preview__layer--president {
    font-size: 12px;
  }
}
</style>
