<script setup lang="ts">
/**
 * @description: AssetPickerDialog - 头像/背景选择层
 * @description 登记页和校样页共用同一个选择入口，当前先接入协会内置素材与自定义管理入口。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { listCustomAssets } from '@/db/repositories/customAssetRepository'
import { getOfficialAssetImageSource } from '@/domain/assets/officialAssets'
import { resolveLocalizedText } from '@/domain/catalog/text'
import type { CustomAssetRecord } from '@/domain/assets/types'
import type { LocaleCode, OfficialAssetOption } from '@/domain/catalog/types'

/** 素材选择层当前处理的业务类型。 */
type AssetPickerKind = 'avatar' | 'background'

const props = defineProps<{
  /** 弹层开关，由使用页面持有，关闭时保留原页面状态。 */
  modelValue: boolean
  /** 当前选择头像或背景；为 null 时弹层不展示具体列表。 */
  kind: AssetPickerKind | null
  /** 顶部语言同步后的当前模板语言。 */
  locale: LocaleCode
  /** 当前草稿正在使用的素材 ID。 */
  selectedId: string
}>()

const emit = defineEmits<{
  /** 同步 v-model 开关。 */
  'update:modelValue': [value: boolean]
  /** 选择素材后由父页面写入当前草稿。 */
  select: [payload: { kind: AssetPickerKind; id: string }]
  /** 打开自定义素材管理页。 */
  manage: [kind: AssetPickerKind]
}>()

const { t } = useI18n()

/** 当前弹层读取到的自定义素材。 */
const customAssets = ref<CustomAssetRecord[]>([])
/** 自定义素材 Blob 对应的临时 URL，弹层关闭或卸载时释放。 */
const customAssetUrls = ref<Record<string, string>>({})

/** v-dialog 的双向绑定代理，关闭弹层时不隐式改动草稿。 */
const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

/** 当前类型对应的协会内置素材列表。 */
const officialAssets = computed<OfficialAssetOption[]>(() => {
  if (props.kind === 'avatar') {
    return associationCatalogSeed.officialAvatars
  }

  if (props.kind === 'background') {
    return associationCatalogSeed.officialBackgrounds
  }

  return []
})

/** 当前弹层标题跟随素材类型与 UI 语言。 */
const dialogTitle = computed(() => {
  if (props.kind === 'avatar') {
    return t('registration.avatarPickerTitle')
  }

  if (props.kind === 'background') {
    return t('registration.backgroundPickerTitle')
  }

  return ''
})

/** 内置素材区域标题跟随素材类型。 */
const officialGroupTitle = computed(() =>
  props.kind === 'avatar'
    ? t('registration.officialAvatarGroup')
    : t('registration.officialBackgroundGroup')
)

/** 自定义素材管理按钮文案跟随素材类型。 */
const manageLabel = computed(() =>
  props.kind === 'avatar'
    ? t('registration.manageCustomAvatar')
    : t('registration.manageCustomBackground')
)

/** 素材卡片展示名使用内容语言包，并在缺失时稳定回退。 */
const assetItems = computed(() =>
  officialAssets.value.map((asset) => ({
    ...asset,
    displayName: resolveLocalizedText(asset.name, props.locale),
    imageSrc: getOfficialAssetImageSource(asset.assetId),
  }))
)

/** 自定义素材展示项，名称来自用户输入，不跟随语言翻译。 */
const customAssetItems = computed(() =>
  customAssets.value.map((asset) => ({
    id: asset.id,
    displayName: asset.name,
    imageSrc: customAssetUrls.value[asset.id] ?? '',
  }))
)

/**
 * @description: 释放自定义素材预览 URL
 * @description 防止用户频繁打开选择层时 Blob URL 泄漏。
 * @return {void} 无返回值
 */
function revokeCustomAssetUrls(): void {
  Object.values(customAssetUrls.value).forEach((url) => URL.revokeObjectURL(url))
  customAssetUrls.value = {}
}

/**
 * @description: 读取当前类型的自定义素材
 * @description 弹层每次打开时刷新列表，保证从素材管理页返回后立即看到新头像。
 * @return {Promise<void>} 无返回值
 */
async function loadCustomAssets(): Promise<void> {
  revokeCustomAssetUrls()

  if (!props.kind) {
    customAssets.value = []
    return
  }

  const assets = await listCustomAssets(props.kind)
  const nextUrls: Record<string, string> = {}

  assets.forEach((asset) => {
    nextUrls[asset.id] = URL.createObjectURL(asset.blob)
  })

  customAssets.value = assets
  customAssetUrls.value = nextUrls
}

/**
 * @description: 选择指定素材
 * @description 选择立即关闭弹层，具体保存由父页面统一写入 Dexie 草稿。
 * @param {string} id - 协会内置或自定义素材 ID
 * @return {void} 无返回值
 */
function selectAsset(id: string): void {
  if (!props.kind) {
    return
  }

  emit('select', { kind: props.kind, id })
  emit('update:modelValue', false)
}

/**
 * @description: 随机选择当前类型素材
 * @description 当前 seed 只有一个素材时仍走同一逻辑，后续扩展列表后无需改父页面。
 * @return {void} 无返回值
 */
function randomizeAsset(): void {
  const candidates = [...assetItems.value, ...customAssetItems.value]

  if (candidates.length === 0) {
    return
  }

  const randomIndex = Math.floor(Math.random() * candidates.length)
  selectAsset(candidates[randomIndex].id)
}

/**
 * @description: 打开自定义素材管理
 * @description 管理页路由由父页面负责，避免弹层组件直接耦合当前流程路由。
 * @return {void} 无返回值
 */
