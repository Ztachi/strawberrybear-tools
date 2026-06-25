<script setup lang="ts">
/**
 * @description: ProfileCustomAssetsPanel - 个人中心自定义资料页签
 * @description 使用表格管理自定义头像，提供搜索、筛选、新建、编辑、删除和裁剪上传。
 */
import Cropper from 'cropperjs'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  createCustomImageAsset,
  deleteCustomAsset,
  getCustomAsset,
  listCustomAssets,
  updateCustomImageAsset,
} from '@/db/repositories/customAssetRepository'
import { updateActiveDraft } from '@/db/repositories/draftRepository'
import {
  getDefaultCustomAssetCropAspectRatio,
  resolveCustomAssetCropAspectRatio,
  resolveCustomAssetOutputSize,
} from '@/domain/assets/crop'
import { loadBuiltinTemplatePackage } from '@/domain/template/registry'
import {
  useNavigationIntentStore,
  type WorkflowRouteName,
} from '@/stores/navigationIntent'
import { useUiStore } from '@/stores/ui'
import type {
  CustomAssetKind,
  CustomAssetCropSelection,
  CustomAssetCropTransform,
  CustomAssetRecord,
} from '@/domain/assets/types'

type AssetKindFilter = Extract<CustomAssetKind, 'avatar' | 'signature'>

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const navigationIntent = useNavigationIntentStore()

/** 表格搜索关键字。 */
const searchText = ref('')
/** 当前素材类型筛选，预留未来背景等类型扩展。 */
const assetKindFilter = ref<AssetKindFilter>('avatar')
/** 自定义头像列表。 */
const customAvatars = ref<CustomAssetRecord[]>([])
/** 自定义头像预览 URL。 */
const avatarPreviewUrls = ref<Record<string, string>>({})
/** 当前待编辑素材；为 null 表示新建。 */
const editingAsset = ref<CustomAssetRecord | null>(null)
/** 当前待删除素材。 */
const deletingAsset = ref<CustomAssetRecord | null>(null)
/** 当前正在查看大图的素材。 */
const previewingAsset = ref<CustomAssetRecord | null>(null)
/** 新建/编辑弹窗开关。 */
const isEditorOpen = ref(false)
/** 删除二次确认弹窗开关。 */
const isDeleteDialogOpen = ref(false)
/** 预览大图弹窗开关。 */
const isPreviewDialogOpen = ref(false)
/** 文件输入框引用。 */
const fileInput = ref<HTMLInputElement | null>(null)
/** CropperJS 容器。 */
const cropperContainer = ref<HTMLElement | null>(null)
/** CropperJS 使用的源图片。 */
const cropperImage = ref<HTMLImageElement | null>(null)
/** 当前上传原图 Blob。 */
const selectedOriginalBlob = ref<Blob | null>(null)
/** 当前上传原图 URL。 */
const sourceImageUrl = ref('')
/** 表单中的头像名称。 */
const avatarName = ref('')
/** 保存中状态。 */
const isSaving = ref(false)
/** 删除中状态。 */
const isDeleting = ref(false)
/** 编辑弹窗错误提示。 */
const editorErrorMessage = ref('')
/** CropperJS 实例。 */
const cropper = ref<Cropper | null>(null)
/** 裁剪器是否已经可以导出画布。 */
const isCropperReady = ref(false)
/** 当前裁剪器初始化序号，用来取消过期的异步初始化。 */
const cropperInitVersion = ref(0)
/** 当前原图是否来自已保存素材；替换新图时不复用旧裁剪状态。 */
const shouldRestoreCropState = ref(false)
/** 当前证书模板素材裁剪比例，跟随来源流程带来的 templateId 和素材类型。 */
const assetCropAspectRatio = ref(getDefaultCustomAssetCropAspectRatio('avatar'))
/** 当前裁剪比例加载序号，用于忽略过期的异步模板读取结果。 */
const cropAspectRatioLoadVersion = ref(0)

/** 从办理流程进入时保存后需要回到对应流程页。 */
const returnTo = computed<WorkflowRouteName | ''>(() => {
  if (navigationIntent.customAssetReturnTo) {
    return navigationIntent.customAssetReturnTo
  }

  return normalizeWorkflowRouteName(route.query.returnTo)
})

/** 是否从登记页或核对页进入自定义资料。 */
const shouldReturnToDraft = computed(() => returnTo.value === 'registration' || returnTo.value === 'proofing')

/** 当前来源流程携带的模板 ID。 */
const activeTemplateId = computed(() => {
  const fallbackTemplateId = 'template-miracle-continent-classic-001'

  if (navigationIntent.customAssetTemplateId) {
    return navigationIntent.customAssetTemplateId
  }

  return typeof route.query.templateId === 'string' ? route.query.templateId : fallbackTemplateId
})

/** 素材类型筛选项。 */
const assetKindItems = computed(() => [
  {
    title: t('assets.avatarAssetType'),
    value: 'avatar',
  },
  {
    title: t('assets.signatureAssetType'),
    value: 'signature',
  },
])

