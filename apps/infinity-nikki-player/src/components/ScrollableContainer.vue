<script setup lang="ts">
/**
 * @description: 可滚动容器组件
 * - 接管内部滚动
 * - 提供返回顶部功能
 * - 刷新按钮固定在右下角
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { RotateCw, ArrowUp } from 'lucide-vue-next'

/** 滚动容器引用 */
const containerRef = ref<HTMLElement | null>(null)

/** 是否显示返回顶部按钮 */
const showBackToTop = ref(false)

/** 滚动阈值 */
const SCROLL_THRESHOLD = 200

/** 滚动事件处理 */
function handleScroll() {
  if (containerRef.value) {
    showBackToTop.value = containerRef.value.scrollTop > SCROLL_THRESHOLD
  }
}

/** 返回顶部 */
function scrollToTop() {
  containerRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 刷新页面 */
function refreshPage() {
  window.location.reload()
}

/** 绑定滚动事件 */
onMounted(() => {
  containerRef.value?.addEventListener('scroll', handleScroll, { passive: true })
})

/** 解绑滚动事件 */
onUnmounted(() => {
  containerRef.value?.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="scrollable-container">
    <!-- 内容插槽 -->
    <div ref="containerRef" class="scroll-content">
      <slot />
    </div>

    <!-- 右下角浮动按钮组 -->
    <div class="fab-group">
      <!-- 返回顶部 -->
      <button
        v-show="showBackToTop"
        class="fab-btn back-to-top"
        title="返回顶部"
        @click="scrollToTop"
      >
        <ArrowUp :size="18" />
      </button>

      <!-- 刷新页面 -->
      <button class="fab-btn refresh" title="刷新页面" @click="refreshPage">
        <RotateCw :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.scrollable-container {
  @apply relative w-full h-full;
}

.scroll-content {
  @apply w-full h-full overflow-y-auto overflow-x-hidden;
  padding: 1.5rem 1.5rem 5rem 1.5rem;
  box-sizing: border-box;
}

/* 浮动按钮组 - 固定在右下角 */
.fab-group {
  @apply fixed flex flex-col gap-2;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 50;
}

.fab-btn {
  @apply w-10 h-10 rounded-xl flex items-center justify-center;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-20);
  color: var(--color-primary);
  transition: all 0.2s;
}

.fab-btn:hover {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: white;
  border-color: transparent;
  box-shadow: var(--shadow-pink-sm);
}

.fab-btn.refresh:hover {
  transform: rotate(180deg);
}

/* 返回顶部按钮动画 */
.fab-btn.back-to-top {
  animation: fadeInUp 0.2s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
