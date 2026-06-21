<script setup lang="ts">
/**
 * @description: RegistrationStep - 身份登记步骤
 * @description 读取唯一办理草稿，完成姓名、称号和地区登记，并提供资料确认层。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AssetPickerDialog from '@/components/AssetPickerDialog/AssetPickerDialog.vue'
import BottomActionBar from '@/components/BottomActionBar/BottomActionBar.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'
import WorkflowEmptyState from '../WorkflowEmptyState/WorkflowEmptyState.vue'
import ProfileOptionSelector from './components/ProfileOptionSelector/ProfileOptionSelector.vue'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { resolveAvatarDisplaySource } from '@/db/repositories/avatarDisplayRepository'
import {
  getActiveDraft,
  updateActiveDraft,
  type ActiveDraftPatch,
} from '@/db/repositories/draftRepository'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useNavigationIntentStore } from '@/stores/navigationIntent'
import { useUiStore } from '@/stores/ui'
import { useWorkflowRecoveryActions } from '../../composables/useWorkflowRecoveryActions'
import type { CertificateDraft } from '@/domain/draft/types'
import type { TitlePickerOption } from './components/ProfileOptionSelector/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const draftSession = useDraftSessionStore()
const navigationIntent = useNavigationIntentStore()
const { restartRegistration, openRegistrationHistory } = useWorkflowRecoveryActions()

/** 当前登记页绑定的办理草稿，完整业务字段来自 Dexie。 */
const draft = ref<CertificateDraft | null>(null)
/** 初次读取草稿时展示加载状态，避免空表单闪烁。 */
const isLoading = ref(true)
/** 没有草稿时展示说明，不在路由守卫里偷偷创建办理档案。 */
const isDraftMissing = ref(false)
/** 资料确认层开关，确认层不改变路由。 */
const isConfirming = ref(false)
/** 头像选择层开关，登记页复用公共素材选择器。 */
const isAvatarPickerOpen = ref(false)
/** 当前选中自定义头像名称，官方头像仍从资料库解析。 */
const selectedCustomAvatarName = ref('')
/** 当前头像预览图。 */
const selectedAvatarImageSrc = ref('')
/** 当前头像预览 URL 清理函数。 */
let cleanupSelectedAvatarImage: () => void = () => {}

/** 称号列表显示文案跟随当前草稿语言，缺失时由资料库工具回退。 */
const titleItems = computed<TitlePickerOption[]>(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale

  return associationCatalogSeed.titleOptions.map((option) => ({
    id: option.id,
    symbol: option.symbol,
    displayName: resolveLocalizedText(option.name, locale),
    displayDescription: resolveLocalizedText(option.description, locale),
  }))
})

/** 登记地区下拉项，地区名称按模板语言切换。 */
const regionItems = computed(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale

  return associationCatalogSeed.regions.map((region) => ({
    title: resolveLocalizedText(region.name, locale),
    value: region.id,
  }))
})

/** 当前选中的称号，用于确认层和预览。 */
const selectedTitle = computed(
  () => titleItems.value.find((option) => option.id === draft.value?.titleId) ?? null
)

/** 当前选中的登记地区，用于确认层和编号前缀。 */
const selectedRegion = computed(() =>
  associationCatalogSeed.regions.find((region) => region.id === draft.value?.regionId)
)

/** 当前官方头像名称，素材管理接入前先展示草稿默认选项。 */
const selectedAvatarName = computed(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale
  const officialAvatar = associationCatalogSeed.officialAvatars.find(
    (item) => item.id === draft.value?.avatarId
  )

  if (officialAvatar) {
    return resolveLocalizedText(officialAvatar.name, locale)
  }

  return selectedCustomAvatarName.value || t('assets.customAvatarFallbackName')
})

/** 姓名输入代理，去掉换行并限制 14 个可见字符。 */
const stylistName = computed({
  get: () => draft.value?.stylistName ?? '',
  set: (value: string) => {
    const nextValue = value.replace(/[\r\n]/g, '').slice(0, 14)
    void saveDraftPatch({ stylistName: nextValue })
  },
})

/** 地区选择代理，选择后立即写入草稿。 */
const selectedRegionId = computed({
  get: () => draft.value?.regionId ?? '',
  set: (value: string) => {
    void saveDraftPatch({ regionId: value })
  },
})

/** 表单是否满足进入资料确认的最低条件。 */
const canConfirm = computed(() => {
  const name = draft.value?.stylistName.trim() ?? ''
  return Boolean(name && draft.value?.titleId && draft.value?.regionId)
})

