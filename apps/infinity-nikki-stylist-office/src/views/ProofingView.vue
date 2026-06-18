<script setup lang="ts">
/**
 * @description: ProofingView - 签发前校样页
 * @description 使用临时 bg.png 底图展示证书校样，支持档案内容和模板文字层定位调整。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AssetPickerDialog from '@/components/AssetPickerDialog.vue'
import BottomActionBar from '@/components/BottomActionBar.vue'
import CertificateTemplatePreview from '@/components/certificate/CertificateTemplatePreview.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import {
  getActiveDraft,
  updateActiveDraft,
  type ActiveDraftPatch,
} from '@/db/repositories/draftRepository'
import { resolveLocalizedText } from '@/domain/catalog/text'
import {
  DEFAULT_TEMPLATE_TEXT_POSITIONS,
  TEMPLATE_TEXT_LAYER_IDS,
  resolveTemplateTextPosition,
} from '@/domain/draft/templatePositions'
import { getTemplateLocaleMessages } from '@/i18n/template'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useUiStore } from '@/stores/ui'
import type {
  CertificateDraft,
  TemplateTextLayerId,
  TemplateTextPosition,
} from '@/domain/draft/types'

/** 校样页素材选择层当前处理的业务类型。 */
type AssetPickerKind = 'avatar' | 'background'

const { t } = useI18n()
const router = useRouter()
const uiStore = useUiStore()
const draftSession = useDraftSessionStore()

/** 当前校样页绑定的办理草稿。 */
const draft = ref<CertificateDraft | null>(null)
/** 首次读取草稿时的加载状态。 */
const isLoading = ref(true)
/** 缺少草稿时展示提示，不自动创建新办理。 */
const isDraftMissing = ref(false)
/** 当前正在调整位置的模板文字层。 */
const selectedLayerId = ref<TemplateTextLayerId>('name')
/** 当前打开的头像/背景选择层类型。 */
const activeAssetPicker = ref<AssetPickerKind | null>(null)

/** 当前证书语言下的模板固定文案。 */
const templateCopy = computed(() =>
  getTemplateLocaleMessages(draft.value?.certificateLocale ?? uiStore.uiLocale)
)

/** 称号下拉项，显示语言跟随顶部语言。 */
const titleSelectItems = computed(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale

  return associationCatalogSeed.titleOptions.map((option) => ({
    title: resolveLocalizedText(option.name, locale),
    value: option.id,
  }))
})

/** 地区下拉项，显示语言跟随顶部语言。 */
const regionItems = computed(() => {
  const locale = draft.value?.certificateLocale ?? uiStore.uiLocale

  return associationCatalogSeed.regions.map((region) => ({
    title: resolveLocalizedText(region.name, locale),
    value: region.id,
  }))
})

/** 当前官方头像名称，校样阶段允许重新选择素材。 */
const selectedAvatarName = computed(() => {
  const avatar = associationCatalogSeed.officialAvatars.find((item) => item.id === draft.value?.avatarId)
  return avatar ? resolveLocalizedText(avatar.name, draft.value?.certificateLocale ?? uiStore.uiLocale) : ''
})

/** 当前官方背景名称，校样阶段允许重新选择素材。 */
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

/** 模板定位项目下拉项，标签来自模板语言包而不是 UI 语言包。 */
const layerItems = computed<Array<{ title: string; value: TemplateTextLayerId }>>(() => [
  { title: templateCopy.value.certificateTitle, value: 'certificateTitle' },
  { title: templateCopy.value.nameLabel, value: 'name' },
  { title: templateCopy.value.stylistTitleLabel, value: 'stylistTitle' },
  { title: templateCopy.value.regionLabel, value: 'region' },
  { title: templateCopy.value.commentLabel, value: 'comment' },
  { title: templateCopy.value.certificateNoLabel, value: 'certificateNo' },
  { title: templateCopy.value.presidentLabel, value: 'president' },
])

/** 姓名输入代理，校样阶段仍允许最终调整姓名。 */
const stylistName = computed({
  get: () => draft.value?.stylistName ?? '',
  set: (value: string) => {
    const nextValue = value.replace(/[\r\n]/g, '').slice(0, 14)
    void saveDraftPatch({ stylistName: nextValue })
  },
})

/** 称号选择代理，切换后立即写入当前草稿。 */
const selectedTitleId = computed({
  get: () => draft.value?.titleId ?? '',
  set: (value: string) => {
    void saveDraftPatch({ titleId: value })
  },
})

/** 地区选择代理，切换后编号前缀与模板文字立即刷新。 */
const selectedRegionId = computed({
  get: () => draft.value?.regionId ?? '',
  set: (value: string) => {
    void saveDraftPatch({ regionId: value })
  },
})

/** 当前文字层横向位置滑杆。 */
const selectedLayerX = computed({
  get: () => getSelectedLayerPosition().x,
  set: (value: number) => {
    void saveSelectedLayerPosition({ x: value })
  },
})

/** 当前文字层纵向位置滑杆。 */
const selectedLayerY = computed({
  get: () => getSelectedLayerPosition().y,
  set: (value: number) => {
    void saveSelectedLayerPosition({ y: value })
  },
})

