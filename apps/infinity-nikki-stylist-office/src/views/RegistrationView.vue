<script setup lang="ts">
/**
 * @description: RegistrationView - 登记资料页
 * @description 读取唯一办理草稿，完成姓名、称号和地区登记，并提供资料确认层。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AssetPickerDialog from '@/components/AssetPickerDialog.vue'
import BottomActionBar from '@/components/BottomActionBar.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import {
  getActiveDraft,
  updateActiveDraft,
  type ActiveDraftPatch,
} from '@/db/repositories/draftRepository'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { getTemplateLocaleMessages } from '@/i18n/template'
import { UI_LOCALE_OPTIONS } from '@/i18n'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useUiStore } from '@/stores/ui'
import type { CertificateDraft } from '@/domain/draft/types'

/** 登记页素材选择层当前处理的业务类型。 */
type AssetPickerKind = 'avatar' | 'background'

const { t } = useI18n()
const router = useRouter()
const uiStore = useUiStore()
const draftSession = useDraftSessionStore()

/** 当前登记页绑定的办理草稿，完整业务字段来自 Dexie。 */
const draft = ref<CertificateDraft | null>(null)
/** 初次读取草稿时展示加载状态，避免空表单闪烁。 */
const isLoading = ref(true)
/** 没有草稿时展示说明，不在路由守卫里偷偷创建办理档案。 */
const isDraftMissing = ref(false)
/** 资料确认层开关，确认层不改变路由。 */
const isConfirming = ref(false)
/** 当前打开的头像/背景选择层类型。 */
const activeAssetPicker = ref<AssetPickerKind | null>(null)

/** 当前证书语言下的模板固定文案，用于资料确认字段。 */
const templateCopy = computed(() =>
  getTemplateLocaleMessages(draft.value?.certificateLocale ?? uiStore.uiLocale)
)

/** 顶部语言当前显示名称。 */
const currentLanguageLabel = computed(() => {
  const option =
    UI_LOCALE_OPTIONS.find((item) => item.value === uiStore.uiLocale) ?? UI_LOCALE_OPTIONS[0]
  return t(option.labelKey)
})