/** Vuetify 数据表表头。 */
const tableHeaders = computed(() => [
  {
    title: t('assets.previewColumn'),
    key: 'preview',
    sortable: false,
    width: 92,
  },
  {
    title: t('assets.nameColumn'),
    key: 'name',
    sortable: true,
  },
  {
    title: t('assets.updatedAtColumn'),
    key: 'updatedAt',
    sortable: true,
  },
  {
    title: t('assets.createdAtColumn'),
    key: 'createdAt',
    sortable: true,
  },
  {
    title: t('assets.actionsColumn'),
    key: 'actions',
    sortable: false,
    align: 'end' as const,
    width: 96,
  },
])

/** 表格行，根据搜索关键字过滤。 */
const filteredAvatarRows = computed(() => {
  const keyword = searchText.value.trim().toLocaleLowerCase()

  if (!keyword) {
    return customAvatars.value
  }

  return customAvatars.value.filter((asset) => asset.name.toLocaleLowerCase().includes(keyword))
})

/** 当前弹窗标题。 */
const editorTitle = computed(() =>
  editingAsset.value
    ? assetKindFilter.value === 'signature'
      ? t('assets.editSignatureTitle')
      : t('assets.editAvatarTitle')
    : assetKindFilter.value === 'signature'
      ? t('assets.createSignatureTitle')
      : t('assets.createAvatarTitle')
)

/** 当前弹窗说明。 */
const editorIntro = computed(() =>
  editingAsset.value
    ? assetKindFilter.value === 'signature'
      ? t('assets.editSignatureIntro')
      : t('assets.editAvatarIntro')
    : assetKindFilter.value === 'signature'
      ? t('assets.createSignatureIntro')
      : t('assets.createAvatarIntro')
)

/** 当前素材类型名称。 */
const assetNameLabel = computed(() =>
  assetKindFilter.value === 'signature' ? t('assets.signatureName') : t('assets.avatarName')
)

/** 当前素材名称输入占位。 */
const assetNamePlaceholder = computed(() =>
  assetKindFilter.value === 'signature'
    ? t('assets.signatureNamePlaceholder')
    : t('assets.avatarNamePlaceholder')
)

/** 新建按钮文案。 */
const newAssetLabel = computed(() =>
  assetKindFilter.value === 'signature' ? t('assets.newSignature') : t('assets.newAvatar')
)

/** 当前素材保存按钮文案。 */
const saveAssetLabel = computed(() =>
  assetKindFilter.value === 'signature' ? t('assets.saveSignature') : t('assets.saveAvatar')
)

/** 当前类型保存失败文案。 */
const saveAssetFailedMessage = computed(() =>
  assetKindFilter.value === 'signature'
    ? t('assets.saveSignatureFailed')
    : t('assets.saveAvatarFailed')
)

/** 当前素材缺省图标。 */
const assetFallbackIcon = computed(() =>
  assetKindFilter.value === 'signature' ? 'mdi-draw-pen' : 'mdi-account-circle-outline'
)

/** 当前是否正在管理自定义签章。 */
const isSignatureAssetKind = computed(() => assetKindFilter.value === 'signature')

/** 选择图片按钮文案。 */
const chooseAssetFileLabel = computed(() =>
  assetKindFilter.value === 'signature'
    ? t('assets.chooseSignatureFile')
    : t('assets.chooseAvatarFile')
)

/** 替换图片按钮文案。 */
const replaceAssetFileLabel = computed(() =>
  assetKindFilter.value === 'signature'
    ? t('assets.replaceSignatureFile')
    : t('assets.replaceAvatarFile')
)

/** 当前类型的默认素材名。 */
const customAssetFallbackName = computed(() =>
  assetKindFilter.value === 'signature'
    ? t('assets.customSignatureFallbackName')
    : t('assets.customAvatarFallbackName')
)

/** 当前编辑素材的裁剪版预览。 */
const editingPreviewUrl = computed(() =>
  editingAsset.value ? avatarPreviewUrls.value[editingAsset.value.id] ?? '' : ''
)

/** 大图预览 URL。 */
const previewDialogUrl = computed(() =>
  previewingAsset.value ? avatarPreviewUrls.value[previewingAsset.value.id] ?? '' : ''
)

/** 是否允许保存。 */
const canSaveEditor = computed(() => {
  if (isSaving.value) {
    return false
  }

  if (editingAsset.value && !sourceImageUrl.value) {
    return true
  }

  return Boolean(selectedOriginalBlob.value && sourceImageUrl.value && isCropperReady.value)
})

/** 表格空状态标题。 */
const emptyTitle = computed(() =>
  searchText.value.trim()
    ? t('assets.emptySearchTitle')
    : assetKindFilter.value === 'signature'
      ? t('assets.emptySignatureTitle')
      : t('assets.emptyAvatarTitle')
)

/** 表格空状态说明。 */
const emptyDescription = computed(() =>
  searchText.value.trim()
    ? t('assets.emptySearchDescription')
    : assetKindFilter.value === 'signature'
      ? t('assets.emptySignatureDescription')
      : t('assets.emptyDescription')
)

/**
 * @description: 规范化流程路由名
 * @param {unknown} value - 待判断路由名
 * @return {WorkflowRouteName | ''} 可返回的流程路由名
 */
function normalizeWorkflowRouteName(value: unknown): WorkflowRouteName | '' {
  return value === 'registration' || value === 'proofing' ? value : ''
}

/**
 * @description: 格式化素材时间
 * @param {string} value - ISO 时间字符串
 * @return {string} 本地化时间
 */