/**
 * @description: 保存草稿局部字段
 * @description 先乐观更新页面，再写入 Dexie，让校样预览在拖动滑杆时即时响应。
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
}

/**
 * @description: 获取当前选中文字层位置
 * @description 草稿未保存该层位置时回退 bg.png 默认坐标。
 * @return {TemplateTextPosition} 当前文字层位置
 */
function getSelectedLayerPosition(): TemplateTextPosition {
  if (!draft.value) {
    return DEFAULT_TEMPLATE_TEXT_POSITIONS[selectedLayerId.value]
  }

  return resolveTemplateTextPosition(selectedLayerId.value, draft.value.templateTextPositions)
}

/**
 * @description: 保存当前选中文字层位置
 * @description 只覆盖当前层的 x/y，其他文字层位置保持不变。
 * @param {Partial<TemplateTextPosition>} patch - 位置补丁
 * @return {Promise<void>} 无返回值
 */
async function saveSelectedLayerPosition(patch: Partial<TemplateTextPosition>): Promise<void> {
  if (!draft.value) {
    return
  }

  const currentPosition = getSelectedLayerPosition()
  const nextPosition = {
    ...currentPosition,
    ...patch,
  }

  await saveDraftPatch({
    templateTextPositions: {
      ...draft.value.templateTextPositions,
      [selectedLayerId.value]: nextPosition,
    },
  })
}

/**
 * @description: 应用画布拖动中的文字层位置
 * @description 拖动过程中只更新本地草稿对象，避免每一帧都写 IndexedDB。
 * @param {TemplateTextLayerId} layerId - 文字层 ID
 * @param {TemplateTextPosition} position - 新位置
 * @return {void} 无返回值
 */
function applyPreviewLayerPosition(
  layerId: TemplateTextLayerId,
  position: TemplateTextPosition
): void {
  if (!draft.value) {
    return
  }

  draft.value = {
    ...draft.value,
    templateTextPositions: {
      ...draft.value.templateTextPositions,
      [layerId]: position,
    },
  }
}

/**
 * @description: 提交画布拖动后的文字层位置
 * @description 松开指针后保存最终位置，刷新页面后仍能恢复。
 * @param {TemplateTextLayerId} layerId - 文字层 ID
 * @param {TemplateTextPosition} position - 最终位置
 * @return {Promise<void>} 无返回值
 */
async function commitPreviewLayerPosition(
  layerId: TemplateTextLayerId,
  position: TemplateTextPosition
): Promise<void> {
  if (!draft.value) {
    return
  }

  await saveDraftPatch({
    templateTextPositions: {
      ...draft.value.templateTextPositions,
      [layerId]: position,
    },
  })
}

/**
 * @description: 恢复当前文字层默认定位
 * @description 只删除当前层自定义坐标，预览会重新读取默认位置。
 * @return {Promise<void>} 无返回值
 */
async function resetSelectedLayerPosition(): Promise<void> {
  if (!draft.value) {
    return
  }

  const nextPositions = { ...draft.value.templateTextPositions }
  delete nextPositions[selectedLayerId.value]
  await saveDraftPatch({ templateTextPositions: nextPositions })
}

/**
 * @description: 打开头像或背景选择层
 * @description 校样阶段更换素材后，预览和草稿立即使用新素材 ID。
 * @param {AssetPickerKind} kind - 素材类型
 * @return {void} 无返回值
 */
function openAssetPicker(kind: AssetPickerKind): void {
  activeAssetPicker.value = kind
}

/**
 * @description: 保存校样阶段的素材选择
 * @description 只更新当前素材字段，不影响已调整的模板文字定位。
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
 * @description 管理页仍为骨架，路由切换不删除当前校样草稿。
 * @param {AssetPickerKind} kind - 素材类型
 * @return {void} 无返回值
 */
function openAssetLibrary(kind: AssetPickerKind): void {
  const routeName = kind === 'avatar' ? 'avatar-library' : 'background-library'
  void router.push({ name: routeName, query: { returnTo: 'proofing' } })
}

/**
 * @description: 返回登记资料
 * @description 校样阶段仍允许回到登记页修改基础资料，草稿阶段保持 proofing。
 * @return {Promise<void>} 无返回值
 */
async function backToRegistration(): Promise<void> {
  await router.push({ name: 'registration' })
}

/**
 * @description: 占位正式签发入口
 * @description 正式签发事务和 PNG 生成下一阶段接入，当前只保持按钮行为稳定。
 * @return {void} 无返回值
 */
function requestSigning(): void {
  draftSession.setLastKnownStage('proofing')
}

watch(
  () => uiStore.uiLocale,
  (locale) => {
    if (draft.value && draft.value.certificateLocale !== locale) {
      void saveDraftPatch({ certificateLocale: locale })
    }
  }
)

watch(selectedLayerId, (layerId) => {
  if (!TEMPLATE_TEXT_LAYER_IDS.includes(layerId)) {
    selectedLayerId.value = 'name'
  }
})

onMounted(() => {
  void loadDraft()
})
</script>

