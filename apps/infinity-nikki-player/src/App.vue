<script setup lang="ts">
/**
 * @description: 应用根组件 - 负责初始化全局状态、错误处理和加载状态管理
 */
import { computed, onMounted, getCurrentInstance, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { App as AntApp, ConfigProvider } from 'antdv-next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import MainWindow from './views/MainWindow/index.vue'
import AboutDialog from '@/components/AboutDialog/index.vue'
import { feedback as toast } from '@/lib/feedback'
import { usePlayerStore } from './stores/player'
import { useAppUpdater } from '@/composables/useAppUpdater'
import { getAntdvLocale } from '@/i18n'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
import backgroundImageUrl from '@/assets/images/bg.jpeg'

/** 播放器 Store 实例 */
const playerStore = usePlayerStore()
const appUpdater = useAppUpdater()
/** 当前应用语言来自 vue-i18n，根 ConfigProvider 需要跟随它同步框架内置文案。 */
const { locale } = useI18n()

/** 是否显示加载中状态 */
const isLoading = ref(true)
/** 启动加载进度，仅表示本地首屏资源和初始化阶段，不代表下载进度。 */
const loadingProgress = ref(8)
/** 当前启动阶段文案。 */
const loadingText = ref('loading')
/** antdv-next 组件内置文案语言包，例如 Select 空态、Pagination 和 Modal 按钮文案。 */
const currentAntdvLocale = computed(() => getAntdvLocale(locale.value))

/**
 * @description: 预加载首屏背景图
 * @param {string} src - 背景图资源地址
 * @return {Promise<void>} 背景图完成解码或加载后的 Promise
 */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = src
    void image.decode?.().then(resolve).catch(() => undefined)
  })
}

/**
 * @description: 等待浏览器完成首屏绘制
 * @return {Promise<void>} 下一帧绘制后的 Promise
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/**
 * @description: 首屏 loading 准备完成后显示隐藏启动的 Tauri 窗口
 */
async function showWindowWhenLoadingReady() {
  loadingText.value = 'loading background'
  loadingProgress.value = 32
  await preloadImage(backgroundImageUrl)
  loadingProgress.value = 58
  await nextTick()
  await waitForPaint()
  await getCurrentWindow().show()
}

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
  await showWindowWhenLoadingReady()

  // 初始化钢琴引擎（预热音频上下文）
  loadingText.value = 'loading audio'
  loadingProgress.value = 78
  await playerStore.initPianoEngine()

  // 加载完成，隐藏加载屏幕
  loadingProgress.value = 100
  loadingText.value = 'ready'
  isLoading.value = false

  // 移除背景图片，设置透明背景
  document.body.style.background = 'transparent'

  // 启动后静默检查更新，无更新或检查失败时不打扰用户
  appUpdater.checkUpdate({ silent: true })

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
  <ConfigProvider v-bind="infinityNikkiConfigProviderProps" :locale="currentAntdvLocale">
    <AntApp>
      <!-- Loading 过渡动画 -->
      <Transition name="loading">
        <div v-if="isLoading" class="loading-screen">
          <div class="loading-content">
            <div class="loading-spinner" />
            <span class="loading-text">{{ loadingText }}</span>
            <div class="loading-progress" aria-hidden="true">
              <div class="loading-progress-bar" :style="{ width: `${loadingProgress}%` }" />
            </div>
          </div>
        </div>
      </Transition>

      <!-- 主窗口 -->
      <MainWindow />

      <!-- 关于对话框 -->
      <AboutDialog />
    </AntApp>
  </ConfigProvider>
</template>

<style scoped>
.loading-screen {
  @apply fixed inset-0 flex items-center justify-center z-[100];
  background:
    linear-gradient(rgba(255, 241, 244, 0.72), rgba(255, 255, 255, 0.52)),
    url('@/assets/images/bg.jpeg') no-repeat center center/cover;
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

.loading-progress {
  @apply h-1 w-44 overflow-hidden rounded-full;
  background: var(--bg-white-50);
}

.loading-progress-bar {
  @apply h-full rounded-full transition-all duration-300;
  background: var(--color-primary);
  box-shadow: var(--shadow-pink-sm);
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