/** 称号列表显示文案跟随当前草稿语言，缺失时由资料库工具回退。 */
const titleItems = computed(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale

  return associationCatalogSeed.titleOptions.map((option) => ({
    ...option,
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
const selectedTitle = computed(() =>
  associationCatalogSeed.titleOptions.find((option) => option.id === draft.value?.titleId)
)

/** 当前选中的登记地区，用于确认层和编号前缀。 */
const selectedRegion = computed(() =>
  associationCatalogSeed.regions.find((region) => region.id === draft.value?.regionId)
)

/** 当前草稿固定的协会评语，切语言只切换同一 ID 的文案。 */
const selectedComment = computed(() =>
  associationCatalogSeed.comments.find((comment) => comment.id === draft.value?.commentId)
)

/** 当前官方头像名称，素材管理接入前先展示草稿默认选项。 */
const selectedAvatarName = computed(() => {
  const avatar = associationCatalogSeed.officialAvatars.find((item) => item.id === draft.value?.avatarId)
  return avatar ? resolveLocalizedText(avatar.name, draft.value?.certificateLocale ?? uiStore.uiLocale) : ''
})

/** 当前官方背景名称，素材管理接入前先展示草稿默认选项。 */
const selectedBackgroundName = computed(() => {
  const background = associationCatalogSeed.officialBackgrounds.find(
    (item) => item.id === draft.value?.backgroundId
  )
  return background
    ? resolveLocalizedText(background.name, draft.value?.certificateLocale ?? uiStore.uiLocale)
    : ''
})

/** 素材选择层开关代理，关闭时清空当前类型。 */
const isAssetPickerOpen = computed({
  get: () => activeAssetPicker.value !== null,
  set: (value: boolean) => {
    if (!value) {
      activeAssetPicker.value = null
    }
  },
})

/** 当前素材选择层需要高亮的草稿素材 ID。 */
const selectedAssetIdForPicker = computed(() => {
  if (!draft.value || !activeAssetPicker.value) {
    return ''
  }

  return activeAssetPicker.value === 'avatar' ? draft.value.avatarId : draft.value.backgroundId
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

  const titleName = selectedTitle.value
    ? resolveLocalizedText(selectedTitle.value.name, draft.value.certificateLocale)
    : ''
  const regionName = selectedRegion.value
    ? resolveLocalizedText(selectedRegion.value.name, draft.value.certificateLocale)
    : ''
  const commentText = selectedComment.value
    ? resolveLocalizedText(selectedComment.value.text, draft.value.certificateLocale)
    : ''
  const certificatePrefix = `MC-${selectedRegion.value?.code ?? '---'}-${
    templateCopy.value.pendingCertificateNo
  }`

  return [
    { label: t('registration.stylistName'), value: draft.value.stylistName.trim() },
    { label: t('registration.titleOption'), value: titleName },
    { label: t('registration.region'), value: regionName },
    { label: t('common.language.label'), value: currentLanguageLabel.value },
    { label: t('registration.avatar'), value: selectedAvatarName.value },
    { label: t('registration.background'), value: selectedBackgroundName.value },
    { label: t('registration.comment'), value: commentText },
    { label: t('registration.president'), value: templateCopy.value.presidentName },
    { label: t('registration.certificateNoPrefix'), value: certificatePrefix },
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
}

/**
 * @description: 选择搭配师称号
 * @description 称号是进入资料确认的必要条件，点击卡片后立即保存。
 * @param {string} titleId - 称号 ID
 * @return {void} 无返回值
 */
function selectTitle(titleId: string): void {
  void saveDraftPatch({ titleId })
}

/**
 * @description: 打开头像或背景选择层
 * @description 选择层覆盖在登记页上，不改变当前表单状态和滚动位置。
 * @param {AssetPickerKind} kind - 素材类型
 * @return {void} 无返回值
 */
function openAssetPicker(kind: AssetPickerKind): void {
  activeAssetPicker.value = kind
}

/**
 * @description: 保存素材选择
 * @description 头像和背景是独立字段，更换其中一个不会影响称号、地区、评语或语言。
 * @param {{ kind: AssetPickerKind; id: string }} payload - 选择结果
 * @return {void} 无返回值
 */
function handleAssetSelect(payload: { kind: AssetPickerKind; id: string }): void {
  const patch: ActiveDraftPatch =
    payload.kind === 'avatar' ? { avatarId: payload.id } : { backgroundId: payload.id }

  void saveDraftPatch(patch)
}

/**
 * @description: 进入自定义素材管理
 * @description 当前管理页仍是骨架，但从登记流程进入时保留已有草稿。
 * @param {AssetPickerKind} kind - 素材类型
 * @return {void} 无返回值
 */
function openAssetLibrary(kind: AssetPickerKind): void {
  const routeName = kind === 'avatar' ? 'avatar-library' : 'background-library'
  void router.push({ name: routeName, query: { returnTo: 'registration' } })
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
  await router.push('/proofing')
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
</script>

<template>
  <ResponsivePageShell :title="t('registration.title')" :subtitle="t('registration.subtitle')">
    <v-progress-linear v-if="isLoading" indeterminate color="primary" rounded />

    <v-alert v-else-if="isDraftMissing" type="info" variant="tonal">
      {{ t('registration.draftMissing') }}
    </v-alert>

    <div v-else-if="draft" class="registration-layout">
      <section>
        <v-card variant="flat" class="registration-card">
          <v-card-text class="registration-card__body">
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

            <section class="registration-section" :aria-label="t('registration.titleOption')">
              <div class="registration-section__header">
                <h2>{{ t('registration.titleOption') }}</h2>
                <span v-if="!draft.titleId">{{ t('registration.chooseTitle') }}</span>
              </div>

              <div class="title-grid">
                <button
                  v-for="option in titleItems"
                  :key="option.id"
                  type="button"
                  :class="['title-option', { 'title-option--active': option.id === draft.titleId }]"
                  :aria-pressed="option.id === draft.titleId"
                  data-sound="select"
                  @click="selectTitle(option.id)"
                >
                  <span class="title-option__symbol">{{ option.symbol }}</span>
                  <strong>{{ option.displayName }}</strong>
                  <span>{{ option.displayDescription }}</span>
                </button>
              </div>
            </section>

            <div class="asset-summary">
              <button
                type="button"
                class="asset-summary__item"
                data-sound="open"
                @click="openAssetPicker('avatar')"
              >
                <span>{{ t('registration.avatar') }}</span>
                <strong>{{ selectedAvatarName }}</strong>
                <v-icon icon="mdi-chevron-right" size="20" />
              </button>
              <button
                type="button"
                class="asset-summary__item"
                data-sound="open"
                @click="openAssetPicker('background')"
              >
                <span>{{ t('registration.background') }}</span>
                <strong>{{ selectedBackgroundName }}</strong>
                <v-icon icon="mdi-chevron-right" size="20" />
              </button>
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
      :primary-label="t('registration.confirm')"
      :primary-disabled="!canConfirm"
      @primary="openConfirmation"
    />

    <AssetPickerDialog
      v-if="draft"
      v-model="isAssetPickerOpen"
      :kind="activeAssetPicker"
      :locale="draft.certificateLocale"
      :selected-id="selectedAssetIdForPicker"
      @select="handleAssetSelect"
      @manage="openAssetLibrary"
    />

    <v-dialog v-model="isConfirming" fullscreen scrollable>
      <v-card class="confirmation-dialog">
        <v-toolbar color="surface">
          <v-btn
            :aria-label="t('common.action.cancel')"
            icon="mdi-close"
            variant="text"
            data-sound="back"
            @click="isConfirming = false"
          />
          <v-toolbar-title>{{ t('registration.confirmTitle') }}</v-toolbar-title>
        </v-toolbar>

        <v-card-text class="confirmation-dialog__body">
          <p class="confirmation-dialog__intro">
            {{ t('registration.confirmIntro') }}
          </p>

          <div v-if="draft">
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

.registration-section {
  display: grid;
  gap: 12px;
}

.registration-section__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.registration-section__header h2 {
  margin: 0;
  color: var(--color-foreground);
  font-size: 16px;
  font-weight: 720;
  letter-spacing: 0;
}

.registration-section__header span {
  color: var(--color-primary-active);
  font-size: 13px;
}

.title-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.title-option {
  --title-accent: var(--color-primary);
  --title-tint: rgba(239, 95, 143, 0.08);

  display: grid;
  min-height: 128px;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border-primary-20);
  border-radius: 8px;
  color: var(--color-foreground);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.86), var(--title-tint));
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease;
}

.title-option:nth-child(2n) {
  --title-accent: var(--color-gold);
  --title-tint: rgba(255, 214, 109, 0.16);
}

.title-option:nth-child(3n) {
  --title-accent: var(--color-blue);
  --title-tint: rgba(85, 135, 232, 0.12);
}

.title-option:nth-child(4n) {
  --title-accent: var(--color-mint);
  --title-tint: rgba(85, 188, 169, 0.13);
}

.title-option:nth-child(5n) {
  --title-accent: var(--color-lavender);
  --title-tint: rgba(155, 123, 255, 0.12);
}

.title-option:hover {
  transform: translateY(-1px);
}

.title-option--active {
  border-color: var(--title-accent);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), var(--title-tint));
  box-shadow: 0 10px 22px rgba(239, 95, 143, 0.16);
}

.title-option__symbol {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #ffffff;
  background: var(--title-accent);
  font-size: 20px;
  line-height: 1;
}

.title-option span:last-child {
  color: var(--color-muted-dark);
  font-size: 13px;
  line-height: 1.55;
}

.asset-summary {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.asset-summary__item {
  display: grid;
  width: 100%;
  gap: 4px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 12px;
  border: 1px solid var(--border-primary-20);
  border-radius: 8px;
  color: var(--color-foreground);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 234, 242, 0.64));
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.asset-summary__item:hover {
  border-color: var(--color-primary-active);
  background: var(--bg-primary-10);
}

.asset-summary__item span {
  grid-column: 1 / 2;
  color: var(--color-muted-dark);
  font-size: 12px;
}

.asset-summary__item strong {
  grid-column: 1 / 2;
  min-width: 0;
  overflow: hidden;
  color: var(--color-foreground);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-summary__item .v-icon {
  grid-column: 2 / 3;
  grid-row: 1 / 3;
  align-self: center;
  color: var(--color-primary-active);
}

.confirmation-dialog {
  background: #fff7fa;
}

.confirmation-dialog__body {
  width: min(100%, 1180px);
  margin: 0 auto;
}

.confirmation-dialog__intro {
  margin: 0 0 18px;
  color: var(--color-muted-dark);
  line-height: 1.7;
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
  padding: 12px max(18px, calc((100% - 1180px) / 2)) calc(12px + var(--safe-bottom));
  border-top: 1px solid var(--border-primary-20);
  background: rgba(255, 249, 252, 0.96);
}

@media (max-width: 759px) {
  .registration-card__desktop-action {
    display: none;
  }

  .title-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .title-option {
    min-height: 142px;
    padding: 12px;
  }

  .title-option span:last-child {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .registration-section__header {
    display: grid;
  }

  .confirmation-dialog__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