<template>
  <ResponsivePageShell :title="t('proofing.title')" :subtitle="t('proofing.subtitle')" wide>
    <v-progress-linear v-if="isLoading" indeterminate color="primary" rounded />

    <v-alert v-else-if="isDraftMissing" type="info" variant="tonal">
      {{ t('registration.draftMissing') }}
    </v-alert>

    <div v-else-if="draft" class="proofing-layout">
      <section class="proofing-preview">
        <div class="proofing-preview__header">
          <h2>{{ t('proofing.previewTitle') }}</h2>
          <span>{{ t('proofing.saveHint') }}</span>
        </div>
        <CertificateTemplatePreview
          :draft="draft"
          :selected-layer-id="selectedLayerId"
          editable
          @select-layer="selectedLayerId = $event"
          @position-change="applyPreviewLayerPosition"
          @position-commit="commitPreviewLayerPosition"
        />
      </section>

      <aside class="proofing-panel">
        <v-card variant="flat" class="proofing-card">
          <v-card-title>{{ t('proofing.fieldEditor') }}</v-card-title>
          <v-card-text class="proofing-card__body">
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
              v-model="selectedTitleId"
              :items="titleSelectItems"
              :label="t('registration.titleOption')"
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

            <div class="proofing-asset-grid">
              <button
                type="button"
                class="proofing-asset-button"
                data-sound="open"
                @click="openAssetPicker('avatar')"
              >
                <span>{{ t('registration.avatar') }}</span>
                <strong>{{ selectedAvatarName }}</strong>
                <v-icon icon="mdi-chevron-right" size="20" />
              </button>
              <button
                type="button"
                class="proofing-asset-button"
                data-sound="open"
                @click="openAssetPicker('background')"
              >
                <span>{{ t('registration.background') }}</span>
                <strong>{{ selectedBackgroundName }}</strong>
                <v-icon icon="mdi-chevron-right" size="20" />
              </button>
            </div>
          </v-card-text>
        </v-card>

        <v-card variant="flat" class="proofing-card">
          <v-card-title>{{ t('proofing.templatePosition') }}</v-card-title>
          <v-card-text class="proofing-card__body">
            <v-select
              v-model="selectedLayerId"
              :items="layerItems"
              :label="t('proofing.positionTarget')"
              variant="outlined"
              color="primary"
            />

            <v-slider
              v-model="selectedLayerX"
              :label="t('proofing.positionX')"
              :min="0"
              :max="100"
              :step="0.5"
              color="primary"
              thumb-label
            />

            <v-slider
              v-model="selectedLayerY"
              :label="t('proofing.positionY')"
              :min="0"
              :max="100"
              :step="0.5"
              color="primary"
              thumb-label
            />

            <div class="proofing-actions">
              <v-btn
                variant="outlined"
                color="primary"
                data-sound="back"
                @click="resetSelectedLayerPosition"
              >
                {{ t('proofing.resetPosition') }}
              </v-btn>
              <v-btn variant="text" color="primary" data-sound="back" @click="backToRegistration">
                {{ t('proofing.backRegistration') }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </aside>
    </div>

    <BottomActionBar
      :primary-label="t('proofing.apply')"
      :primary-disabled="!draft"
      @primary="requestSigning"
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
  </ResponsivePageShell>
</template>

<style scoped>
.proofing-layout {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1fr);
}

.proofing-preview {
  display: grid;
  gap: 12px;
}

.proofing-preview__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.proofing-preview__header h2 {
  margin: 0;
  color: var(--color-foreground);
  font-size: 18px;
  font-weight: 740;
  letter-spacing: 0;
}

.proofing-preview__header span {
  color: var(--color-muted-dark);
  font-size: 13px;
}

.proofing-panel {
  display: grid;
  gap: 14px;
}

.proofing-card {
  border: 1px solid rgba(239, 95, 143, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 246, 250, 0.88)),
    repeating-linear-gradient(
      135deg,
      rgba(155, 123, 255, 0.05) 0,
      rgba(155, 123, 255, 0.05) 1px,
      transparent 1px,
      transparent 18px
    );
  box-shadow: var(--shadow-card);
}

.proofing-card__body {
  display: grid;
  gap: 14px;
}

.proofing-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.proofing-asset-grid {
  display: grid;
  gap: 10px;
}

.proofing-asset-button {
  display: grid;
  min-height: 58px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 10px;
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

.proofing-asset-button:hover {
  border-color: var(--color-primary-active);
  background: var(--bg-primary-10);
}

.proofing-asset-button span {
  color: var(--color-muted-dark);
  font-size: 12px;
}

.proofing-asset-button strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-foreground);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proofing-asset-button .v-icon {
  grid-column: 2 / 3;
  grid-row: 1 / 3;
  color: var(--color-primary-active);
}

@media (min-width: 1080px) {
  .proofing-layout {
    grid-template-columns: minmax(0, 1fr) 360px;
    align-items: start;
  }
}

@media (max-width: 720px) {
  .proofing-preview__header {
    display: grid;
  }

  .proofing-actions {
    display: grid;
  }
}
</style>