function openCustomManager(): void {
  if (!props.kind) {
    return
  }

  emit('manage', props.kind)
  emit('update:modelValue', false)
}

watch(
  () => [props.modelValue, props.kind] as const,
  ([isOpen]) => {
    if (isOpen) {
      void loadCustomAssets()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  revokeCustomAssetUrls()
})
</script>

<template>
  <v-dialog v-model="isOpen" max-width="560" scrollable>
    <v-card class="asset-picker-card">
      <v-card-title class="asset-picker-card__title">
        {{ dialogTitle }}
      </v-card-title>
      <v-card-subtitle class="asset-picker-card__subtitle">
        {{ t('registration.assetPickerIntro') }}
      </v-card-subtitle>

      <v-card-text class="asset-picker-card__body">
        <section class="asset-picker-card__section">
          <div class="asset-picker-card__section-title">
            {{ officialGroupTitle }}
          </div>

          <div class="asset-picker-card__list">
            <button
              v-for="asset in assetItems"
              :key="asset.id"
              type="button"
              :class="[
                'asset-picker-option',
                { 'asset-picker-option--active': asset.id === selectedId },
              ]"
              data-sound="select"
              @click="selectAsset(asset.id)"
            >
              <span class="asset-picker-option__icon">
                <img
                  v-if="asset.imageSrc"
                  :src="asset.imageSrc"
                  alt=""
                  class="asset-picker-option__image"
                />
                <v-icon
                  v-else
                  :icon="kind === 'avatar' ? 'mdi-account-circle-outline' : 'mdi-image-outline'"
                  size="22"
                />
              </span>
              <span class="asset-picker-option__text">
                <strong>{{ asset.displayName }}</strong>
                <small>{{ t('registration.officialAsset') }}</small>
              </span>
              <v-icon
                v-if="asset.id === selectedId"
                icon="mdi-check-circle"
                color="primary"
                size="20"
              />
            </button>
          </div>
        </section>

        <section class="asset-picker-card__section">
          <div class="asset-picker-card__section-title">
            {{ t('registration.customAssetGroup') }}
          </div>

          <div v-if="customAssetItems.length > 0" class="asset-picker-card__list">
            <button
              v-for="asset in customAssetItems"
              :key="asset.id"
              type="button"
              :class="[
                'asset-picker-option',
                { 'asset-picker-option--active': asset.id === selectedId },
              ]"
              data-sound="select"
              @click="selectAsset(asset.id)"
            >
              <span class="asset-picker-option__icon">
                <img
                  v-if="asset.imageSrc"
                  :src="asset.imageSrc"
                  alt=""
                  class="asset-picker-option__image"
                />
                <v-icon
                  v-else
                  :icon="kind === 'avatar' ? 'mdi-account-circle-outline' : 'mdi-image-outline'"
                  size="22"
                />
              </span>
              <span class="asset-picker-option__text">
                <strong>{{ asset.displayName }}</strong>
                <small>{{ t('registration.customAssetGroup') }}</small>
              </span>
              <v-icon
                v-if="asset.id === selectedId"
                icon="mdi-check-circle"
                color="primary"
                size="20"
              />
            </button>
          </div>

          <div class="asset-picker-card__empty">
            <v-icon icon="mdi-folder-image" size="22" />
            <span>
              {{ customAssetItems.length > 0 ? manageLabel : t('registration.noCustomAssets') }}
            </span>
            <v-btn variant="text" color="primary" data-sound="nav" @click="openCustomManager">
              {{ manageLabel }}
            </v-btn>
          </div>
        </section>
      </v-card-text>

      <v-card-actions class="asset-picker-card__actions">
        <v-btn variant="text" data-sound="back" @click="isOpen = false">
          {{ t('common.action.cancel') }}
        </v-btn>
        <v-btn variant="outlined" color="primary" data-sound="random" @click="randomizeAsset">
          {{ t('registration.randomAsset') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.asset-picker-card {
  border: 1px solid var(--border-primary-20);
  background: #fff9fc;
}

.asset-picker-card__title {
  color: var(--color-foreground);
  font-size: 18px;
  font-weight: 720;
}

.asset-picker-card__subtitle {
  color: var(--color-muted-dark);
  white-space: normal;
}

.asset-picker-card__body {
  display: grid;
  gap: 18px;
}

.asset-picker-card__section {
  display: grid;
  gap: 10px;
}

.asset-picker-card__section-title {
  color: var(--color-muted-dark);
  font-size: 13px;
  font-weight: 650;
}

.asset-picker-card__list {
  display: grid;
  gap: 10px;
}

.asset-picker-option {
  display: grid;
  width: 100%;
  min-height: 64px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-primary-20);
  border-radius: 8px;
  color: var(--color-foreground);
  background: rgba(255, 255, 255, 0.78);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.asset-picker-option:hover,
.asset-picker-option--active {
  border-color: var(--color-primary-active);
  background: var(--bg-primary-10);
}

.asset-picker-option__icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--color-gold);
  background: #fff3f6;
  overflow: hidden;
}

.asset-picker-option__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-picker-option__text {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.asset-picker-option__text strong {
  overflow: hidden;
  color: var(--color-foreground);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-picker-option__text small {
  color: var(--color-muted-dark);
  font-size: 12px;
}

.asset-picker-card__empty {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px dashed rgba(247, 183, 190, 0.5);
  border-radius: 8px;
  color: var(--color-muted-dark);
  background: rgba(255, 255, 255, 0.58);
}

.asset-picker-card__empty span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-picker-card__actions {
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--border-primary-20);
}

@media (max-width: 520px) {
  .asset-picker-card__empty {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .asset-picker-card__empty .v-btn {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
