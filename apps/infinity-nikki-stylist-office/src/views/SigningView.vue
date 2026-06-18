<script setup lang="ts">
/**
 * @description: SigningView - 签发仪式页骨架
 * @description 后续接入全屏签发动画和事务式正本生成。
 */
import { useI18n } from 'vue-i18n'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'

const { t } = useI18n()
</script>

<template>
  <ResponsivePageShell :title="t('signing.title')" :subtitle="t('signing.subtitle')">
    <v-card variant="flat" class="placeholder-card">
      <v-card-text>{{ t('common.status.notReady') }}</v-card-text>
    </v-card>
  </ResponsivePageShell>
</template>

<style scoped>
.placeholder-card {
  border: 1px solid rgba(239, 95, 143, 0.24);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 234, 242, 0.72));
  box-shadow: var(--shadow-card);
}
</style>
