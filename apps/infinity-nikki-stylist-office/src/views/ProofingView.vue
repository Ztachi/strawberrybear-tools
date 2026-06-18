<script setup lang="ts">
/**
 * @description: ProofingView - 签发前校样页骨架
 * @description 桌面端预留侧边编辑面板，移动端预留底部工具栏。
 */
import { useI18n } from 'vue-i18n'
import BottomActionBar from '@/components/BottomActionBar.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'

const { t } = useI18n()
</script>

<template>
  <ResponsivePageShell :title="t('proofing.title')" :subtitle="t('proofing.subtitle')">
    <div class="office-page-grid">
      <section class="certificate-aspect-box proofing-preview">
        <span>{{ t('registration.previewTitle') }}</span>
      </section>

      <aside class="proofing-panel">
        <v-card variant="flat" class="proofing-card">
          <v-card-title>{{ t('proofing.desktopPanel') }}</v-card-title>
          <v-card-text>{{ t('proofing.mobileToolbar') }}</v-card-text>
        </v-card>
      </aside>
    </div>

    <BottomActionBar :primary-label="t('proofing.apply')" @primary="() => undefined" />
  </ResponsivePageShell>
</template>

<style scoped>
.proofing-preview {
  display: grid;
  min-height: 260px;
  place-items: center;
  color: var(--color-muted-dark);
}

.proofing-card {
  border: 1px solid var(--border-primary-20);
  background: var(--bg-white-90);
}
</style>
