<script setup lang="ts">
/**
 * @description: 可滚动容器组件
 * @description 接管内部滚动，提供返回顶部和刷新页面功能
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FloatingActionGroup from './FloatingActionGroup.vue'

const { t } = useI18n()

/** 滚动容器 DOM 引用 */
const containerRef = ref<HTMLElement | null>(null)

/** 是否显示返回顶部按钮 @return {boolean} */
const showBackToTop = ref(false)

/** 滚动阈值（超过此值显示返回顶部按钮） */
const SCROLL_THRESHOLD = 200

/**
 * @description: 滚动事件处理
 * 根据滚动位置显示/隐藏返回顶部按钮
 */
function handleScroll() {
  if (containerRef.value) {
    showBackToTop.value = containerRef.value.scrollTop > SCROLL_THRESHOLD
  }
}

/**
 * @description: 平滑滚动到顶部
 */
function scrollToTop() {
  containerRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

/**
 * @description: 刷新整个页面
 */
function refreshPage() {
  window.location.reload()
}

/** 组件挂载时绑定滚动事件 */
onMounted(() => {
  containerRef.value?.addEventListener('scroll', handleScroll, { passive: true })
})

/** 组件卸载时解绑滚动事件 */
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

    <FloatingActionGroup
      position="fixed"
      :show-back-to-top="showBackToTop"
      :back-to-top-title="t('actions.backToTop')"
      :refresh-title="t('actions.refresh')"
      @back-to-top="scrollToTop"
      @refresh="refreshPage"
    />
  </div>
</template>

<style scoped>
.scrollable-container {
  @apply relative w-full h-full;
}

.scroll-content {
  @apply w-full h-full overflow-y-auto overflow-x-hidden;
  padding: 0 20px 0 20px;
  box-sizing: border-box;
}
</style>