/** 资料确认层展示的档案字段。 */
const confirmationRows = computed(() => {
  if (!draft.value) {
    return []
  }

  const titleName = selectedTitle.value?.displayName ?? ''
  const regionName = selectedRegion.value
    ? resolveLocalizedText(selectedRegion.value.name, draft.value.certificateLocale)
    : ''

  return [
    { label: t('registration.stylistName'), value: draft.value.stylistName.trim() },
    { label: t('registration.titleOption'), value: titleName },
    { label: t('registration.region'), value: regionName },
  ]
})

/**
 * @description: 保存草稿局部字段
 * @description 先乐观更新页面，再写入 Dexie，保证切换语言和表单输入立即反映到预览。
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
 * @description: 读取当前办理草稿
 * @description 如果没有草稿，只展示提示；新草稿必须由首页入口创建。
 * @return {Promise<void>} 无返回值
 */
async function loadDraft(): Promise<void> {
  const activeDraft = await getActiveDraft()
  isLoading.value = false

  if (!activeDraft) {
    isDraftMissing.value = true
    return
  }

  draft.value = {
    ...activeDraft,
    certificateLocale: uiStore.uiLocale,
  }

  if (activeDraft.certificateLocale !== uiStore.uiLocale) {
    void updateActiveDraft({ certificateLocale: uiStore.uiLocale })
  }

  if (navigationIntent.consumeAvatarPicker('registration')) {
    isAvatarPickerOpen.value = true
  } else if (route.query.avatarPicker === '1') {
    isAvatarPickerOpen.value = true
    void router.replace({ name: 'registration' })
  }
}

/**
 * @description: 清理头像预览 URL
 * @return {void} 无返回值
 */
function cleanupAvatarPreview(): void {
  cleanupSelectedAvatarImage()
  cleanupSelectedAvatarImage = () => {}
  selectedAvatarImageSrc.value = ''
}

/**
 * @description: 解析当前头像预览
 * @description 外层选择入口和资料确认层都直接展示实际头像图片。
 * @return {Promise<void>} 无返回值
 */
async function resolveSelectedAvatarPreview(): Promise<void> {
  cleanupAvatarPreview()
  selectedCustomAvatarName.value = ''

  if (!draft.value?.avatarId) {
    return
  }

  const source = await resolveAvatarDisplaySource(draft.value.avatarId, draft.value.certificateLocale)
  selectedAvatarImageSrc.value = source.imageSrc
  cleanupSelectedAvatarImage = source.cleanup

  if (source.isCustom) {
    selectedCustomAvatarName.value = source.name
  }
}

/**
 * @description: 选择搭配师称号
 * @description 称号由统一选择器弹窗选中后立即保存。
 * @param {string} titleId - 称号 ID
 * @return {void} 无返回值
 */
function selectTitle(titleId: string): void {
  void saveDraftPatch({ titleId })
}

/**
 * @description: 保存头像选择
 * @description 背景代码仍保留在资料库和草稿结构中，当前页面流程暂不引用背景选择。
 * @param {string} avatarId - 头像 ID
 * @return {void} 无返回值
 */
function selectAvatar(avatarId: string): void {
  void saveDraftPatch({ avatarId })
}

/**
 * @description: 处理公共头像选择层选择结果
 * @description 选择官方或自定义头像后立即保存到当前草稿。
 * @param {{ kind: 'avatar' | 'background'; id: string }} payload - 素材选择结果
 * @return {void} 无返回值
 */
function handleAssetSelect(payload: { kind: 'avatar' | 'background'; id: string }): void {
  if (payload.kind !== 'avatar') {
    return
  }

  selectAvatar(payload.id)
}

/**
 * @description: 进入自定义头像管理
 * @description 从登记流程进入个人中心自定义资料页，保存后可返回并重新打开头像选择层。
 * @return {void} 无返回值
 */
function openAvatarLibrary(): void {
  navigationIntent.requestCustomAssetFlow('registration', 'avatar', draft.value?.templateId)
  void router.push({
    name: 'profile',
    query: {
      tab: 'customAssets',
    },
  })
}

/**
 * @description: 打开资料确认层
 * @description 打开前会去掉姓名首尾空格，确认证书上保存的是最终姓名。
 * @return {Promise<void>} 无返回值
 */
