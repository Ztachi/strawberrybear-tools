<script setup lang="ts">
/**
 * @description: CertificateStep - 证书正本步骤骨架
 * @description 预留 16:9 正本与 A4 彩印版的页面结构。
 */
import { useI18n } from 'vue-i18n'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'

const { t } = useI18n()
</script>

<template>
  <ResponsivePageShell
    :title="t('certificate.title')"
    :subtitle="t('certificate.subtitle')"
    hide-header
  >
    <div class="certificate-aspect-box certificate-placeholder">
      <span>{{ t('common.status.notReady') }}</span>
    </div>
  </ResponsivePageShell>
</template>

<style scoped>
.certificate-placeholder {
  display: grid;
  place-items: center;
  color: var(--color-muted-dark);
}
</style>