function formatAssetDate(value: string | undefined): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat(uiStore.uiLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/**
 * @description: 消费旧版 URL 跳转参数
 * @description 新流程使用 Pinia 临时意图；这里仅兼容已打开的旧链接，并立刻移除 query 避免重复触发。
 * @return {Promise<void>} 无返回值
 */
async function consumeLegacyNavigationQuery(): Promise<void> {
  const legacyReturnTo = normalizeWorkflowRouteName(route.query.returnTo)

  if (legacyReturnTo && !navigationIntent.customAssetReturnTo) {
    navigationIntent.requestCustomAssetFlow(
      legacyReturnTo,
      'avatar',
      typeof route.query.templateId === 'string' ? route.query.templateId : undefined
    )
  }

  if (route.query.assetKind === 'avatar' || route.query.assetKind === 'signature') {
    assetKindFilter.value = route.query.assetKind
  }

  if (route.query.returnTo || route.query.templateId || route.query.assetKind || route.query.reopen) {
    await router.replace({
      name: 'profile',
      query: {
        tab: 'customAssets',
      },
    })
  }
}

/**
 * @description: 返回流程页并重新打开素材选择层
 * @param {WorkflowRouteName} targetRouteName - 目标流程页
 * @return {Promise<void>} 无返回值
 */
async function returnToDraftWithAssetPicker(targetRouteName: WorkflowRouteName): Promise<void> {
  if (assetKindFilter.value === 'signature') {
    navigationIntent.requestSignaturePicker(targetRouteName)
  } else {
    navigationIntent.requestAvatarPicker(targetRouteName)
  }

  navigationIntent.clearCustomAssetFlow()
  await router.push({ name: targetRouteName })
}

/**
 * @description: 释放表格预览 URL
 * @return {void} 无返回值
 */
function revokeAvatarPreviewUrls(): void {
  Object.values(avatarPreviewUrls.value).forEach((url) => URL.revokeObjectURL(url))
  avatarPreviewUrls.value = {}
}

/**
 * @description: 释放当前上传原图 URL
 * @return {void} 无返回值
 */
function revokeSourceImageUrl(): void {
  if (sourceImageUrl.value) {
    URL.revokeObjectURL(sourceImageUrl.value)
    sourceImageUrl.value = ''
  }
}

/**
 * @description: 销毁 CropperJS 实例
 * @return {void} 无返回值
 */
function destroyCropper(): void {
  cropperInitVersion.value += 1
  cropper.value?.destroy()
  cropper.value = null
  isCropperReady.value = false
}

/**
 * @description: 读取自定义头像
 * @return {Promise<void>} 无返回值
 */
async function loadCustomAvatars(): Promise<void> {
  revokeAvatarPreviewUrls()

  const assets = await listCustomAssets(assetKindFilter.value)
  const nextUrls: Record<string, string> = {}

  assets.forEach((asset) => {
    nextUrls[asset.id] = URL.createObjectURL(asset.blob)
  })

  customAvatars.value = assets
  avatarPreviewUrls.value = nextUrls
}

/**
 * @description: 读取当前模板头像裁剪比例
 * @description 自定义头像页面也通过模板入口读取 manifest，保证与核对页同源。
 * @param {string} templateId - 当前证书模板 ID
 * @return {Promise<void>} 无返回值
 */
async function loadAssetCropAspectRatio(
  templateId: string,
  assetKind: AssetKindFilter = assetKindFilter.value
): Promise<void> {
  const loadVersion = cropAspectRatioLoadVersion.value + 1

  cropAspectRatioLoadVersion.value = loadVersion
  assetCropAspectRatio.value = getDefaultCustomAssetCropAspectRatio(assetKind)

  const templatePackage = await loadBuiltinTemplatePackage(templateId)

  if (
    cropAspectRatioLoadVersion.value !== loadVersion ||
    templateId !== activeTemplateId.value ||
    assetKind !== assetKindFilter.value
  ) {
    return
  }

  const nextRatio = resolveCustomAssetCropAspectRatio(templatePackage.manifest, assetKind)
  const ratioChanged = Math.abs(assetCropAspectRatio.value - nextRatio) > 0.001

  assetCropAspectRatio.value = nextRatio

  if (ratioChanged && isEditorOpen.value && sourceImageUrl.value && cropperImage.value?.complete) {
    await initializeCropper()
  }
}

/**
 * @description: 打开新建弹窗
 * @return {void} 无返回值
 */
async function openCreateDialog(): Promise<void> {
  await loadAssetCropAspectRatio(activeTemplateId.value, assetKindFilter.value)

  editingAsset.value = null
  avatarName.value = ''
  editorErrorMessage.value = ''
  selectedOriginalBlob.value = null
  shouldRestoreCropState.value = false
  destroyCropper()
  revokeSourceImageUrl()
  isEditorOpen.value = true
}

/**
 * @description: 打开编辑弹窗
 * @param {CustomAssetRecord} asset - 被编辑的素材
 * @return {Promise<void>} 无返回值
 */
async function openEditDialog(asset: CustomAssetRecord): Promise<void> {
  await loadAssetCropAspectRatio(activeTemplateId.value, assetKindFilter.value)

  const latestAsset = (await getCustomAsset(asset.id)) ?? asset

  editingAsset.value = latestAsset
  avatarName.value = latestAsset.name
  editorErrorMessage.value = ''
  destroyCropper()
  revokeSourceImageUrl()
  shouldRestoreCropState.value = true
  isEditorOpen.value = true

  if (!latestAsset.originalBlob) {
    selectedOriginalBlob.value = null
    return
  }

  selectedOriginalBlob.value = latestAsset.originalBlob
  sourceImageUrl.value = URL.createObjectURL(latestAsset.originalBlob)
  await nextTick()

  if (cropperImage.value?.complete) {
    await initializeCropper()
  }
}

/**
 * @description: 关闭新建/编辑弹窗
 * @return {void} 无返回值
 */
function closeEditorDialog(): void {
  isEditorOpen.value = false
  editingAsset.value = null
  selectedOriginalBlob.value = null
  avatarName.value = ''
  editorErrorMessage.value = ''
  shouldRestoreCropState.value = false
  destroyCropper()
  revokeSourceImageUrl()
}

/**
 * @description: 打开系统选图
 * @return {void} 无返回值
 */
function openFilePicker(): void {
  fileInput.value?.click()
}

/** CropperJS v2 模板；显式开启图片平移缩放并锁定当前素材比例。 */
const cropperTemplate = computed(
  () => `
    <cropper-canvas background scale-step="0.08">
      <cropper-image rotatable scalable skewable translatable></cropper-image>
      <cropper-shade hidden></cropper-shade>
      <cropper-handle action="select" plain></cropper-handle>
      <cropper-selection
        initial-coverage="0.82"
        aspect-ratio="${assetCropAspectRatio.value}"
        movable
        resizable
        zoomable
        outlined
      >
        <cropper-grid role="grid" bordered covered></cropper-grid>
        <cropper-crosshair centered></cropper-crosshair>
        <cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>
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
)

/**
 * @description: 初始化裁剪器
 * @description 等弹窗和图片尺寸都进入 DOM 后再创建实例，避免画布高度为 0 或原图跑位。
 * @return {Promise<void>} 无返回值
 */
async function initializeCropper(): Promise<void> {
  const initVersion = cropperInitVersion.value + 1

  cropperInitVersion.value = initVersion
  isCropperReady.value = false
  await nextTick()

  const imageElement = cropperImage.value
  const containerElement = cropperContainer.value

  if (!isEditorOpen.value || !sourceImageUrl.value || !imageElement || !containerElement) {
    return
  }

  if (!imageElement.complete) {
    return
  }

  await imageElement.decode().catch(() => undefined)

  if (
    initVersion !== cropperInitVersion.value ||
    !isEditorOpen.value ||
    imageElement !== cropperImage.value ||
    containerElement !== cropperContainer.value
  ) {
    return
  }

  cropper.value?.destroy()
  cropper.value = new Cropper(imageElement, {
    container: containerElement,
    template: cropperTemplate.value,
  })

  await restoreCropState(initVersion)

  if (initVersion === cropperInitVersion.value) {
    isCropperReady.value = true
  }
}

/**
 * @description: 等待 CropperJS 完成一次渲染
 * @description 矩阵和选区都依赖自定义元素内部渲染完成，恢复状态前后各等一帧更稳定。
 * @return {Promise<void>} 无返回值
 */
function waitForCropperFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * @description: 把 CropperJS 矩阵规范成固定六元组
 * @param {readonly number[] | undefined} transform - CropperJS 返回的矩阵
 * @return {CustomAssetCropTransform | undefined} 可持久化矩阵
 */
function normalizeCropTransform(
  transform: readonly number[] | undefined
): CustomAssetCropTransform | undefined {
  if (!transform || transform.length < 6) {
    return undefined
  }

  const nextTransform = transform.slice(0, 6)

  if (nextTransform.some((value) => !Number.isFinite(value))) {
    return undefined
  }

  return [
    nextTransform[0],
    nextTransform[1],
    nextTransform[2],
    nextTransform[3],
    nextTransform[4],
    nextTransform[5],
  ]
}

/**
 * @description: 比较两个裁剪矩阵是否近似一致
 * @param {CustomAssetCropTransform | undefined} left - 左侧矩阵
 * @param {CustomAssetCropTransform | undefined} right - 右侧矩阵
 * @return {boolean} 是否一致
 */
function isSameCropTransform(
  left: CustomAssetCropTransform | undefined,
  right: CustomAssetCropTransform | undefined
): boolean {
  if (!left || !right) {
    return left === right
  }

  return left.every((value, index) => Math.abs(value - right[index]) < 0.01)
}

/**
 * @description: 应用已保存的裁剪状态
 * @description CropperJS 初始化后可能再执行一次默认布局，因此恢复流程会多次调用这个函数。
 * @param {CustomAssetCropTransform | undefined} savedTransform - 已保存图片矩阵
 * @param {CustomAssetCropSelection | undefined} savedSelection - 已保存裁剪框
 * @return {void} 无返回值
 */
function applySavedCropState(
  savedTransform: CustomAssetCropTransform | undefined,
  savedSelection: CustomAssetCropSelection | undefined
): void {
  const cropperImageElement = cropper.value?.getCropperImage()

  if (savedTransform && cropperImageElement) {
    cropperImageElement.$setTransform([...savedTransform])
  }

  const selection = cropper.value?.getCropperSelection()

  if (!savedSelection || !selection) {
    return
  }

  selection.$change(
    savedSelection.x,
    savedSelection.y,
    savedSelection.width,
    savedSelection.height,
    assetCropAspectRatio.value,
    true
  )
  selection.$render()
}

/**
 * @description: 恢复上一次裁剪状态
 * @description 先恢复原图缩放和平移矩阵，再恢复裁剪框，避免编辑时位置和缩放错位。
 * @param {number} initVersion - 当前初始化序号
 * @return {Promise<void>} 无返回值
 */
async function restoreCropState(initVersion: number): Promise<void> {
  if (!shouldRestoreCropState.value) {
    return
  }

  const cropperImageElement = cropper.value?.getCropperImage()

  await cropperImageElement?.$ready()

  const savedTransform = editingAsset.value?.cropTransform
  const savedSelection = editingAsset.value?.cropSelection

  if (!savedTransform && !savedSelection) {
    return
  }

  for (let index = 0; index < 3; index += 1) {
    await waitForCropperFrame()

    if (initVersion !== cropperInitVersion.value) {
      return
    }

    applySavedCropState(savedTransform, savedSelection)
  }

  await waitForCropperFrame()

  if (initVersion !== cropperInitVersion.value) {
    return
  }

  const currentTransform = normalizeCropTransform(cropper.value?.getCropperImage()?.$getTransform())

  if (!isSameCropTransform(currentTransform, savedTransform)) {
    applySavedCropState(savedTransform, savedSelection)
  }
}

/**
 * @description: 处理用户选图
 * @param {Event} event - 文件选择事件
 * @return {Promise<void>} 无返回值
 */
async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''

  if (!file) {
    return
  }

  destroyCropper()
  await loadAssetCropAspectRatio(activeTemplateId.value, assetKindFilter.value)
  revokeSourceImageUrl()
  editorErrorMessage.value = ''
  selectedOriginalBlob.value = file
  shouldRestoreCropState.value = false

  if (!avatarName.value.trim()) {
    avatarName.value = file.name.replace(/\.[^.]+$/, '')
  }

  sourceImageUrl.value = URL.createObjectURL(file)
  await nextTick()

  if (cropperImage.value?.complete) {
    await initializeCropper()
  }
}

/**
 * @description: 处理裁剪原图加载失败
 * @description 移动端选择 HEIC 等浏览器无法解码格式时给出明确反馈。
 * @return {void} 无返回值
 */
function handleCropperImageError(): void {
  destroyCropper()
  editorErrorMessage.value = t('assets.cropperImageLoadFailed')
}

/**
 * @description: 将 Canvas 转为 PNG Blob
 * @param {HTMLCanvasElement} canvas - CropperJS 输出画布
 * @return {Promise<Blob>} PNG Blob
 */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(saveAssetFailedMessage.value))
        return
      }

      resolve(blob)
    }, 'image/png')
  })
}

/**
 * @description: 读取当前裁剪框
 * @description 记录 CropperJS 画布坐标，编辑同一素材时可恢复选区。
 * @return {CustomAssetCropSelection | undefined} 当前裁剪框
 */
function getCurrentCropSelection(): CustomAssetCropSelection | undefined {
  const selection = cropper.value?.getCropperSelection()

  if (!selection) {
    return undefined
  }

  return {
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  }
}

/**
 * @description: 读取当前原图变换矩阵
 * @description 与裁剪框一并保存，编辑自定义头像时才能精确恢复缩放和平移。
 * @return {CustomAssetCropTransform | undefined} 当前原图变换矩阵
 */
function getCurrentCropTransform(): CustomAssetCropTransform | undefined {
  return normalizeCropTransform(cropper.value?.getCropperImage()?.$getTransform())
}

/**
 * @description: 保存新建/编辑结果
 * @description 从办理流程进入时，保存后会选用该头像并返回原流程重新打开头像弹窗。
 * @return {Promise<void>} 无返回值
 */
async function saveEditor(): Promise<void> {
  if (!canSaveEditor.value) {
    return
  }

  isSaving.value = true
  editorErrorMessage.value = ''

  try {
    let savedAsset: CustomAssetRecord

    if (selectedOriginalBlob.value && sourceImageUrl.value) {
      const selection = cropper.value?.getCropperSelection()

      if (!selection) {
        throw new Error(t('assets.cropperNotReady'))
      }

      const canvas = await selection.$toCanvas(
        resolveCustomAssetOutputSize(assetCropAspectRatio.value)
      )
      const croppedBlob = await canvasToPngBlob(canvas)
      const cropSelection = getCurrentCropSelection()
      const cropTransform = getCurrentCropTransform()

      if (editingAsset.value) {
        savedAsset = await updateCustomImageAsset({
          id: editingAsset.value.id,
          kind: assetKindFilter.value,
          name: avatarName.value,
          fallbackName: customAssetFallbackName.value,
          originalBlob: selectedOriginalBlob.value,
          croppedBlob,
          cropSelection,
          cropTransform,
        })
      } else {
        savedAsset = await createCustomImageAsset({
          kind: assetKindFilter.value,
          name: avatarName.value,
          fallbackName: customAssetFallbackName.value,
          originalBlob: selectedOriginalBlob.value,
          croppedBlob,
          cropSelection,
          cropTransform,
        })
      }
    } else if (editingAsset.value) {
      savedAsset = await updateCustomImageAsset({
        id: editingAsset.value.id,
        kind: assetKindFilter.value,
        name: avatarName.value,
        fallbackName: customAssetFallbackName.value,
      })
    } else {
      return
    }

    if (shouldReturnToDraft.value) {
      if (assetKindFilter.value === 'signature') {
        await updateActiveDraft({ signatureMode: 'image', signatureImageId: savedAsset.id })
      } else {
        await updateActiveDraft({ avatarId: savedAsset.id })
      }

      await returnToDraftWithAssetPicker(returnTo.value as WorkflowRouteName)
      return
    }

    closeEditorDialog()
    await loadCustomAvatars()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    editorErrorMessage.value = [
      t('assets.cropperNotReady'),
      t('assets.cropperImageLoadFailed'),
      saveAssetFailedMessage.value,
    ].includes(message)
      ? message
      : saveAssetFailedMessage.value
  } finally {
    isSaving.value = false
  }
}

/**
 * @description: 请求删除素材
 * @param {CustomAssetRecord} asset - 待删除素材
 * @return {void} 无返回值
 */
function requestDelete(asset: CustomAssetRecord): void {
  deletingAsset.value = asset
  isDeleteDialogOpen.value = true
}

/**
 * @description: 打开头像大图预览
 * @param {CustomAssetRecord} asset - 被查看素材
 * @return {void} 无返回值
 */
function openPreview(asset: CustomAssetRecord): void {
  previewingAsset.value = asset
  isPreviewDialogOpen.value = true
}

/**
 * @description: 确认删除素材
 * @return {Promise<void>} 无返回值
 */
async function confirmDelete(): Promise<void> {
  if (!deletingAsset.value || isDeleting.value) {
    return
  }

  isDeleting.value = true

  try {
    await deleteCustomAsset(deletingAsset.value.id)
    deletingAsset.value = null
    isDeleteDialogOpen.value = false
    await loadCustomAvatars()
  } finally {
    isDeleting.value = false
  }
}

/**
 * @description: 返回来源办理流程
 * @return {Promise<void>} 无返回值
 */
async function backToDraft(): Promise<void> {
  if (!shouldReturnToDraft.value) {
    return
  }

  await returnToDraftWithAssetPicker(returnTo.value as WorkflowRouteName)
}

onMounted(async () => {
  if (
    navigationIntent.customAssetKind === 'avatar' ||
    navigationIntent.customAssetKind === 'signature'
  ) {
    assetKindFilter.value = navigationIntent.customAssetKind
  }

  await consumeLegacyNavigationQuery()
  void loadCustomAvatars()
})

watch(
  [activeTemplateId, assetKindFilter],
  ([templateId, assetKind]) => {
    void loadAssetCropAspectRatio(templateId, assetKind)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  destroyCropper()
  revokeSourceImageUrl()
  revokeAvatarPreviewUrls()
})
</script>

<template>
  <div class="profile-custom-assets">
    <input ref="fileInput" class="hidden" type="file" accept="image/*" @change="handleFileChange" />

    <div class="profile-custom-assets__toolbar">
      <div class="profile-custom-assets__filters">
        <v-text-field
          v-model="searchText"
          :label="t('assets.searchLabel')"
          :placeholder="t('assets.searchPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          color="primary"
          hide-details
        />
        <v-select
          v-model="assetKindFilter"
          :items="assetKindItems"
          :label="t('assets.typeFilterLabel')"
          variant="outlined"
          density="compact"
          color="primary"
          hide-details
          @update:model-value="loadCustomAvatars"
        />
      </div>

      <div class="profile-custom-assets__actions">
        <v-btn
          v-if="shouldReturnToDraft"
          variant="text"
          color="primary"
          data-sound="back"
          @click="backToDraft"
        >
          <v-icon icon="mdi-arrow-left" start />
          {{ t('assets.backToDraft') }}
        </v-btn>
        <v-btn color="primary" variant="flat" data-sound="primary" @click="openCreateDialog">
          <v-icon icon="mdi-plus" start />
          {{ newAssetLabel }}
        </v-btn>
      </div>
    </div>

    <v-data-table
      :headers="tableHeaders"
      :items="filteredAvatarRows"
      item-value="id"
      density="comfortable"
      hover
      fixed-header
      hide-default-footer
      :items-per-page="-1"
      class="profile-custom-assets__table"
    >
      <template #[`item.preview`]="{ item }">
        <v-menu
          v-if="avatarPreviewUrls[item.id]"
          location="end center"
          open-on-hover
          :close-on-content-click="false"
        >
          <template #activator="{ props }">
            <button
              v-bind="props"
              type="button"
              :class="[
                'profile-custom-assets__preview',
                { 'profile-custom-assets__preview--signature': isSignatureAssetKind },
              ]"
              data-sound="open"
              @click="openPreview(item)"
            >
              <img :src="avatarPreviewUrls[item.id]" alt="" />
            </button>
          </template>
          <v-card class="profile-custom-assets__preview-popover">
            <v-img
              :src="avatarPreviewUrls[item.id]"
              :width="isSignatureAssetKind ? 300 : 220"
              :height="isSignatureAssetKind ? 110 : 220"
              :cover="!isSignatureAssetKind"
            />
          </v-card>
        </v-menu>
        <div
          v-else
          :class="[
            'profile-custom-assets__preview',
            { 'profile-custom-assets__preview--signature': isSignatureAssetKind },
          ]"
        >
          <v-icon :icon="assetFallbackIcon" size="22" />
        </div>
      </template>

      <template #[`item.name`]="{ item }">
        <div class="profile-custom-assets__name">
          <strong>{{ item.name }}</strong>
          <small>{{ item.width }} x {{ item.height }}</small>
        </div>
      </template>

      <template #[`item.updatedAt`]="{ item }">
        {{ formatAssetDate(item.updatedAt ?? item.createdAt) }}
      </template>

      <template #[`item.createdAt`]="{ item }">
        {{ formatAssetDate(item.createdAt) }}
      </template>

      <template #[`item.actions`]="{ item }">
        <v-menu location="bottom end" open-on-hover :close-on-content-click="false">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              icon="mdi-dots-vertical"
              variant="text"
              color="primary"
              size="small"
              :aria-label="t('assets.actionsColumn')"
              data-sound="open"
            />
          </template>
          <v-list density="compact" min-width="148" class="profile-custom-assets__menu">
            <v-list-item
              class="profile-custom-assets__menu-item"
              data-sound="open"
              @click="openEditDialog(item)"
            >
              <template #prepend>
                <v-icon icon="mdi-pencil-outline" size="18" />
              </template>
              <v-list-item-title>{{ t('assets.menuEdit') }}</v-list-item-title>
            </v-list-item>
            <v-list-item
              class="profile-custom-assets__menu-item profile-custom-assets__menu-item--danger"
              data-sound="danger"
              @click="requestDelete(item)"
            >
              <template #prepend>
                <v-icon icon="mdi-delete-outline" size="18" />
              </template>
              <v-list-item-title>{{ t('assets.menuDelete') }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </template>

      <template #no-data>
        <div class="profile-custom-assets__empty">
          <v-icon icon="mdi-folder-image" size="28" />
          <strong>{{ emptyTitle }}</strong>
          <span>{{ emptyDescription }}</span>
        </div>
      </template>
    </v-data-table>

    <v-dialog v-model="isEditorOpen" max-width="860" persistent scrollable>
      <v-card class="profile-custom-assets__dialog">
        <div class="grid gap-1 px-6 pb-3 pt-6 max-[560px]:px-5">
          <h2 class="m-0 text-[20px] font-[820] text-[var(--color-foreground)]">
            {{ editorTitle }}
          </h2>
          <p class="m-0 text-[13px] leading-relaxed text-[var(--color-muted-dark)]">
            {{ editorIntro }}
          </p>
        </div>

        <v-card-text class="grid gap-4 px-6 pb-5 pt-2 max-[560px]:px-5">
          <v-text-field
            v-model="avatarName"
            :label="assetNameLabel"
            :placeholder="assetNamePlaceholder"
            variant="outlined"
            color="primary"
            maxlength="32"
            hide-details
          />

          <v-alert v-if="editorErrorMessage" type="error" variant="tonal" density="comfortable">
            {{ editorErrorMessage }}
          </v-alert>

          <div class="profile-custom-assets__editor-grid">
            <div
              v-if="sourceImageUrl"
              ref="cropperContainer"
              class="profile-custom-assets__cropper"
            >
              <img
                ref="cropperImage"
                :src="sourceImageUrl"
                alt=""
                class="profile-custom-assets__source-image"
                @load="initializeCropper"
                @error="handleCropperImageError"
              />
            </div>

            <button
              v-else
              type="button"
              :class="[
                'profile-custom-assets__upload',
                { 'profile-custom-assets__upload--signature': isSignatureAssetKind },
              ]"
              data-sound="open"
              @click="openFilePicker"
            >
              <img v-if="editingPreviewUrl" :src="editingPreviewUrl" alt="" />
              <span v-else>
                <v-icon icon="mdi-image-plus-outline" size="30" />
              </span>
              <strong>
                {{ editingPreviewUrl ? t('assets.currentPreview') : chooseAssetFileLabel }}
              </strong>
              <small>
                {{ editingPreviewUrl ? t('assets.replaceAvatarHint') : t('assets.chooseImageBeforeSave') }}
              </small>
            </button>
          </div>

          <v-btn variant="outlined" color="primary" data-sound="open" @click="openFilePicker">
            <v-icon icon="mdi-image-sync-outline" start />
            {{ editingPreviewUrl || sourceImageUrl ? replaceAssetFileLabel : chooseAssetFileLabel }}
          </v-btn>
        </v-card-text>

        <v-card-actions class="justify-end gap-2 border-t border-[#ef5f8f]/15 px-6 py-4">
          <v-btn variant="text" data-sound="back" @click="closeEditorDialog">
            {{ t('common.action.cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!canSaveEditor"
            :loading="isSaving"
            data-sound="primary"
            @click="saveEditor"
          >
            {{ shouldReturnToDraft ? t('assets.saveAndUse') : saveAssetLabel }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isDeleteDialogOpen" max-width="420">
      <v-card class="profile-custom-assets__dialog">
        <v-card-title class="text-[18px] font-[820] text-[var(--color-foreground)]">
          {{ t('assets.deleteTitle') }}
        </v-card-title>
        <v-card-text class="text-[14px] leading-relaxed text-[var(--color-muted-dark)]">
          {{ t('assets.deleteMessage', { name: deletingAsset?.name ?? '' }) }}
        </v-card-text>
        <v-card-actions class="justify-end gap-2 border-t border-[#ef5f8f]/15 px-6 py-4">
          <v-btn variant="text" data-sound="back" @click="isDeleteDialogOpen = false">
            {{ t('common.action.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="isDeleting"
            data-sound="danger"
            @click="confirmDelete"
          >
            {{ t('assets.deleteConfirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isPreviewDialogOpen" max-width="520">
      <v-card class="profile-custom-assets__dialog">
        <v-card-title class="text-[18px] font-[820] text-[var(--color-foreground)]">
          {{ previewingAsset?.name }}
        </v-card-title>
        <v-card-text>
          <v-img
            v-if="previewDialogUrl"
            :src="previewDialogUrl"
            :aspect-ratio="assetCropAspectRatio"
            :cover="!isSignatureAssetKind"
            class="profile-custom-assets__dialog-preview"
          />
        </v-card-text>
        <v-card-actions class="justify-end border-t border-[#ef5f8f]/15 px-6 py-4">
          <v-btn variant="text" data-sound="back" @click="isPreviewDialogOpen = false">
            {{ t('common.action.cancel') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.profile-custom-assets {
  display: grid;
  gap: 16px;
}

.profile-custom-assets__toolbar {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
}

.profile-custom-assets__filters {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(240px, 1fr) minmax(170px, 220px);
  gap: 12px;
}

.profile-custom-assets__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.profile-custom-assets__table {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
  color: var(--color-foreground);
}

.profile-custom-assets__table :deep(.v-data-table__td) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.profile-custom-assets__preview {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.2);
  border-radius: 8px;
  color: var(--color-gold);
  background: #fff3f6;
  cursor: zoom-in;
}

.profile-custom-assets__preview--signature {
  width: 92px;
  height: 34px;
  background: #fff9fc;
}

.profile-custom-assets__preview img,
.profile-custom-assets__upload img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-custom-assets__preview--signature img,
.profile-custom-assets__upload--signature img {
  object-fit: contain;
}

.profile-custom-assets__name {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.profile-custom-assets__name strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 780;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-custom-assets__name small {
  color: var(--color-muted-dark);
  font-size: 12px;
}

.profile-custom-assets__menu {
  border: 1px solid rgba(239, 95, 143, 0.18);
}

.profile-custom-assets__menu :deep(.v-list-item) {
  min-height: 34px;
  padding-inline: 10px 12px;
}

.profile-custom-assets__menu :deep(.v-list-item__prepend) {
  width: auto;
  margin-inline-end: 0;
}

.profile-custom-assets__menu :deep(.v-list-item__spacer) {
  width: 6px;
}

.profile-custom-assets__menu-item--danger {
  color: #d93670;
}

.profile-custom-assets__menu-item--danger :deep(.v-icon) {
  color: #d93670;
}

.profile-custom-assets__preview-popover {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.22);
  border-radius: 12px;
  background: #fff9fc;
  box-shadow: 0 16px 34px rgba(122, 78, 98, 0.18);
}

.profile-custom-assets__empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 28px;
  color: var(--color-muted-dark);
  text-align: center;
}

.profile-custom-assets__empty strong {
  color: var(--color-foreground);
  font-size: 16px;
}

.profile-custom-assets__dialog {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.24);
  border-radius: 22px;
  background: #fff9fc;
}

.profile-custom-assets__dialog-preview {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 12px;
  background: #fff3f6;
}

.profile-custom-assets__editor-grid {
  display: grid;
  gap: 12px;
}

.profile-custom-assets__cropper {
  position: relative;
  height: clamp(280px, 52dvh, 460px);
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.24);
  border-radius: 8px;
  background: #2f2f32;
}

.profile-custom-assets__cropper :deep(cropper-canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.profile-custom-assets__cropper :deep(cropper-selection) {
  outline-color: rgba(239, 95, 143, 0.92);
}

.profile-custom-assets__source-image {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.profile-custom-assets__upload {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 18px;
  overflow: hidden;
  border: 1px dashed rgba(239, 95, 143, 0.35);
  border-radius: 8px;
  color: var(--color-muted-dark);
  background: rgba(255, 244, 248, 0.68);
  cursor: pointer;
}

.profile-custom-assets__upload img {
  width: min(180px, 50vw);
  height: min(180px, 50vw);
  border-radius: 8px;
  box-shadow: 0 10px 26px rgba(122, 78, 98, 0.12);
}

.profile-custom-assets__upload--signature img {
  width: min(320px, 68vw);
  height: auto;
  aspect-ratio: 2172 / 724;
  background: #fff;
}

.profile-custom-assets__upload span {
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  border-radius: 8px;
  color: var(--color-primary-active);
  background: #fff;
}

.profile-custom-assets__upload strong {
  color: var(--color-foreground);
  font-size: 15px;
}

.profile-custom-assets__upload small {
  max-width: 360px;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .profile-custom-assets__toolbar {
    grid-template-columns: 1fr;
  }

  .profile-custom-assets__filters {
    grid-template-columns: 1fr;
    max-width: none;
  }

  .profile-custom-assets__actions {
    justify-content: stretch;
  }

  .profile-custom-assets__actions .v-btn {
    flex: 1 1 0;
  }
}
</style>
