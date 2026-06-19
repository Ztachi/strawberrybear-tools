<script setup lang="ts">
/**
 * @description: HomeView - 仪式化首页
 * @description 组合首页私有组件，保持页面层只负责流程入口和文案编排。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'
import certificateDemo from '@/assets/images/demo.png'
import { clearActiveDraft, getActiveDraft, replaceActiveDraft } from '@/db/repositories/draftRepository'
import { createDefaultDraft } from '@/domain/draft/factory'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useUiStore } from '@/stores/ui'
import HomeHero from './components/HomeHero/HomeHero.vue'
import HomeDraftDeleteConfirmDialog from './components/HomeDraftDeleteConfirmDialog/HomeDraftDeleteConfirmDialog.vue'
import HomeDraftResumeDialog from './components/HomeDraftResumeDialog/HomeDraftResumeDialog.vue'
import HomeServiceNotes from './components/HomeServiceNotes/HomeServiceNotes.vue'
import type { CertificateDraft } from '@/domain/draft/types'

const { t } = useI18n()
const router = useRouter()
const draftSession = useDraftSessionStore()
const uiStore = useUiStore()
const resumeDialogOpen = ref(false)
const restartConfirmOpen = ref(false)
const pendingDraft = ref<CertificateDraft | null>(null)

/** 首页只做轻量流程提示；正式步骤条放在登记后的办理流程页。 */
const processSteps = computed(() => [
  t('home.stepRegister'),
  t('home.stepReview'),
  t('home.stepIssue'),
])

/** 首页服务说明卡片，避免在模板中复制同构 DOM。 */
const serviceNotes = computed(() => [
  {
    title: t('home.serviceRegisterTitle'),
    text: t('home.serviceRegisterText'),
  },
  {
    title: t('home.serviceReviewTitle'),
    text: t('home.serviceReviewText'),
  },
  {
    title: t('home.serviceIssueTitle'),
    text: t('home.serviceIssueText'),
  },
])

/**
 * @description: 进入登记流程
 * @description 已有草稿时先提示用户确认；没有草稿时才创建唯一办理档案。
 * @return {Promise<void>} 无返回值
 */
async function startRegistration(): Promise<void> {
  const activeDraft = await getActiveDraft()

  if (activeDraft) {
    pendingDraft.value = activeDraft
    resumeDialogOpen.value = true
    return
  }

  await createRegistrationDraft()
}

/**
 * @description: 创建新的登记草稿
 * @description MVP 同一设备只有一份办理档案，因此仅在不存在草稿时调用。
 * @return {Promise<void>} 无返回值
 */
async function createRegistrationDraft(): Promise<void> {
  const draft = createDefaultDraft(uiStore.uiLocale)
  await replaceActiveDraft(draft)
  draftSession.setLastKnownStage(draft.stage)
  await router.push({ name: 'registration' })
}

/**
 * @description: 请求重新登记
 * @description 第一层草稿提示不直接删除数据，先进入二次确认。
 * @return {void} 无返回值
 */
function requestRestartDraft(): void {
  resumeDialogOpen.value = false
  restartConfirmOpen.value = true
}

/**
 * @description: 取消重新登记确认
 * @description 取消删除后回到第一层草稿选择，让用户仍可继续办理。
 * @return {void} 无返回值
 */
function cancelRestartDraft(): void {
  restartConfirmOpen.value = false
  resumeDialogOpen.value = true
}

/**
 * @description: 确认重新登记
 * @description 清除当前草稿后创建一份新的登记档案。
 * @return {Promise<void>} 无返回值
 */
async function confirmRestartDraft(): Promise<void> {
  restartConfirmOpen.value = false
  pendingDraft.value = null
  await clearActiveDraft()
  await createRegistrationDraft()
}

/**
 * @description: 继续当前草稿
 * @description 用户确认后才进入草稿记录的办理阶段，避免首页 CTA 直接跳转造成突兀感。
 * @return {Promise<void>} 无返回值
 */
async function continuePendingDraft(): Promise<void> {
  const draft = pendingDraft.value ?? (await getActiveDraft())

  resumeDialogOpen.value = false

  if (!draft) {
    await createRegistrationDraft()
    return
  }

  draftSession.setLastKnownStage(draft.stage)
  await router.push({ name: draft.stage })
}
</script>

<template>
  <ResponsivePageShell
    :title="t('home.agency')"
    :subtitle="t('home.description')"
    class="pb-[calc(32px_+_var(--safe-bottom))]"
    wide
  >
    <HomeHero
      :assurance="t('home.assurance')"
      :cta-label="t('home.primary')"
      :demo-alt="t('home.demoAlt')"
      :demo-caption="t('home.demoCaption')"
      :demo-src="certificateDemo"
      :flow-label="t('home.flowLabel')"
      :intro="t('home.intro')"
      :kicker="t('home.kicker')"
      :office="t('home.office')"
      :steps="processSteps"
      @start="startRegistration"
    />

    <HomeServiceNotes :section-label="t('home.serviceLabel')" :notes="serviceNotes" />

    <HomeDraftResumeDialog
      v-model="resumeDialogOpen"
      :description="t('home.resumeDraftDescription')"
      :restart-label="t('home.resumeDraftRestart')"
      :continue-label="t('home.resumeDraftContinue')"
      :title="t('home.resumeDraftTitle')"
      @continue="continuePendingDraft"
      @restart="requestRestartDraft"
    />

    <HomeDraftDeleteConfirmDialog
      v-model="restartConfirmOpen"
      :cancel-label="t('home.restartConfirmCancel')"
      :confirm-label="t('home.restartConfirmConfirm')"
      :description="t('home.restartConfirmDescription')"
      :title="t('home.restartConfirmTitle')"
      @cancel="cancelRestartDraft"
      @confirm="confirmRestartDraft"
    />
  </ResponsivePageShell>
</template>