async function openConfirmation(): Promise<void> {
  if (!draft.value || !canConfirm.value) {
    return
  }

  const normalizedName = draft.value.stylistName.trim()

  if (normalizedName !== draft.value.stylistName) {
    await saveDraftPatch({ stylistName: normalizedName })
  }

  isConfirming.value = true
}

/**
 * @description: 编制签发前校样
 * @description 将草稿阶段推进到 proofing，然后进入校样页。
 * @return {Promise<void>} 无返回值
 */
async function buildProof(): Promise<void> {
  if (!draft.value || !canConfirm.value) {
    return
  }

  await saveDraftPatch({ stage: 'proofing', stylistName: draft.value.stylistName.trim() })
  draftSession.setLastKnownStage('proofing')
  isConfirming.value = false
  await router.push({ name: 'proofing' })
}

watch(
  () => uiStore.uiLocale,
  (locale) => {
    if (draft.value && draft.value.certificateLocale !== locale) {
      void saveDraftPatch({ certificateLocale: locale })
    }
  }
)

onMounted(() => {
  void loadDraft()
})

watch(
  [() => draft.value?.avatarId, () => draft.value?.certificateLocale],
  () => {
    void resolveSelectedAvatarPreview()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  cleanupAvatarPreview()
})
</script>

<template>
  <ResponsivePageShell
    :title="t('registration.title')"
    :subtitle="t('registration.subtitle')"
    hide-header
  >
    <v-progress-linear v-if="isLoading" indeterminate color="primary" rounded />

    <WorkflowEmptyState
      v-else-if="isDraftMissing"
      :title="t('workflow.noActiveDraftTitle')"
      :description="t('registration.draftMissing')"
      @restart="restartRegistration"
      @history="openRegistrationHistory"
    />

    <div v-else-if="draft" class="registration-layout">
      <section>
        <v-card variant="flat" class="registration-card">
          <v-card-text class="registration-card__body">
            <div class="registration-basic-grid">
              <v-text-field
                v-model="stylistName"
                :label="t('registration.stylistName')"
                :hint="t('registration.stylistNameHint')"
                maxlength="14"
                counter="14"
                variant="outlined"
                color="primary"
              />

              <v-select
                v-model="selectedRegionId"
                :items="regionItems"
                :label="t('registration.region')"
                variant="outlined"
                color="primary"
              />
            </div>

            <div class="registration-selector-grid">
              <section class="grid gap-2">
                <span class="text-[13px] font-[720] text-[var(--color-muted-dark)]">
                  {{ t('registration.avatar') }}
                </span>
                <button
                  type="button"
                  class="grid min-h-[76px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-[#ef5f8f]/24 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,234,242,0.66))] px-4 py-3 text-left text-[var(--color-foreground)] shadow-[0_12px_28px_rgba(201,85,126,0.1)] transition hover:-translate-y-0.5 hover:border-[#ef5f8f]/55 hover:bg-[#fff4f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ef5f8f]/45"
                  data-sound="open"
                  @click="isAvatarPickerOpen = true"
                >
                  <v-avatar color="primary" variant="tonal" size="48">
                    <img
                      v-if="selectedAvatarImageSrc"
                      :src="selectedAvatarImageSrc"
                      alt=""
                      class="registration-avatar-image"
                    />
                    <v-icon v-else icon="mdi-account-circle-outline" size="30" />
                  </v-avatar>
                  <span class="grid min-w-0 gap-1">
                    <strong class="truncate text-[16px] font-[820] leading-tight">
                      {{ selectedAvatarName }}
                    </strong>
                    <small
                      class="truncate text-[13px] leading-tight text-[var(--color-muted-dark)]"
                    >
                      {{ t('registration.selectedAsset') }}
                    </small>
                  </span>
                  <v-icon icon="mdi-chevron-right" color="primary" size="22" />
                </button>
              </section>
              <ProfileOptionSelector
                type="title"
                :label="t('registration.titleOption')"
                :dialog-title="t('registration.titlePickerTitle')"
                :dialog-intro="t('registration.titlePickerIntro')"
                :group-label="t('registration.titlePickerGroup')"
                :selected-id="draft.titleId ?? ''"
                :selected-title="selectedTitle"
                :title-options="titleItems"
                @select="selectTitle"
              />
            </div>

            <v-btn
              color="primary"
              variant="flat"
              size="large"
              class="registration-card__desktop-action"
              :disabled="!canConfirm"
              data-sound="primary"
              @click="openConfirmation"
            >
              {{ t('registration.confirm') }}
            </v-btn>
          </v-card-text>
        </v-card>
      </section>
    </div>

    <BottomActionBar
      v-if="draft && !isDraftMissing"
      :primary-label="t('registration.confirm')"
      :primary-disabled="!canConfirm"
      @primary="openConfirmation"
    />

    <v-dialog v-model="isConfirming" max-width="620" scrollable>
      <v-card class="confirmation-dialog">
        <div class="confirmation-dialog__header">
          <div>
            <h2>{{ t('registration.confirmTitle') }}</h2>
            <p>{{ t('registration.confirmIntro') }}</p>
          </div>
          <v-btn
            :aria-label="t('common.action.cancel')"
            icon="mdi-close"
            variant="text"
            data-sound="back"
            @click="isConfirming = false"
          />
        </div>

        <v-card-text class="confirmation-dialog__body">
          <div v-if="draft">
            <div class="confirmation-avatar">
              <v-avatar color="primary" variant="tonal" size="64">
                <img v-if="selectedAvatarImageSrc" :src="selectedAvatarImageSrc" alt="" />
                <v-icon v-else icon="mdi-account-circle-outline" size="34" />
              </v-avatar>
              <div class="min-w-0">
                <strong>{{ selectedAvatarName }}</strong>
                <small>{{ t('registration.avatar') }}</small>
              </div>
            </div>
            <dl class="confirmation-list">
              <div v-for="row in confirmationRows" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </div>
        </v-card-text>

        <v-card-actions class="confirmation-dialog__actions">
          <v-btn variant="outlined" color="primary" data-sound="back" @click="isConfirming = false">
            {{ t('registration.returnEdit') }}
          </v-btn>
          <v-btn color="primary" variant="flat" data-sound="primary" @click="buildProof">
            {{ t('registration.buildProof') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <AssetPickerDialog
      v-if="draft"
      v-model="isAvatarPickerOpen"
      kind="avatar"
      :locale="draft.certificateLocale"
      :selected-id="draft.avatarId"
      @select="handleAssetSelect"
      @manage="openAvatarLibrary"
    />
  </ResponsivePageShell>
</template>

<style scoped>
.registration-card {
  border: 1px solid rgba(239, 95, 143, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 246, 250, 0.9)),
    repeating-linear-gradient(
      135deg,
      rgba(239, 95, 143, 0.05) 0,
      rgba(239, 95, 143, 0.05) 1px,
      transparent 1px,
      transparent 18px
    );
  box-shadow: var(--shadow-card);
}

.registration-layout {
  max-width: 960px;
  margin: 0 auto;
}

.registration-card__body {
  display: grid;
  gap: 18px;
}

.registration-card__desktop-action {
  justify-self: start;
}

.registration-basic-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.registration-selector-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr);
}

