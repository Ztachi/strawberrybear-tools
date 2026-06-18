<script setup lang="ts">
/**
 * @description: BackgroundLibraryView - 自定义背景管理页骨架
 * @description 后续接入背景素材上传、预览、重命名、选用和删除流程。
 */
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AssetLibraryEmptyState from '@/components/AssetLibraryEmptyState.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'
import { getActiveDraft } from '@/db/repositories/draftRepository'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/**
 * @description: 返回当前办理流程
 * @description 优先使用从选择层带来的 returnTo，没有时回到当前草稿阶段。
 * @return {Promise<void>} 无返回值
 */
async function backToDraft(): Promise<void> {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''

  if (returnTo === 'registration' || returnTo === 'proofing') {
    await router.push({ name: returnTo })
    return
  }

  const activeDraft = await getActiveDraft()
  await router.push({ name: activeDraft?.stage ?? 'home' })
}

/**
 * @description: 返回办事首页
 * @return {void} 无返回值
 */
function backToHome(): void {
  void router.push({ name: 'home' })
}
</script>

<template>
  <ResponsivePageShell :title="t('assets.backgroundTitle')" :subtitle="t('assets.placeholder')">
    <AssetLibraryEmptyState kind="background" @back-draft="backToDraft" @back-home="backToHome" />
  </ResponsivePageShell>
</template>
