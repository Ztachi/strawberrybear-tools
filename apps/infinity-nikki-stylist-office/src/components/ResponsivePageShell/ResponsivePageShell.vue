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
  hideHeader?: boolean
  wide?: boolean
}>()
</script>

<template>
  <section :class="['page-shell', { 'page-shell--wide': wide }]">
    <header v-if="!hideHeader" class="page-shell__header">
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
  padding: 30px 18px calc(32px + var(--safe-bottom));
}

.page-shell--wide {
  width: min(100%, 1360px);
}

.page-shell__header {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 4px 0 4px 18px;
  margin-bottom: 20px;
}

.page-shell__header::before {
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 0;
  width: 5px;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    var(--color-primary),
    var(--color-lemon),
    var(--color-mint),
    var(--color-lavender)
  );
  content: '';
}

.page-shell__title {
  margin: 0;
  color: var(--color-primary-active);
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 800;
  letter-spacing: 0;
}

.page-shell__subtitle {
  max-width: 760px;
  margin: 0;
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