.confirmation-dialog {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.24);
  border-radius: 26px;
  background: #fff7fa;
}

.confirmation-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 10px;
}

.confirmation-dialog__header h2 {
  margin: 0;
  color: var(--color-foreground);
  font-size: 20px;
  font-weight: 820;
  letter-spacing: 0;
}

.confirmation-dialog__header p {
  margin: 6px 0 0;
  color: var(--color-muted-dark);
  font-size: 13px;
  line-height: 1.7;
}

.confirmation-dialog__body {
  padding: 10px 24px 18px;
}

.registration-avatar-image,
.confirmation-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.confirmation-avatar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid rgba(239, 95, 143, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
}

.confirmation-avatar strong,
.confirmation-avatar small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confirmation-avatar strong {
  color: var(--color-foreground);
  font-size: 16px;
  font-weight: 820;
}

.confirmation-avatar small {
  color: var(--color-muted-dark);
  font-size: 12px;
}

.confirmation-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.confirmation-list div {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-primary-20);
}

.confirmation-list dt {
  color: var(--color-muted-dark);
  font-size: 12px;
}

.confirmation-list dd {
  margin: 0;
  color: var(--color-foreground);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.confirmation-dialog__actions {
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px calc(16px + var(--safe-bottom));
  border-top: 1px solid var(--border-primary-20);
  background: rgba(255, 249, 252, 0.96);
}

@media (max-width: 759px) {
  .registration-card__desktop-action {
    display: none;
  }

  .registration-basic-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .confirmation-dialog__header {
    padding-right: 18px;
    padding-left: 18px;
  }

  .confirmation-dialog__body {
    padding-right: 18px;
    padding-left: 18px;
  }

  .confirmation-dialog__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
