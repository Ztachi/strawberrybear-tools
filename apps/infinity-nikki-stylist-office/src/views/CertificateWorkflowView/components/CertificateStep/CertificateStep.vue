<script setup lang="ts">
/**
 * @description: CertificateStep - 领取证书步骤
 * @description 读取已签发证书快照，并按当前 tab 即时生成正本图片，不长期保存大图。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'
import WorkflowEmptyState from '../WorkflowEmptyState/WorkflowEmptyState.vue'
import {
  getIssuedCertificate,
  getLatestIssuedCertificate,
  prepareIssuedCertificateRenderInput,
} from '@/db/repositories/issuedCertificateRepository'
import {
  renderCertificateImage,
  type CertificateRenderKind,
  type RenderedCertificateImage,
} from '@/domain/certificate/render'
import { useNavigationIntentStore } from '@/stores/navigationIntent'
import { useWorkflowRecoveryActions } from '../../composables/useWorkflowRecoveryActions'
import type { IssuedCertificate } from '@/domain/certificate/types'

interface CertificateImageViewItem {
  /** 图片类型 */
  kind: CertificateRenderKind
  /** 图片 URL */
  url: string
  /** 图片宽度 */
  width: number
  /** 图片高度 */
  height: number
  /** 下载文件名 */
  downloadName: string
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const navigationIntent = useNavigationIntentStore()
const { restartRegistration, openRegistrationHistory } = useWorkflowRecoveryActions()

/** 页面加载状态。 */
const isLoading = ref(true)
/** 图片生成状态。 */
const isRenderingImage = ref(false)
/** 图片生成期间用户切换到的新规格，当前任务结束后补渲染。 */
const pendingRenderKind = ref<CertificateRenderKind | null>(null)
/** 页面错误或空状态文案。 */
const emptyMessage = ref('')
/** 图片生成失败文案。 */
const renderError = ref('')
/** 当前展示证书。 */
const certificate = ref<IssuedCertificate | null>(null)
/** 当前选中的正本规格。 */
const selectedKind = ref<CertificateRenderKind>('wide')
/** 本次页面会话内的图片 URL 缓存，不写入 IndexedDB。 */
const imageItems = ref<Partial<Record<CertificateRenderKind, CertificateImageViewItem>>>({})

/** 当前选中图片。 */
const selectedImage = computed(() => imageItems.value[selectedKind.value])

/**
 * @description: 释放图片 URL
 * @param {CertificateRenderKind} [kind] - 指定规格，缺省释放全部
 * @return {void} 无返回值
 */
function revokeImageObjectUrls(kind?: CertificateRenderKind): void {
  const kinds: CertificateRenderKind[] = kind ? [kind] : ['wide', 'a4']

  kinds.forEach((itemKind) => {
    const item = imageItems.value[itemKind]

    if (item) {
      URL.revokeObjectURL(item.url)
      delete imageItems.value[itemKind]
    }
  })
}

/**
 * @description: 转换渲染结果为页面图片项
 * @param {RenderedCertificateImage} image - 渲染结果
 * @return {CertificateImageViewItem} 页面图片项
 */
function toImageViewItem(image: RenderedCertificateImage): CertificateImageViewItem {
  const certificateNo = certificate.value?.certificateNo ?? 'certificate'

  return {
    kind: image.kind,
    url: URL.createObjectURL(image.blob),
    width: image.width,
    height: image.height,
    downloadName: `${certificateNo}-${image.kind}.png`,
  }
}

/**
 * @description: 读取已归档证书
 * @return {Promise<void>} 无返回值
 */
async function loadCertificate(): Promise<void> {
  isLoading.value = true
  emptyMessage.value = ''
  renderError.value = ''
  revokeImageObjectUrls()

  const issuedId = typeof route.query.issuedId === 'string' ? route.query.issuedId : ''
  const issuedCertificate = issuedId
    ? await getIssuedCertificate(issuedId)
    : await getLatestIssuedCertificate()

  if (!issuedCertificate) {
    emptyMessage.value = t('certificate.empty')
    isLoading.value = false
    return
  }

  certificate.value = issuedCertificate
  isLoading.value = false
  await renderSelectedImage(true)
}

/**
 * @description: 按当前 tab 即时生成正本图片
 * @description 生成结果只缓存在页面内存中，切换证书或离开页面会释放。
 * @param {boolean} force - 是否强制重新生成
 * @return {Promise<void>} 无返回值
 */
async function renderSelectedImage(force = false): Promise<void> {
  if (!certificate.value) {
    return
  }

  if (isRenderingImage.value) {
    pendingRenderKind.value = selectedKind.value
    return
  }

  if (!force && imageItems.value[selectedKind.value]) {
    return
  }

  isRenderingImage.value = true
  renderError.value = ''

  if (force) {
    revokeImageObjectUrls(selectedKind.value)
  }

  let preparedInput: Awaited<ReturnType<typeof prepareIssuedCertificateRenderInput>> | null = null

  try {
    preparedInput = await prepareIssuedCertificateRenderInput(certificate.value)
    const renderedImage = await renderCertificateImage(preparedInput.input, selectedKind.value)
    imageItems.value[selectedKind.value] = toImageViewItem(renderedImage)
  } catch (error) {
    renderError.value = error instanceof Error ? error.message : t('certificate.renderFailed')
  } finally {
    preparedInput?.cleanup()
    isRenderingImage.value = false

    if (pendingRenderKind.value && pendingRenderKind.value === selectedKind.value) {
      pendingRenderKind.value = null
      void renderSelectedImage()
    } else {
      pendingRenderKind.value = null
    }
  }
}

