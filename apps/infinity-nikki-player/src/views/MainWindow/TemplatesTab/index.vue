<script setup lang="ts">
/**
 * @description: 模板 Tab 页
 * @description 显示模板管理界面（功能开发中，目前显示"即将上线"）
 */
import { useI18n } from 'vue-i18n'
// TODO: 待实现模板管理功能
// import TemplateEditor from './components/TemplateEditor.vue'

const { t } = useI18n()
</script>

<template>
  <!-- 即将上线占位符 -->
  <div class="coming-soon">
    <div class="coming-soon-content">
      <h2>{{ t('tabs.comingSoon') }}</h2>
      <p>{{ t('tabs.comingSoonTip') }}</p>
    </div>
  </div>
</template>

<style scoped>
.coming-soon {
  @apply flex items-center justify-center h-full;
}

.coming-soon-content {
  @apply text-center;
}

.coming-soon-content h2 {
  @apply text-2xl font-semibold mb-2;
  color: var(--color-primary);
}

.coming-soon-content p {
  @apply text-sm;
  color: var(--color-muted);
}
</style>
