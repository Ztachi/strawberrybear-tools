<script setup lang="ts">
/**
 * @description: SigningStep - 正本签发步骤
 * @description 负责签发状态编排、路由跳转和归档仓储调用，视觉与动效下沉到子组件。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'
import WorkflowEmptyState from '../WorkflowEmptyState/WorkflowEmptyState.vue'
import { getActiveDraft } from '@/db/repositories/draftRepository'
import {
  getIssuedCertificate,
  issueCertificateFromDraft,
} from '@/db/repositories/issuedCertificateRepository'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { resolveIssuedCertificateDraftContext } from '@/domain/certificate/issue'
import { useUiStore } from '@/stores/ui'
import { useWorkflowRecoveryActions } from '../../composables/useWorkflowRecoveryActions'
import SigningCeremonyStage from './components/SigningCeremonyStage/SigningCeremonyStage.vue'
import SigningProgressRail from './components/SigningProgressRail/SigningProgressRail.vue'
import SigningResultPanel from './components/SigningResultPanel/SigningResultPanel.vue'
import type { LocaleCode } from '@/domain/catalog/types'
import type { IssuedCertificate } from '@/domain/certificate/types'
import type { CertificateDraft } from '@/domain/draft/types'
import type { SigningProgressItem } from './types'

type SigningStatus = 'loading' | 'empty' | 'running' | 'complete' | 'failed'

const emit = defineEmits<{
  /** 全屏仪式状态变化，父级用它隐藏流程步骤条 */
  'immersive-change': [immersive: boolean]
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const { restartRegistration, openRegistrationHistory } = useWorkflowRecoveryActions()

/** 页面当前状态。 */
const status = ref<SigningStatus>('loading')
/** 当前待签发草稿。 */
const draft = ref<CertificateDraft | null>(null)
/** 已归档证书。 */
const issuedCertificate = ref<IssuedCertificate | null>(null)
/** 当前仪式阶段索引。 */
const activePhaseIndex = ref(0)
/** GSAP 舞台是否已经播放完毕。 */
const ceremonyFinished = ref(false)
/** 正本快照写库是否已经完成。 */
const archiveFinished = ref(false)
/** 失败提示。 */
const errorMessage = ref('')

/** 签发六阶段文案。 */
const progressItems = computed<SigningProgressItem[]>(() => [
  {
    id: 'seal-dossier',
    title: t('signing.phaseSealDossierTitle'),
    description: t('signing.phaseSealDossierDescription'),
    icon: 'mdi-folder-lock-outline',
  },
  {
    id: 'review-title',
    title: t('signing.phaseReviewTitleTitle'),
    description: t('signing.phaseReviewTitleDescription'),
    icon: 'mdi-medal-outline',
  },
  {
    id: 'catalog-number',
    title: t('signing.phaseCatalogNumberTitle'),
    description: t('signing.phaseCatalogNumberDescription'),
    icon: 'mdi-format-list-numbered',
  },
  {
    id: 'stamp-seal',
    title: t('signing.phaseStampSealTitle'),
    description: t('signing.phaseStampSealDescription'),
    icon: 'mdi-seal-variant',
  },
  {
    id: 'president-sign',
    title: t('signing.phasePresidentSignTitle'),
    description: t('signing.phasePresidentSignDescription'),
    icon: 'mdi-draw-pen',
  },
  {
    id: 'deliver-original',
    title: t('signing.phaseDeliverOriginalTitle'),
    description: t('signing.phaseDeliverOriginalDescription'),
    icon: 'mdi-certificate-outline',
  },
])

/** 当前草稿的资料库实体。 */
const draftContext = computed(() => {
  if (!draft.value) {
    return null
  }

  try {
    return resolveIssuedCertificateDraftContext(draft.value)
  } catch {
    return null
  }
})

/** 当前证书语言。 */
const certificateLocale = computed<LocaleCode>(() => draft.value?.certificateLocale ?? uiStore.uiLocale)
/** 姓名展示。 */
const stylistName = computed(
  () => issuedCertificate.value?.stylistName ?? draft.value?.stylistName ?? t('signing.unknownField')
)
/** 称号展示。 */
const titleName = computed(() => {
  if (issuedCertificate.value) {
    return issuedCertificate.value.titleName
  }

  return draftContext.value ? resolveLocalizedText(draftContext.value.title.name, certificateLocale.value) : ''
})
/** 地区代码。 */
const regionCode = computed(
  () => issuedCertificate.value?.regionCode ?? draftContext.value?.region.code ?? '---'
)
/** 舞台显示的编号，编录阶段前不提前泄露正式随机码。 */
const stageCertificateNo = computed(() => {
  if (issuedCertificate.value?.certificateNo && (activePhaseIndex.value >= 2 || status.value === 'complete')) {
    return issuedCertificate.value.certificateNo
  }

  return `MC-${regionCode.value}-......`
})
/** 是否完成。 */
const isComplete = computed(() => status.value === 'complete')
/** 是否失败。 */
const isFailed = computed(() => status.value === 'failed')

/**
 * @description: 读取页面入口状态
 * @description 有 issuedId 时代表签发已完成后刷新，直接展示领取入口。
 * @return {Promise<void>} 无返回值
 */
