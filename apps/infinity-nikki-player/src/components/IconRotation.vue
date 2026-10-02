<script setup lang="ts">
/** 固定图标画布；旋转作用在 HTML 方形上，SVG 始终铺满同一画布。 */
withDefaults(defineProps<{ size: number; spinning?: boolean }>(), { spinning: false })
</script>

<template>
  <span
    class="icon-rotation"
    :class="{ 'icon-rotation-spinning': spinning }"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <slot />
  </span>
</template>

<style scoped>
.icon-rotation {
  position: relative;
  display: inline-block;
  flex: none;
  line-height: 0;
  vertical-align: middle;
  transform-origin: 50% 50%;
}
/* 不让 SVG 的 intrinsic size、基线或 flex 收缩改变图案相对旋转中心的位置。 */
.icon-rotation :deep(svg) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  transform: none;
}
.icon-rotation-spinning {
  animation: icon-rotation-spin 0.8s linear infinite;
}
@keyframes icon-rotation-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
