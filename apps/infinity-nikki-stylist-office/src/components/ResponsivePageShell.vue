<script setup lang="ts">
/**
 * @description: ResponsivePageShell - 响应式页面外壳
 * @description 统一页面边距、标题密度和桌面/移动容器宽度，避免每个页面重复布局规则。
 */

/**
 * @description: 页面外壳属性
 * @param {string} title - 页面标题
 * @param {string} [subtitle] - 页面副标题
 */
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <section class="page-shell">
    <header class="page-shell__header">
      <h1 class="page-shell__title">
        {{ title }}
      </h1>
      <p v-if="subtitle" class="page-shell__subtitle">
        {{ subtitle }}
      </p>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.page-shell {
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 28px 18px calc(32px + var(--safe-bottom));
}

.page-shell__header {
  margin-bottom: 18px;
}

.page-shell__title {
  margin: 0;
  color: var(--color-foreground);
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 760;
  letter-spacing: 0;
}

.page-shell__subtitle {
  max-width: 760px;
  margin: 8px 0 0;
  color: var(--color-muted-dark);
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 599px) {
  .page-shell {
    padding-inline: 14px;
    padding-top: 18px;
  }
}
</style>