/**
 * @description: 下载当前正本图片
 * @param {CertificateImageViewItem} image - 图片展示项
 * @return {void} 无返回值
 */
function downloadImage(image: CertificateImageViewItem): void {
  const link = document.createElement('a')
  link.href = image.url
  link.download = image.downloadName
  link.click()
}

/**
 * @description: 回到签发历史详情
 * @return {Promise<void>} 无返回值
 */
async function openHistoryDetail(): Promise<void> {
  if (certificate.value?.id) {
    navigationIntent.requestProfileIssuedDetail(certificate.value.id)
  }

  await router.push({
    name: 'profile',
    query: {
      tab: 'certificates',
    },
  })
}

watch(selectedKind, () => {
  void renderSelectedImage()
})

onMounted(() => {
  void loadCertificate()
})

onBeforeUnmount(() => {
  revokeImageObjectUrls()
})
</script>

<template>
  <ResponsivePageShell
    :title="t('certificate.title')"
    :subtitle="t('certificate.subtitle')"
    hide-header
    wide
  >
    <v-progress-linear v-if="isLoading" indeterminate color="primary" rounded />

    <WorkflowEmptyState
      v-else-if="emptyMessage"
      :title="t('workflow.noActiveDraftTitle')"
      :description="emptyMessage"
      @restart="restartRegistration"
      @history="openRegistrationHistory"
    />

    <section v-else-if="certificate" class="certificate-viewer">
      <header class="certificate-viewer__header">
        <div class="min-w-0">
          <p class="certificate-viewer__eyebrow">
            {{ t('certificate.archiveEyebrow') }}
          </p>
          <h2 class="certificate-viewer__title">
            {{ certificate.certificateNo }}
          </h2>
          <p class="certificate-viewer__meta">
            {{ certificate.stylistName }} · {{ certificate.titleName }} ·
            {{ certificate.issuedDateText }}
          </p>
        </div>
        <div class="certificate-viewer__actions">
          <v-btn variant="outlined" color="primary" data-sound="nav" @click="openHistoryDetail">
            <v-icon icon="mdi-history" start />
            {{ t('certificate.backHistoryDetail') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            data-sound="primary"
            :disabled="!selectedImage || isRenderingImage"
            @click="selectedImage && downloadImage(selectedImage)"
          >
            <v-icon icon="mdi-download" start />
            {{ t('certificate.downloadCurrent') }}
          </v-btn>
        </div>
      </header>

      <v-tabs v-model="selectedKind" class="certificate-viewer__tabs" color="primary">
        <v-tab value="wide">
          {{ t('certificate.wideTab') }}
        </v-tab>
        <v-tab value="a4">
          {{ t('certificate.a4Tab') }}
        </v-tab>
      </v-tabs>

      <v-alert v-if="renderError" type="error" variant="tonal">
        {{ renderError }}
      </v-alert>

      <div v-if="isRenderingImage && !selectedImage" class="certificate-viewer__loading">
        <v-progress-circular indeterminate color="primary" size="42" />
        <span>{{ t('certificate.rendering') }}</span>
      </div>

      <figure v-else-if="selectedImage" class="certificate-viewer__figure">
        <img
          :src="selectedImage.url"
          :alt="t('certificate.imageAlt')"
          class="certificate-viewer__image"
        />
        <figcaption>{{ selectedImage.width }} × {{ selectedImage.height }}</figcaption>
      </figure>
    </section>
  </ResponsivePageShell>
</template>

<style scoped>
.certificate-viewer {
  display: grid;
  gap: 14px;
}

.certificate-viewer__header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  justify-content: space-between;
  padding: 18px;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: var(--shadow-card);
}

.certificate-viewer__eyebrow {
  margin: 0 0 4px;
  color: var(--color-gold);
  font-size: 12px;
  font-weight: 820;
}

.certificate-viewer__title {
  margin: 0;
  color: var(--color-primary-active);
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 840;
  line-height: 1.15;
}

.certificate-viewer__meta {
  margin: 8px 0 0;
  color: var(--color-muted-dark);
  font-size: 14px;
}

.certificate-viewer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.certificate-viewer__tabs {
  border: 1px solid rgba(239, 95, 143, 0.16);
  border-radius: 8px;
  background: rgba(255, 249, 252, 0.82);
}

.certificate-viewer__loading,
.certificate-viewer__figure {
  display: grid;
  gap: 10px;
  min-height: 360px;
  padding: clamp(10px, 2vw, 18px);
  margin: 0;
  border: 1px solid rgba(196, 138, 44, 0.24);
  border-radius: 8px;
  background: #fffafc;
  box-shadow: 0 16px 38px rgba(122, 78, 98, 0.13);
}

.certificate-viewer__loading {
  place-items: center;
  color: var(--color-muted-dark);
  font-size: 14px;
  font-weight: 720;
}

.certificate-viewer__image {
  display: block;
  width: 100%;
  max-height: calc(100dvh - 260px);
  object-fit: contain;
  border-radius: 6px;
  background: #fff;
}

.certificate-viewer__figure figcaption {
  color: var(--color-muted-dark);
  font-size: 12px;
  text-align: right;
}

@media (max-width: 640px) {
  .certificate-viewer__header {
    align-items: stretch;
  }

  .certificate-viewer__actions,
  .certificate-viewer__actions .v-btn {
    width: 100%;
  }
}
</style>
