<script setup lang="ts">
/**
 * @description: ProofingStep - 签发前校样步骤
 * @description 使用模板 manifest 渲染证书图，用户直接点击图上动态区域修改档案。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AssetPickerDialog from '@/components/AssetPickerDialog/AssetPickerDialog.vue'
import BottomActionBar from '@/components/BottomActionBar/BottomActionBar.vue'
import PickerDialogFrame from '@/components/PickerDialogFrame/PickerDialogFrame.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'
import WorkflowEmptyState from '../WorkflowEmptyState/WorkflowEmptyState.vue'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { getCustomAsset } from '@/db/repositories/customAssetRepository'
import {
  getActiveDraft,
  updateActiveDraft,
  type ActiveDraftPatch,
} from '@/db/repositories/draftRepository'
import { getOfficialAssetImageSource } from '@/domain/assets/officialAssets'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { formatCertificateDate, formatPendingCertificateNo } from '@/domain/certificate/format'
import { DEFAULT_DRAFT_IMAGE_TRANSFORM } from '@/domain/draft/imageTransform'
import {
  getTemplateImageSource,
  loadBuiltinTemplatePackage,
} from '@/domain/template/registry'
import { getTemplateLocaleMessages } from '@/i18n/template'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useNavigationIntentStore } from '@/stores/navigationIntent'
import { useUiStore } from '@/stores/ui'
import { useWorkflowRecoveryActions } from '../../composables/useWorkflowRecoveryActions'
import CertificateProofCanvas from './components/CertificateProofCanvas/CertificateProofCanvas.vue'
import TitlePickerBody from '../RegistrationStep/components/ProfileOptionSelector/components/TitlePickerBody/TitlePickerBody.vue'
import type { CertificateDraft } from '@/domain/draft/types'
import type { DraftImageTransform } from '@/domain/draft/types'
import type {
  BuiltinCertificateTemplatePackage,
  CertificateTemplateEditorKind,
} from '@/domain/template/types'
import type { TitlePickerOption } from '../RegistrationStep/components/ProfileOptionSelector/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const draftSession = useDraftSessionStore()
const navigationIntent = useNavigationIntentStore()
const { restartRegistration, openRegistrationHistory } = useWorkflowRecoveryActions()

/** 当前校样页绑定的办理草稿。 */
const draft = ref<CertificateDraft | null>(null)
/** 首次读取草稿时的加载状态。 */
const isLoading = ref(true)
/** 模板包读取状态。 */
const isTemplateLoading = ref(true)
/** 缺少草稿时展示提示，不自动创建新办理。 */
const isDraftMissing = ref(false)
/** 姓名编辑弹窗开关。 */
const isNameDialogOpen = ref(false)
/** 会长签章编辑弹窗开关。 */
const isSignatureDialogOpen = ref(false)
/** 称号选择弹窗开关。 */
const isTitleDialogOpen = ref(false)
/** 地区选择弹窗开关。 */
const isRegionDialogOpen = ref(false)
/** 校样说明弹窗开关。 */
const isGuideOpen = ref(false)
/** 头像选择弹窗开关。 */
const isAvatarPickerOpen = ref(false)
/** 姓名弹窗中的临时输入值，确认后才写入草稿。 */
const draftNameInput = ref('')
/** 会长签章弹窗中的临时输入值，确认后才写入草稿。 */
const draftSignatureInput = ref('')
/** 会长签章弹窗错误提示。 */
const signatureError = ref('')
/** 当前头像图片 URL，可能来自协会内置资源或自定义 Blob。 */
const avatarImageSrc = ref('')
/** 当前头像是否来自用户自定义素材。 */
const isCustomAvatar = ref(false)
/** 自定义头像 Blob 生成的临时 URL，草稿切换头像时释放。 */
const customAvatarObjectUrl = ref('')
/** 当前模板包，找不到模板时由注册表回退默认模板。 */
const templatePackage = ref<BuiltinCertificateTemplatePackage | null>(null)
/** 拖拽头像时的即时预览取景参数，松手后再持久化进草稿。 */
const avatarTransformPreview = ref<DraftImageTransform | null>(null)

