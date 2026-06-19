<script setup lang="ts">
/**
 * @description: HomeView - 仪式化首页
 * @description 组合首页私有组件，保持页面层只负责流程入口和文案编排。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'
import certificateDemo from '@/assets/images/demo.png'
import { getActiveDraft, replaceActiveDraft } from '@/db/repositories/draftRepository'
import { createDefaultDraft } from '@/domain/draft/factory'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useUiStore } from '@/stores/ui'
import HomeHero from './components/HomeHero/HomeHero.vue'
import HomeServiceNotes from './components/HomeServiceNotes/HomeServiceNotes.vue'

const { t } = useI18n()
const router = useRouter()
const draftSession = useDraftSessionStore()
const uiStore = useUiStore()

/** 首页流程标签，结构化传给主视觉组件渲染。 */
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
 * @description 已有草稿时继续原阶段；没有草稿时才创建唯一办理档案。
 * @return {Promise<void>} 无返回值
 */
async function startRegistration(): Promise<void> {
  const activeDraft = await getActiveDraft()

  if (activeDraft) {
    draftSession.setLastKnownStage(activeDraft.stage)
    await router.push({ name: activeDraft.stage })
    return
  }

  const draft = createDefaultDraft(uiStore.uiLocale)
  await replaceActiveDraft(draft)
  draftSession.setLastKnownStage(draft.stage)
  await router.push({ name: 'registration' })
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
  </ResponsivePageShell>
</template>
