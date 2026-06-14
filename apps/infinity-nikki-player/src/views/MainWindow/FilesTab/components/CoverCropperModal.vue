<script setup lang="ts">
/**
 * @description: 歌单封面裁剪弹窗
 * @description 使用 Cropper.js 2.x，输出固定 1:1 的 PNG 字节。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Modal, UploadDragger } from 'antdv-next'
import { ImagePlus } from 'lucide-vue-next'
import Cropper from 'cropperjs'
import type { UploadProps } from 'antdv-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: [data: Uint8Array]
}>()

const { t } = useI18n()
const imageElement = ref<HTMLImageElement | null>(null)
const cropperContainer = ref<HTMLElement | null>(null)
const selectedImageUrl = ref<string | null>(null)
const isCropping = ref(false)
const isCoverDragActive = ref(false)

let cropper: Cropper | null = null
let coverDragEnterDepth = 0

const cropperTemplate = `
  <cropper-canvas background>
    <cropper-image initial-center-size="cover" rotatable scalable skewable translatable></cropper-image>
    <cropper-shade hidden></cropper-shade>
    <cropper-handle action="select" plain></cropper-handle>
    <cropper-selection initial-coverage="0.8" aspect-ratio="1" movable resizable zoomable>
      <cropper-grid role="grid" covered></cropper-grid>
      <cropper-crosshair centered></cropper-crosshair>
      <cropper-handle action="move" theme-color="rgba(255,255,255,0.38)"></cropper-handle>
      <cropper-handle action="n-resize"></cropper-handle>
      <cropper-handle action="e-resize"></cropper-handle>
      <cropper-handle action="s-resize"></cropper-handle>
      <cropper-handle action="w-resize"></cropper-handle>
      <cropper-handle action="ne-resize"></cropper-handle>
      <cropper-handle action="nw-resize"></cropper-handle>
      <cropper-handle action="se-resize"></cropper-handle>
      <cropper-handle action="sw-resize"></cropper-handle>
    </cropper-selection>
  </cropper-canvas>
`

function destroyCropper(): void {
  cropper?.destroy()
  cropper = null
}

function revokeSelectedImage(): void {
  if (selectedImageUrl.value) URL.revokeObjectURL(selectedImageUrl.value)
  selectedImageUrl.value = null
}

function resetState(): void {
  destroyCropper()
  revokeSelectedImage()
  isCropping.value = false
  isCoverDragActive.value = false
  coverDragEnterDepth = 0
}

function hasCoverDragData(event: DragEvent): boolean {
  const items = Array.from(event.dataTransfer?.items ?? [])
  if (items.some((item) => item.kind === 'file')) return true
  if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) return true
  return (event.dataTransfer?.files.length ?? 0) > 0
}

function handleCoverDragEnter(event: DragEvent): void {
  if (!hasCoverDragData(event)) return
  event.preventDefault()
  event.stopPropagation()
  coverDragEnterDepth += 1
  isCoverDragActive.value = true
}

function handleCoverDragOver(event: DragEvent): void {
  if (!hasCoverDragData(event)) return
  event.preventDefault()
  event.stopPropagation()
  isCoverDragActive.value = true
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function handleCoverDragLeave(event: DragEvent): void {
  if (!hasCoverDragData(event)) return
  event.preventDefault()
  event.stopPropagation()
  coverDragEnterDepth = Math.max(0, coverDragEnterDepth - 1)
  if (coverDragEnterDepth === 0) {
    isCoverDragActive.value = false
  }
}

function handleCoverDrop(event: DragEvent): void {
  event.preventDefault()
  event.stopPropagation()
  isCoverDragActive.value = false
  coverDragEnterDepth = 0
}

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('image load failed'))
  })
}

async function initializeCropper(): Promise<void> {
  destroyCropper()
  await nextTick()
  if (!imageElement.value || !cropperContainer.value) return
  await waitForImageLoad(imageElement.value)
  cropper = new Cropper(imageElement.value, {
    container: cropperContainer.value,
    template: cropperTemplate,
  })
  await cropper.getCropperImage()?.$ready()
  cropper.getCropperImage()?.$center('cover')
}

const beforeUpload: UploadProps['beforeUpload'] = async (file) => {
  if (!file.type.startsWith('image/')) {
    return false
  }
  revokeSelectedImage()
  selectedImageUrl.value = URL.createObjectURL(file)
  await initializeCropper()
  return false
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas toBlob failed'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

async function confirmCrop(): Promise<void> {
  const selection = cropper?.getCropperSelection()
  if (!selection) return
  isCropping.value = true
  try {
    const canvas = await selection.$toCanvas({ width: 512, height: 512 })
    const blob = await canvasToBlob(canvas)
    emit('confirm', new Uint8Array(await blob.arrayBuffer()))
    emit('update:open', false)
    resetState()
  } finally {
    isCropping.value = false
  }
}

function closeModal(): void {
  emit('update:open', false)
  resetState()
}

watch(
  () => props.open,
  (open) => {
    if (!open) resetState()
  }
)

onBeforeUnmount(resetState)
</script>

<template>
  <Modal
    :open="open"
    :title="t('songList.cover.modalTitle')"
    width="720px"
    :footer="null"
    root-class="cover-cropper-modal-root"
    centered
    @cancel="closeModal"
    @update:open="(value) => !value && closeModal()"
  >
    <div class="cover-modal-body">
      <UploadDragger
        v-if="!selectedImageUrl"
        accept="image/*"
        :multiple="false"
        :show-upload-list="false"
        :before-upload="beforeUpload"
        class="cover-upload"
        :class="{ 'cover-upload-dragging': isCoverDragActive }"
        @dragenter="handleCoverDragEnter"
        @dragover="handleCoverDragOver"
        @dragleave="handleCoverDragLeave"
        @drop="handleCoverDrop"
      >
        <div class="upload-inner">
          <ImagePlus class="upload-icon" />
          <span class="upload-title">{{ t('songList.cover.uploadTitle') }}</span>
          <span class="upload-hint">{{ t('songList.cover.uploadHint') }}</span>
        </div>
      </UploadDragger>

      <div v-else class="cropper-shell">
        <div ref="cropperContainer" class="cropper-container">
          <img ref="imageElement" :src="selectedImageUrl" alt="" class="hidden-source" />
        </div>
        <div class="cropper-actions">
          <Button @click="resetState">
            {{ t('songList.cover.reselect') }}
          </Button>
          <Button type="primary" :loading="isCropping" @click="confirmCrop">
            {{ t('actions.save') }}
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.cover-modal-body {
  @apply flex min-h-[520px] flex-col;
  height: min(64vh, 620px);
}

.cover-upload {
  @apply block min-h-0 flex-1;
}

.cover-upload :deep(.ant-upload-wrapper),
.cover-upload :deep(.ant-upload),
.cover-upload :deep(.ant-upload-drag) {
  height: 100%;
}

.cover-upload :deep(.ant-upload),
.cover-upload :deep(.ant-upload-drag) {
  @apply flex h-full items-center justify-center rounded-2xl;
  background: var(--bg-white-50);
  border-color: var(--border-primary-30);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.cover-upload-dragging :deep(.ant-upload),
.cover-upload-dragging :deep(.ant-upload-drag) {
  background: var(--bg-primary-10);
  border-color: var(--color-primary);
  box-shadow:
    inset 0 0 0 1px var(--color-primary),
    0 18px 40px rgba(201, 67, 127, 0.16);
}

.cover-upload-dragging .upload-icon,
.cover-upload-dragging .upload-title {
  color: var(--color-primary);
}

.upload-inner {
  @apply flex flex-col items-center gap-3 px-6 text-center;
}

.upload-icon {
  width: 44px;
  height: 44px;
  color: var(--color-primary-active);
}

.upload-title {
  @apply text-base font-semibold;
  color: var(--color-foreground);
}

.upload-hint {
  @apply text-sm;
  color: var(--color-muted-dark);
}

.cropper-shell {
  @apply flex min-h-0 flex-1 flex-col gap-4;
}

.cropper-container {
  @apply min-h-0 flex-1 overflow-hidden rounded-2xl;
  background: var(--bg-white-50);
  border: 1px solid var(--border-primary-20);
}

.cropper-container :deep(cropper-canvas),
.cropper-container :deep(cropper-image),
.cropper-container :deep(cropper-shade),
.cropper-container :deep(cropper-selection) {
  width: 100%;
  height: 100%;
}

.cropper-container :deep(cropper-canvas) {
  min-width: 0;
  min-height: 0;
}

.hidden-source {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  pointer-events: none;
}

.cropper-actions {
  @apply flex justify-end gap-2;
}
</style>
