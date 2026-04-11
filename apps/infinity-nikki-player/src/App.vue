<script setup lang="ts">
/**
 * @description: 应用根组件
 */
import { inject, onMounted, getCurrentInstance, ref } from 'vue'
import MainWindow from './views/MainWindow/index.vue'
import OverlayWindow from './views/OverlayWindow.vue'
import { Toaster } from '@/components/ui'
import { toast } from 'vue-sonner'

const windowLabel = inject<string>('windowLabel', 'main')

/** 是否显示加载中 */
const isLoading = ref(true)

/** 显示错误 toast */
function showError(title: string, message: string) {
  toast.error(title, { description: message, richColors: true })
}

/** 设置 Vue 全局错误处理器 */
const app = getCurrentInstance()?.appContext.app
if (app) {
  app.config.errorHandler = (err, _instance, info) => {
    console.error('Vue Error:', err, info)
    const message = err instanceof Error ? err.message : String(err)
    showError('应用错误', message)
  }
}

/** 加载完成 */
onMounted(() => {
  isLoading.value = false

  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault()
    const message = event.reason?.message || event.reason?.toString() || String(event.reason)
    showError('未处理的异步错误', message)
  })

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
  <!-- Loading 过渡 -->
  <Transition name="loading">
    <div v-if="isLoading" class="loading-screen">
      <div class="loading-content">
        <div class="loading-spinner" />
        <span class="loading-text">loading</span>
      </div>
    </div>
  </Transition>

  <MainWindow v-if="windowLabel === 'main'" />
  <OverlayWindow v-else-if="windowLabel === 'overlay'" />
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

/* 过渡动画 */
.loading-enter-active,
.loading-leave-active {
  transition: opacity 0.3s ease;
}

.loading-enter-from,
.loading-leave-to {
  opacity: 0;
}
</style>