/** 当前模板 manifest。 */
const templateManifest = computed(() => templatePackage.value?.manifest ?? null)

/** 当前语言证书底图。 */
const templateImageSrc = computed(() => {
  if (!templatePackage.value) {
    return ''
  }

  return getTemplateImageSource(
    templatePackage.value.manifest,
    templatePackage.value.imageSources,
    draft.value?.certificateLocale ?? uiStore.uiLocale
  )
})

/** 当前证书语言下的模板固定文案。 */
const templateCopy = computed(() =>
  getTemplateLocaleMessages(draft.value?.certificateLocale ?? uiStore.uiLocale)
)

/** 称号列表显示文案跟随当前证书语言。 */
const titleItems = computed<TitlePickerOption[]>(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale

  return associationCatalogSeed.titleOptions.map((option) => ({
    id: option.id,
    symbol: option.symbol,
    displayName: resolveLocalizedText(option.name, locale),
    displayDescription: resolveLocalizedText(option.description, locale),
  }))
})

/** 当前选中的称号资料。 */
const selectedTitle = computed(
  () => titleItems.value.find((option) => option.id === draft.value?.titleId) ?? null
)

/** 模板中使用的当前称号 ID，给弹窗模板提供空值兜底。 */
const selectedTitleId = computed(() => draft.value?.titleId ?? '')

/** 模板中使用的当前地区 ID，给弹窗模板提供空值兜底。 */
const selectedRegionId = computed(() => draft.value?.regionId ?? '')

/** 模板中使用的当前头像 ID，给素材弹窗提供空值兜底。 */
const selectedAvatarId = computed(() => draft.value?.avatarId ?? '')

/** 当前证书语言，草稿未加载时回退顶部语言。 */
const currentCertificateLocale = computed(() => draft.value?.certificateLocale ?? uiStore.uiLocale)

/** 当前画布使用的头像取景参数。 */
const currentAvatarTransform = computed(
  () =>
    avatarTransformPreview.value ??
    draft.value?.avatarTransform ?? { ...DEFAULT_DRAFT_IMAGE_TRANSFORM }
)

/** 当前登记地区资料。 */
const selectedRegion = computed(() =>
  associationCatalogSeed.regions.find((option) => option.id === draft.value?.regionId)
)

/** 地区选择弹窗列表，显示语言跟随证书语言。 */
const regionItems = computed(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale

  return associationCatalogSeed.regions.map((region) => ({
    id: region.id,
    code: region.code,
    displayName: resolveLocalizedText(region.name, locale),
  }))
})

/** 证书动态字段值，key 对应模板 manifest fields.id。 */
const fieldValues = computed<Record<string, string>>(() => ({
  avatar: '',
  name: draft.value?.stylistName || templateCopy.value.namePlaceholder,
  certificateNo: formatPendingCertificateNo(selectedRegion.value, templateCopy.value.pendingCertificateNo),
  title: selectedTitle.value?.displayName ?? templateCopy.value.fieldPlaceholder,
  issuedDate: formatCertificateDate(new Date()),
  chairmanSignature: draft.value?.presidentSignature || templateCopy.value.presidentName,
}))

/** 可编辑热区的常驻提示文案。 */
const fieldLabels = computed<Record<string, string>>(() => ({
  avatar: t('proofing.editableAvatarLabel'),
  name: t('proofing.editableNameLabel'),
  certificateNo: t('proofing.editableCertificateNoLabel'),
  title: t('proofing.editableTitleLabel'),
  chairmanSignature: t('proofing.editableSignatureLabel'),
}))

/**
 * @description: 释放自定义头像 URL
 * @description 头像来源切换时避免 Blob URL 泄漏。
 * @return {void} 无返回值
 */
function revokeCustomAvatarObjectUrl(): void {
  if (customAvatarObjectUrl.value) {
    URL.revokeObjectURL(customAvatarObjectUrl.value)
    customAvatarObjectUrl.value = ''
  }
}