async function loadSigningState(): Promise<void> {
  status.value = 'loading'
  errorMessage.value = ''

  const issuedId = typeof route.query.issuedId === 'string' ? route.query.issuedId : ''

  if (issuedId) {
    const certificate = await getIssuedCertificate(issuedId)

    if (certificate) {
      issuedCertificate.value = certificate
      status.value = 'complete'
      activePhaseIndex.value = progressItems.value.length
      return
    }
  }

  const activeDraft = await getActiveDraft()

  if (!activeDraft) {
    status.value = 'empty'
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
  if (!draftContext.value) {
    status.value = 'failed'
    errorMessage.value = t('signing.invalidDraft')
    return
  }

  startSigning()
}

/**
 * @description: 进入签发运行态
 * @description 从校样页进入后自动播放仪式动画，并在动画期间封存证书快照。
 * @return {void} 无返回值
 */
function startSigning(): void {
  if (!draft.value || status.value === 'running') {
    return
  }

  status.value = 'running'
  activePhaseIndex.value = 0
  ceremonyFinished.value = false
  archiveFinished.value = false
  errorMessage.value = ''
  emit('immersive-change', true)

  void issueCertificateFromDraft(draft.value.id, {
    onCertificatePrepared: (certificate) => {
      issuedCertificate.value = certificate
    },
  })
    .then(async (certificate) => {
      issuedCertificate.value = certificate
      archiveFinished.value = true
      await router.replace({ name: 'signing', query: { issuedId: certificate.id } })
      completeWhenReady()
    })
    .catch((error: unknown) => {
      errorMessage.value = error instanceof Error ? error.message : t('signing.failedIntro')
      status.value = 'failed'
      emit('immersive-change', false)
    })
}

/**
 * @description: 舞台动画完成回调
 * @return {void} 无返回值
 */
function handleCeremonyComplete(): void {
  ceremonyFinished.value = true
  completeWhenReady()
}

/**
 * @description: 两条异步线都完成后切到领取态
 * @return {void} 无返回值
 */
function completeWhenReady(): void {
  if (status.value !== 'running' || !ceremonyFinished.value || !archiveFinished.value) {
    return
  }

  status.value = 'complete'
  activePhaseIndex.value = progressItems.value.length
  emit('immersive-change', false)
}

/**
 * @description: 返回校样页
 * @return {Promise<void>} 无返回值
 */
async function backToProofing(): Promise<void> {
  emit('immersive-change', false)
  await router.push({ name: 'proofing' })
}

/**
 * @description: 前往领取证书页
 * @return {Promise<void>} 无返回值
 */
async function receiveCertificate(): Promise<void> {
  const issuedId = issuedCertificate.value?.id

  await router.push({
    name: 'certificate',
    query: issuedId ? { issuedId } : undefined,
  })
}

onMounted(() => {
  void loadSigningState()
})

onBeforeUnmount(() => {
  emit('immersive-change', false)
})
</script>

<template>
  <ResponsivePageShell
    :title="t('signing.title')"
    :subtitle="t('signing.subtitle')"
    hide-header
    wide
  >
    <v-progress-linear v-if="status === 'loading'" indeterminate color="primary" rounded />

    <WorkflowEmptyState
      v-else-if="status === 'empty'"
      :title="t('workflow.noActiveDraftTitle')"
      :description="t('signing.noDraft')"
      @restart="restartRegistration"
      @history="openRegistrationHistory"
    />

    <div v-else class="signing-step">
      <div class="signing-step__ceremony-stack">
        <div class="signing-step__ceremony-sticky">
          <SigningCeremonyStage
            :ceremony-status="status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'complete'"
            :progress-items="progressItems"
            :stylist-name="stylistName"
            :title-name="titleName"
            :certificate-no="stageCertificateNo"
            @phase="activePhaseIndex = $event"
            @complete="handleCeremonyComplete"
          />
        </div>

        <div class="signing-step__timeline-column">
          <SigningProgressRail
            :items="progressItems"
            :active-index="activePhaseIndex"
            :complete="isComplete"
            :failed="isFailed"
          />

          <SigningResultPanel
            v-if="status === 'complete' || status === 'failed'"
            :status="status"
            :certificate-no="issuedCertificate?.certificateNo"
            :error-message="errorMessage"
            @receive="receiveCertificate"
            @retry="startSigning"
            @back="backToProofing"
          />
        </div>
      </div>
    </div>
  </ResponsivePageShell>
</template>

<style scoped>
.signing-step {
  display: grid;
  gap: 18px;
}

.signing-step__ceremony-stack {
  display: grid;
  align-items: start;
  gap: clamp(18px, 3vw, 28px);
  position: relative;
}

.signing-step__ceremony-sticky {
  position: sticky;
  z-index: 2;
  align-self: start;
  top: calc(64px + var(--safe-top, 0px));
}

.signing-step__ceremony-sticky :deep(.ceremony-stage) {
  min-height: min(620px, calc(100dvh - 84px));
}

.signing-step__timeline-column {
  display: grid;
  min-width: 0;
  gap: 16px;
}

@media (min-width: 1120px) {
  .signing-step__ceremony-stack {
    grid-template-columns: minmax(0, 1fr) minmax(360px, 430px);
  }
}

@media (max-width: 1119px) {
  .signing-step__ceremony-sticky {
    top: calc(64px + var(--safe-top, 0px));
  }

  .signing-step__ceremony-sticky :deep(.ceremony-stage) {
    min-height: min(540px, calc(100dvh - 72px));
  }
}
</style>
