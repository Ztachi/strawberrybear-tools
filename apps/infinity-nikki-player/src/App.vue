<script setup lang="ts">
import { inject, onMounted, getCurrentInstance } from 'vue'
import MainWindow from './views/MainWindow/index.vue'
import OverlayWindow from './views/OverlayWindow.vue'
import { Toaster } from '@/components/ui'
import { toast } from 'vue-sonner'

const windowLabel = inject<string>('windowLabel', 'main')

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

/** 全局捕获未处理的 Promise 错误 */
onMounted(() => {
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault()
    const message = event.reason?.message || event.reason?.toString() || String(event.reason)
    showError('未处理的异步错误', message)
  })

  // 捕获全局 JS 错误（包括第三方库）
  window.onerror = (message) => {
    // 过滤一些常见的非关键错误
    if (String(message).includes('ResizeObserver') || String(message).includes('Non-Error')) {
      return false
    }
    showError('运行时错误', String(message))
    return false
  }
})
</script>

<template>
  <MainWindow v-if="windowLabel === 'main'" />
  <OverlayWindow v-else-if="windowLabel === 'overlay'" />
  <Toaster />
</template>
