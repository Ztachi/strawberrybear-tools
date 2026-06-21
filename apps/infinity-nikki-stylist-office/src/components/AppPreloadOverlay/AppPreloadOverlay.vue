<script setup lang="ts">
/**
 * @description: AppPreloadOverlay - 应用入口资源预热遮罩
 * @description 展示关键模板和 UI 素材的缓存进度，完成后由根组件移除。
 */
defineProps<{
  /** 是否展示遮罩 */
  visible: boolean
  /** 进度百分比 */
  percent: number
  /** 当前加载文案 */
  message: string
}>()
</script>

<template>
  <v-fade-transition>
    <div v-if="visible" class="app-preload-overlay" role="status" aria-live="polite">
      <div class="app-preload-overlay__panel">
        <v-progress-circular :model-value="percent" color="primary" size="86" width="8">
          <span>{{ percent }}%</span>
        </v-progress-circular>
        <div class="app-preload-overlay__copy">
          <strong>{{ message }}</strong>
          <small>{{ $t('preload.keepReady') }}</small>
        </div>
      </div>
    </div>
  </v-fade-transition>
</template>

<style scoped>
.app-preload-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(255, 246, 250, 0.98), rgba(242, 255, 251, 0.96)),
    repeating-linear-gradient(
      135deg,
      rgba(239, 95, 143, 0.06) 0,
      rgba(239, 95, 143, 0.06) 1px,
      transparent 1px,
      transparent 18px
    );
}

.app-preload-overlay__panel {
  display: grid;
  width: min(100%, 320px);
  justify-items: center;
  gap: 16px;
  padding: 28px 24px;
  border: 1px solid rgba(239, 95, 143, 0.24);
  border-radius: 8px;
  background: #fff9fc;
  box-shadow: 0 18px 44px rgba(122, 78, 98, 0.16);
  text-align: center;
}

.app-preload-overlay__panel span {
  color: var(--color-primary-active);
  font-size: 16px;
  font-weight: 840;
}

.app-preload-overlay__copy {
  display: grid;
  gap: 6px;
}

.app-preload-overlay__copy strong {
  color: var(--color-foreground);
  font-size: 18px;
  font-weight: 840;
}

.app-preload-overlay__copy small {
  color: var(--color-muted-dark);
  font-size: 13px;
  font-weight: 680;
}
</style>