/**
 * @description: 保存草稿局部字段
 * @description 先乐观更新页面，再写入 Dexie，让证书画面即时响应。
 * @param {ActiveDraftPatch} patch - 草稿字段补丁
 * @return {Promise<void>} 无返回值
 */
async function saveDraftPatch(patch: ActiveDraftPatch): Promise<void> {
  if (!draft.value) {
    return
  }

  draft.value = {
    ...draft.value,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  const updatedDraft = await updateActiveDraft(patch)

  if (updatedDraft) {
    draft.value = updatedDraft
  }
}

/**
 * @description: 读取签发前校样草稿
 * @description 登记阶段草稿不能直接进入校样页，会返回登记页完成资料确认。
 * @return {Promise<void>} 无返回值
 */
async function loadDraft(): Promise<void> {
  const activeDraft = await getActiveDraft()
  isLoading.value = false

  if (!activeDraft) {
    isDraftMissing.value = true
    return
  }

  if (activeDraft.stage === 'registration') {
    await router.replace({ name: 'registration' })
    return
  }

  draft.value = {
    ...activeDraft,
    certificateLocale: uiStore.uiLocale,
  }
  draftSession.setLastKnownStage('proofing')

  if (activeDraft.certificateLocale !== uiStore.uiLocale) {
    void updateActiveDraft({ certificateLocale: uiStore.uiLocale })
  }

  if (navigationIntent.consumeAvatarPicker('proofing')) {
    isAvatarPickerOpen.value = true
  } else if (route.query.avatarPicker === '1') {
    isAvatarPickerOpen.value = true
    void router.replace({ name: 'proofing' })
  }
}

/**
 * @description: 读取当前草稿使用的模板包
 * @description 模板包只通过入口目录加载，manifest 和底图均相对入口解析。
 * @return {Promise<void>} 无返回值
 */
async function loadCurrentTemplatePackage(): Promise<void> {
  const templateId = draft.value?.templateId ?? associationCatalogSeed.defaultTemplateId
  isTemplateLoading.value = true

  try {
    const nextPackage = await loadBuiltinTemplatePackage(templateId)

    if ((draft.value?.templateId ?? associationCatalogSeed.defaultTemplateId) === templateId) {
      templatePackage.value = nextPackage
    }
  } finally {
    isTemplateLoading.value = false
  }
}

/**
 * @description: 解析当前头像 URL
 * @description 官方头像从构建资源取 URL，自定义头像从 IndexedDB Blob 生成临时 URL。
 * @return {Promise<void>} 无返回值
 */
async function resolveAvatarImage(): Promise<void> {
  revokeCustomAvatarObjectUrl()

  const avatarId = draft.value?.avatarId

  if (!avatarId) {
    avatarImageSrc.value = ''
    isCustomAvatar.value = false
    return
  }

  const officialAvatar = associationCatalogSeed.officialAvatars.find((item) => item.id === avatarId)

  if (officialAvatar) {
    avatarImageSrc.value = getOfficialAssetImageSource(officialAvatar.assetId)
    isCustomAvatar.value = false
    return
  }

  const customAvatar = await getCustomAsset(avatarId)

  if (!customAvatar) {
    avatarImageSrc.value = ''
    isCustomAvatar.value = false
    return
  }

  const objectUrl = URL.createObjectURL(customAvatar.blob)
  customAvatarObjectUrl.value = objectUrl
  avatarImageSrc.value = objectUrl
  isCustomAvatar.value = true
}

/**
 * @description: 打开图上字段编辑器
 * @param {CertificateTemplateEditorKind} editor - 模板字段声明的编辑器类型
 * @return {void} 无返回值
 */
function openEditor(editor: CertificateTemplateEditorKind): void {
  if (editor === 'name') {
    draftNameInput.value = draft.value?.stylistName ?? ''
    isNameDialogOpen.value = true
    return
  }

  if (editor === 'signature') {
    draftSignatureInput.value = draft.value?.presidentSignature || templateCopy.value.presidentName
    signatureError.value = ''
    isSignatureDialogOpen.value = true
    return
  }

  if (editor === 'title') {
    isTitleDialogOpen.value = true
    return
  }

  if (editor === 'region') {
    isRegionDialogOpen.value = true
    return
  }

  if (editor === 'avatar') {
    isAvatarPickerOpen.value = true
  }
}

/**
 * @description: 保存姓名编辑结果
 * @description 姓名只去除换行和首尾空格，不随模板语言翻译。
 * @return {Promise<void>} 无返回值
 */
async function saveName(): Promise<void> {
  const nextName = draftNameInput.value.replace(/[\r\n]/g, '').trim().slice(0, 14)
  await saveDraftPatch({ stylistName: nextName })
  isNameDialogOpen.value = false
}

/**
 * @description: 保存会长签章编辑结果
 * @description 签章去除换行和首尾空格，空值不允许写入草稿。
 * @return {Promise<void>} 无返回值
 */
async function saveSignature(): Promise<void> {
  const next = draftSignatureInput.value.replace(/[\r\n]/g, '').slice(0, 6).trim()

  if (!next) {
    signatureError.value = t('proofing.signatureEmptyError')
    return
  }

  signatureError.value = ''
  await saveDraftPatch({ presidentSignature: next })
  isSignatureDialogOpen.value = false
}

/**
 * @description: 选择称号
 * @param {string} titleId - 称号 ID
 * @return {void} 无返回值
 */
function selectTitle(titleId: string): void {
  void saveDraftPatch({ titleId })
  isTitleDialogOpen.value = false
}

/**
 * @description: 选择登记地区
 * @param {string} regionId - 地区 ID
 * @return {void} 无返回值
 */
function selectRegion(regionId: string): void {
  void saveDraftPatch({ regionId })
  isRegionDialogOpen.value = false
}

/**
 * @description: 保存头像选择
 * @param {{ kind: 'avatar' | 'background'; id: string }} payload - 素材选择结果
 * @return {void} 无返回值
 */
function handleAssetSelect(payload: { kind: 'avatar' | 'background'; id: string }): void {
  if (payload.kind !== 'avatar') {
    return
  }

  avatarTransformPreview.value = null
  void saveDraftPatch({
    avatarId: payload.id,
    avatarTransform: { ...DEFAULT_DRAFT_IMAGE_TRANSFORM },
  })
}

/**
 * @description: 即时预览头像取景
 * @param {DraftImageTransform} transform - 当前手势生成的取景参数
 * @return {void} 无返回值
 */
function previewAvatarTransform(transform: DraftImageTransform): void {
  avatarTransformPreview.value = transform
}

/**
 * @description: 持久化头像取景
 * @param {DraftImageTransform} transform - 最终头像取景参数
 * @return {Promise<void>} 无返回值
 */
async function commitAvatarTransform(transform: DraftImageTransform): Promise<void> {
  avatarTransformPreview.value = transform
  await saveDraftPatch({ avatarTransform: transform })
  avatarTransformPreview.value = null
}

/**
 * @description: 进入自定义头像管理
 * @description 携带 returnTo 和 reopen 标识，保存新头像后回到核对页并打开头像选择层。
 * @return {void} 无返回值
 */
function openAssetLibrary(): void {
  navigationIntent.requestCustomAssetFlow('proofing', 'avatar', draft.value?.templateId)
  void router.push({
    name: 'profile',
    query: {
      tab: 'customAssets',
    },
  })
}

/**
 * @description: 返回登记资料
 * @return {Promise<void>} 无返回值
 */
async function backToRegistration(): Promise<void> {
  await router.push({ name: 'registration' })
}

/**
 * @description: 进入正式签发页
 * @return {void} 无返回值
 */
function requestSigning(): void {
  draftSession.setLastKnownStage('proofing')
  void router.push({ name: 'signing' })
}

watch(
  () => uiStore.uiLocale,
  (locale) => {
    if (draft.value && draft.value.certificateLocale !== locale) {
      void saveDraftPatch({ certificateLocale: locale })
    }
  }
)

watch(
  () => draft.value?.avatarId,
  () => {
    void resolveAvatarImage()
  }
)

watch(
  () => draft.value?.templateId,
  () => {
    void loadCurrentTemplatePackage()
  },
  { immediate: true }
)

onMounted(() => {
  void loadDraft()
})

onBeforeUnmount(() => {
  revokeCustomAvatarObjectUrl()
})
</script>

<template>
  <ResponsivePageShell
    :title="t('proofing.title')"
    :subtitle="t('proofing.subtitle')"
    hide-header
    wide
  >
    <v-progress-linear
      v-if="isLoading || (draft && isTemplateLoading)"
      indeterminate
      color="primary"
      rounded
    />

    <WorkflowEmptyState
      v-else-if="isDraftMissing"
      :title="t('workflow.noActiveDraftTitle')"
      :description="t('proofing.noDraftDescription')"
      @restart="restartRegistration"
      @history="openRegistrationHistory"
    />

    <div v-else-if="draft && templateManifest" class="grid gap-4">
      <section class="grid gap-3">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="grid gap-1">
            <h2
              class="m-0 inline-flex min-w-0 items-center gap-1.5 text-[18px] font-[740] text-[var(--color-foreground)]"
            >
              <span class="min-w-0 truncate">{{ t('proofing.previewTitle') }}</span>
              <v-btn
                :aria-label="t('proofing.guideOpenLabel')"
                :title="t('proofing.guideOpenLabel')"
                icon="mdi-alert-circle"
                variant="text"
                color="primary"
                density="comfortable"
                size="small"
                data-sound="open"
                @click="isGuideOpen = true"
              />
            </h2>
            <p class="m-0 text-[13px] leading-relaxed text-[var(--color-muted-dark)]">
              {{ t('proofing.saveHint') }}
            </p>
          </div>
          <div class="hidden gap-2 min-[760px]:flex">
            <v-btn variant="outlined" color="primary" data-sound="back" @click="backToRegistration">
              {{ t('proofing.backRegistration') }}
            </v-btn>
            <v-btn color="primary" variant="flat" data-sound="primary" @click="requestSigning">
              {{ t('proofing.apply') }}
            </v-btn>
          </div>
        </div>

        <CertificateProofCanvas
          :manifest="templateManifest"
          :locale="currentCertificateLocale"
          :image-src="templateImageSrc"
          :avatar-src="avatarImageSrc"
          :avatar-is-custom="isCustomAvatar"
          :avatar-transform="currentAvatarTransform"
          :field-values="fieldValues"
          :field-labels="fieldLabels"
          :avatar-reset-label="t('proofing.resetAvatarTransform')"
          :watermark="templateCopy.proofWatermark"
          @edit="openEditor"
          @avatar-transform-preview="previewAvatarTransform"
          @avatar-transform-commit="commitAvatarTransform"
        />
      </section>
    </div>

    <PickerDialogFrame
      v-model="isGuideOpen"
      :title="t('proofing.guideTitle')"
      :intro="t('proofing.guideIntro')"
      :max-width="560"
    >
      <div class="grid gap-3">
        <section class="grid gap-1 rounded-[14px] border border-[#ef5f8f]/15 bg-white/70 p-3">
          <h3 class="m-0 text-[15px] font-[780] text-[var(--color-foreground)]">
            {{ t('proofing.guideFieldTitle') }}
          </h3>
          <p class="m-0 text-[13px] leading-relaxed text-[var(--color-muted-dark)]">
            {{ t('proofing.guideFieldBody') }}
          </p>
        </section>
        <section class="grid gap-1 rounded-[14px] border border-[#ef5f8f]/15 bg-white/70 p-3">
          <h3 class="m-0 text-[15px] font-[780] text-[var(--color-foreground)]">
            {{ t('proofing.guideAvatarTitle') }}
          </h3>
          <p class="m-0 text-[13px] leading-relaxed text-[var(--color-muted-dark)]">
            {{ t('proofing.guideAvatarBody') }}
          </p>
        </section>
        <section class="grid gap-1 rounded-[14px] border border-[#ef5f8f]/15 bg-white/70 p-3">
          <h3 class="m-0 text-[15px] font-[780] text-[var(--color-foreground)]">
            {{ t('proofing.guideAvatarButtonsTitle') }}
          </h3>
          <p class="m-0 text-[13px] leading-relaxed text-[var(--color-muted-dark)]">
            {{ t('proofing.guideAvatarButtonsBody') }}
          </p>
        </section>
      </div>
    </PickerDialogFrame>

    <BottomActionBar
      v-if="draft && templateManifest && !isDraftMissing"
      :primary-label="t('proofing.apply')"
      :secondary-label="t('proofing.backRegistration')"
      :primary-disabled="!draft || !templateManifest"
      @primary="requestSigning"
      @secondary="backToRegistration"
    />

    <PickerDialogFrame
      v-model="isNameDialogOpen"
      :title="t('proofing.editNameTitle')"
      :intro="t('proofing.editNameIntro')"
      :max-width="520"
    >
      <v-text-field
        v-model="draftNameInput"
        :label="t('proofing.nameInputLabel')"
        maxlength="14"
        counter="14"
        variant="outlined"
        color="primary"
        @keyup.enter="saveName"
      />

      <template #actions>
        <v-btn variant="text" data-sound="back" @click="isNameDialogOpen = false">
          {{ t('common.action.cancel') }}
        </v-btn>
        <v-btn color="primary" variant="flat" data-sound="primary" @click="saveName">
          {{ t('common.action.confirm') }}
        </v-btn>
      </template>
    </PickerDialogFrame>

    <PickerDialogFrame
      v-model="isSignatureDialogOpen"
      :title="t('proofing.editSignatureTitle')"
      :intro="t('proofing.editSignatureIntro')"
      :max-width="520"
    >
      <v-text-field
        v-model="draftSignatureInput"
        :label="t('proofing.signatureInputLabel')"
        :error-messages="signatureError"
        maxlength="6"
        counter="6"
        variant="outlined"
        color="primary"
        @keyup.enter="saveSignature"
      />

      <template #actions>
        <v-btn variant="text" data-sound="back" @click="isSignatureDialogOpen = false">
          {{ t('common.action.cancel') }}
        </v-btn>
        <v-btn color="primary" variant="flat" data-sound="primary" @click="saveSignature">
          {{ t('common.action.confirm') }}
        </v-btn>
      </template>
    </PickerDialogFrame>

    <PickerDialogFrame
      v-model="isTitleDialogOpen"
      :title="t('registration.titlePickerTitle')"
      :intro="t('registration.titlePickerIntro')"
    >
      <TitlePickerBody :items="titleItems" :selected-id="selectedTitleId" @select="selectTitle" />
    </PickerDialogFrame>

    <PickerDialogFrame
      v-model="isRegionDialogOpen"
      :title="t('proofing.chooseRegionTitle')"
      :intro="t('proofing.chooseRegionIntro')"
    >
      <div class="grid gap-2">
        <button
          v-for="region in regionItems"
          :key="region.id"
          type="button"
          :class="[
            'grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border bg-white/75 px-3 py-2 text-left text-[var(--color-foreground)] transition hover:border-[#ef5f8f]/55 hover:bg-[#fff4f8]',
            region.id === selectedRegionId ? 'border-[#ef5f8f]' : 'border-[#ef5f8f]/20',
          ]"
          data-sound="select"
          @click="selectRegion(region.id)"
        >
          <span class="grid min-w-0 gap-1">
            <strong class="truncate text-[15px] font-[780]">{{ region.displayName }}</strong>
            <small class="text-[12px] text-[var(--color-muted-dark)]">
              MC-{{ region.code }}-{{ templateCopy.pendingCertificateNo }}
            </small>
          </span>
          <v-icon
            v-if="region.id === selectedRegionId"
            icon="mdi-check-circle"
            color="primary"
            size="22"
          />
        </button>
      </div>
    </PickerDialogFrame>

    <AssetPickerDialog
      v-if="draft"
      v-model="isAvatarPickerOpen"
      kind="avatar"
      :locale="currentCertificateLocale"
      :selected-id="selectedAvatarId"
      @select="handleAssetSelect"
      @manage="openAssetLibrary"
    />
  </ResponsivePageShell>
</template>
