<script setup lang="ts">
/**
 * @description: SignaturePickerDialog - 会长签章选择层
 * @description 图片签章与文字签章在弹窗内先走临时态，用户确认后才写入草稿。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { listCustomAssets } from '@/db/repositories/customAssetRepository'
import { getOfficialSignatureImageSource } from '@/domain/assets/officialAssets'
import { resolveLocalizedText } from '@/domain/catalog/text'
import type { CustomAssetRecord } from '@/domain/assets/types'
import type { LocaleCode } from '@/domain/catalog/types'
import type { CertificateSignatureMode } from '@/domain/draft/types'

const props = defineProps<{
  /** 弹层开关，由使用页面持有。 */
  modelValue: boolean
  /** 当前证书语言。 */
  locale: LocaleCode
  /** 草稿当前签章模式。 */
  selectedMode: CertificateSignatureMode
  /** 草稿当前图片签章 ID。 */
  selectedImageId: string
  /** 草稿当前文字签章。 */
  selectedText: string
}>()

const emit = defineEmits<{
  /** 同步 v-model 开关。 */
  'update:modelValue': [value: boolean]
  /** 确认签章选择。 */
  confirm: [
    payload:
      | { mode: 'image'; imageId: string }
      | { mode: 'text'; text: string }
  ]
  /** 打开自定义签章管理页。 */
  manage: []
}>()

const { t } = useI18n()

/** 弹窗内部 tab；每次打开默认停在图片签章。 */
const activeTab = ref<CertificateSignatureMode>('image')
/** 临时图片签章 ID。 */
const draftImageId = ref('')
/** 临时文字签章。 */
const draftText = ref('')
/** 文字签章表单错误。 */
const textError = ref('')
/** 当前弹层读取到的自定义签章。 */
const customSignatures = ref<CustomAssetRecord[]>([])
/** 自定义签章 Blob 对应的临时 URL。 */
const customSignatureUrls = ref<Record<string, string>>({})

/** v-dialog 的双向绑定代理，关闭弹层时不隐式改动草稿。 */
const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

/** 当前类型对应的协会内置签章列表。 */
const officialSignatureItems = computed(() =>
  associationCatalogSeed.officialSignatures.map((signature) => ({
    id: signature.id,
    displayName: resolveLocalizedText(signature.name, props.locale),
    imageSrc: getOfficialSignatureImageSource(signature.id, props.locale),
  }))
)

/** 自定义签章展示项，名称来自用户输入，不跟随语言翻译。 */
const customSignatureItems = computed(() =>
  customSignatures.value.map((signature) => ({
    id: signature.id,
    displayName: signature.name,
    imageSrc: customSignatureUrls.value[signature.id] ?? '',
  }))
)

/** 当前可选图片签章 ID 集合，用于避免确认已删除的自定义签章。 */
const availableSignatureImageIds = computed(
  () => new Set([...officialSignatureItems.value, ...customSignatureItems.value].map((item) => item.id))
)

/** 当前图片 tab 是否可确认。 */
const canConfirmImage = computed(
  () => Boolean(draftImageId.value) && availableSignatureImageIds.value.has(draftImageId.value)
)

/**
 * @description: 释放自定义签章预览 URL
 * @description 防止用户频繁打开选择层时 Blob URL 泄漏。
 * @return {void} 无返回值
 */
function revokeCustomSignatureUrls(): void {
  Object.values(customSignatureUrls.value).forEach((url) => URL.revokeObjectURL(url))
  customSignatureUrls.value = {}
}

/**
 * @description: 读取自定义签章
 * @description 弹层每次打开时刷新列表，保证从素材管理页返回后立即看到新签章。
 * @return {Promise<void>} 无返回值
 */
async function loadCustomSignatures(): Promise<void> {
  revokeCustomSignatureUrls()

  const assets = await listCustomAssets('signature')
  const nextUrls: Record<string, string> = {}

  assets.forEach((asset) => {
    nextUrls[asset.id] = URL.createObjectURL(asset.blob)
  })

  customSignatures.value = assets
  customSignatureUrls.value = nextUrls
}

