<script setup lang="ts">
/**
 * @description: 应用根组件 - 负责初始化全局状态、错误处理和加载状态管理
 */
import { onMounted, getCurrentInstance, ref } from 'vue'
import MainWindow from './views/MainWindow/index.vue'
import AboutDialog from '@/components/AboutDialog/index.vue'
import { Toaster } from '@/components/ui'
import { toast } from 'vue-sonner'
import { usePlayerStore } from './stores/player'

/** 播放器 Store 实例 */
const playerStore = usePlayerStore()

/** 是否显示加载中状态 */
const isLoading = ref(true)

/**
 * @description: 显示错误 Toast 提示
 * @param {string} title - 错误标题
 * @param {string} message - 错误消息
 */
function showError(title: string, message: string) {
  toast.error(title, { description: message, richColors: true })
}

/**
 * @description: 设置 Vue 全局错误处理器 - 捕获所有未处理的 Vue 组件错误
 */
const app = getCurrentInstance()?.appContext.app
if (app) {
  app.config.errorHandler = (err, _instance, info) => {
    console.error('Vue Error:', err, info)
    const message = err instanceof Error ? err.message : String(err)
    showError('应用错误', message)
  }
}

/** 组件挂载完成回调 - 初始化钢琴引擎、设置全局错误处理、监听未处理的 Promise 拒绝 */
onMounted(async () => {
  // 初始化钢琴引擎（预热音频上下文）
  await playerStore.initPianoEngine()

  // 加载完成，隐藏加载屏幕
  isLoading.value = false

  // 移除背景图片，设置透明背景
  document.body.style.background = 'transparent'

  // 监听未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault()
    const message = event.reason?.message || event.reason?.toString() || String(event.reason)
    showError('未处理的异步错误', message)
  })

  // 监听全局 JavaScript 错误
  window.onerror = (message) => {
    if (String(message).includes('ResizeObserver') || String(message).includes('Non-Error')) {
      return false
    }
    showError('运行时错误', String(message))
    return false
  }
})
</script>

<template>
  <!-- Loading 过渡动画 -->
  <Transition name="loading">
    <div v-if="isLoading" class="loading-screen">
      <div class="loading-content">
        <div class="loading-spinner" />
        <span class="loading-text">loading</span>
      </div>
    </div>
  </Transition>

  <!-- 主窗口 -->
  <MainWindow />

  <!-- 关于对话框 -->
  <AboutDialog />

  <!-- Toast 通知组件 -->
  <Toaster />
</template>

<style scoped>
.loading-screen {
  @apply fixed inset-0 flex items-center justify-center z-[100];
  background: var(--bg-primary);
}

.loading-content {
  @apply flex flex-col items-center gap-4;
}

.loading-spinner {
  @apply w-10 h-10 rounded-full border-2;
  border-color: var(--border-primary-20);
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}

.loading-text {
  @apply text-sm font-medium;
  color: var(--color-primary);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-enter-active,
.loading-leave-active {
  transition: opacity 0.3s ease;
}

.loading-enter-from,
.loading-leave-to {
  opacity: 0;
}
</style>
