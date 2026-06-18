<script setup lang="ts">
/**
 * @description: AvatarLibraryView - 自定义头像管理页骨架
 * @description 后续接入图片上传、查重、重命名、选用和删除流程。
 */
import { useI18n } from 'vue-i18n'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'

const { t } = useI18n()
</script>

<template>
  <ResponsivePageShell :title="t('assets.avatarTitle')" :subtitle="t('assets.placeholder')">
    <v-card variant="flat" class="asset-card">
      <v-card-text>{{ t('common.status.notReady') }}</v-card-text>
    </v-card>
  </ResponsivePageShell>
</template>

<style scoped>
.asset-card {
  border: 1px solid var(--border-primary-20);
  background: var(--bg-white-90);
}
</style>