/**
 * @description: 初始化弹窗临时态
 * @description 按草稿当前签章模式打开对应 tab；历史图片和历史文字都保留在临时表单中。
 * @return {void} 无返回值
 */
function initializeDraftState(): void {
  activeTab.value = props.selectedMode
  draftImageId.value = props.selectedImageId || officialSignatureItems.value[0]?.id || ''
  draftText.value = props.selectedText
  textError.value = ''
}

/**
 * @description: 确认当前 tab 的签章选择
 * @return {void} 无返回值
 */
function confirmSignature(): void {
  if (activeTab.value === 'image') {
    if (!draftImageId.value) {
      return
    }

    emit('confirm', { mode: 'image', imageId: draftImageId.value })
    emit('update:modelValue', false)
    return
  }

  const nextText = draftText.value.replace(/[\r\n]/g, '').slice(0, 6).trim()

  if (!nextText) {
    textError.value = t('proofing.signatureEmptyError')
    return
  }

  textError.value = ''
  emit('confirm', { mode: 'text', text: nextText })
  emit('update:modelValue', false)
}

/**
 * @description: 打开自定义签章管理
 * @return {void} 无返回值
 */
function openCustomManager(): void {
  emit('manage')
  emit('update:modelValue', false)
}

watch(
  [() => props.modelValue, () => props.locale],
  ([isDialogOpen]) => {
    if (isDialogOpen) {
      initializeDraftState()
      void loadCustomSignatures()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  revokeCustomSignatureUrls()
})
</script>

<template>
  <v-dialog v-model="isOpen" max-width="640" scrollable>
    <v-card class="signature-picker-card">
      <v-card-title class="signature-picker-card__title">
        {{ t('proofing.editSignatureTitle') }}
      </v-card-title>
      <v-card-subtitle class="signature-picker-card__subtitle">
        {{ t('proofing.editSignatureIntro') }}
      </v-card-subtitle>

      <v-tabs v-model="activeTab" color="primary" class="signature-picker-card__tabs">
        <v-tab value="image">
          {{ t('signature.imageTab') }}
        </v-tab>
        <v-tab value="text">
          {{ t('signature.textTab') }}
        </v-tab>
      </v-tabs>

      <v-card-text class="signature-picker-card__body">
        <v-window v-model="activeTab">
          <v-window-item value="image">
            <div class="signature-picker-card__section">
              <div class="signature-picker-card__section-title">
                {{ t('signature.officialGroup') }}
              </div>

              <div class="signature-picker-card__list">
                <button
                  v-for="signature in officialSignatureItems"
                  :key="signature.id"
                  type="button"
                  :class="[
                    'signature-picker-option',
                    { 'signature-picker-option--active': signature.id === draftImageId },
                  ]"
                  data-sound="select"
                  @click="draftImageId = signature.id"
                >
                  <span class="signature-picker-option__image-wrap">
                    <img v-if="signature.imageSrc" :src="signature.imageSrc" alt="" />
                    <v-icon v-else icon="mdi-draw-pen" size="22" />
                  </span>
                  <span class="signature-picker-option__text">
                    <strong>{{ signature.displayName }}</strong>
                    <small>{{ t('registration.officialAsset') }}</small>
                  </span>
                  <v-icon
                    v-if="signature.id === draftImageId"
                    icon="mdi-check-circle"
                    color="primary"
                    size="20"
                  />
                </button>
              </div>
            </div>

            <div class="signature-picker-card__section">
              <div class="signature-picker-card__section-title">
                {{ t('signature.customGroup') }}
              </div>

              <div v-if="customSignatureItems.length > 0" class="signature-picker-card__list">
                <button
                  v-for="signature in customSignatureItems"
                  :key="signature.id"
                  type="button"
                  :class="[
                    'signature-picker-option',
                    { 'signature-picker-option--active': signature.id === draftImageId },
                  ]"
                  data-sound="select"
                  @click="draftImageId = signature.id"
                >
                  <span class="signature-picker-option__image-wrap">
                    <img v-if="signature.imageSrc" :src="signature.imageSrc" alt="" />
                    <v-icon v-else icon="mdi-draw-pen" size="22" />
                  </span>
                  <span class="signature-picker-option__text">
                    <strong>{{ signature.displayName }}</strong>
                    <small>{{ t('signature.customGroup') }}</small>
                  </span>
                  <v-icon
                    v-if="signature.id === draftImageId"
                    icon="mdi-check-circle"
                    color="primary"
                    size="20"
                  />
                </button>
              </div>

              <div class="signature-picker-card__empty">
                <v-icon icon="mdi-folder-image" size="22" />
                <span>
                  {{
                    customSignatureItems.length > 0
                      ? t('signature.manageCustom')
                      : t('signature.noCustom')
                  }}
                </span>
                <v-btn variant="text" color="primary" data-sound="nav" @click="openCustomManager">
                  {{ t('signature.manageCustom') }}
                </v-btn>
              </div>
            </div>
          </v-window-item>

          <v-window-item value="text" class="signature-picker-card__text-pane">
            <v-text-field
              v-model="draftText"
              :label="t('proofing.signatureInputLabel')"
              :error-messages="textError"
              maxlength="6"
              counter="6"
              variant="outlined"
              color="primary"
              @keyup.enter="confirmSignature"
            />
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-card-actions class="signature-picker-card__actions">
        <v-btn variant="text" data-sound="back" @click="isOpen = false">
          {{ t('common.action.cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="activeTab === 'image' && !canConfirmImage"
          data-sound="primary"
          @click="confirmSignature"
        >
          {{ t('common.action.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.signature-picker-card {
  border: 1px solid var(--border-primary-20);
  background: #fff9fc;
}

.signature-picker-card__title {
  color: var(--color-foreground);
  font-size: 18px;
  font-weight: 720;
}

.signature-picker-card__subtitle {
  color: var(--color-muted-dark);
  white-space: normal;
}

.signature-picker-card__tabs {
  border-block: 1px solid var(--border-primary-20);
  background: rgba(255, 255, 255, 0.52);
}

.signature-picker-card__body {
  display: grid;
  gap: 18px;
}

.signature-picker-card__section {
  display: grid;
  gap: 10px;
}

.signature-picker-card__section + .signature-picker-card__section {
  margin-top: 18px;
}

.signature-picker-card__section-title {
  color: var(--color-muted-dark);
  font-size: 13px;
  font-weight: 650;
}

.signature-picker-card__list {
  display: grid;
  gap: 10px;
}

.signature-picker-option {
  display: grid;
  width: 100%;
  min-height: 72px;
  grid-template-columns: minmax(92px, 132px) minmax(0, 1fr) auto;
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

.signature-picker-option:hover,
.signature-picker-option--active {
  border-color: var(--color-primary-active);
  background: var(--bg-primary-10);
}

.signature-picker-option__image-wrap {
  display: inline-flex;
  width: 100%;
  aspect-ratio: 2172 / 724;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  color: var(--color-gold);
  background: #fff3f6;
}

.signature-picker-option__image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.signature-picker-option__text {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.signature-picker-option__text strong {
  overflow: hidden;
  color: var(--color-foreground);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signature-picker-option__text small {
  color: var(--color-muted-dark);
  font-size: 12px;
}

.signature-picker-card__empty {
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

.signature-picker-card__empty span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signature-picker-card__text-pane {
  padding-top: 8px;
}

.signature-picker-card__actions {
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--border-primary-20);
}

@media (max-width: 520px) {
  .signature-picker-option {
    grid-template-columns: minmax(84px, 104px) minmax(0, 1fr) auto;
  }

  .signature-picker-card__empty {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .signature-picker-card__empty .v-btn {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
