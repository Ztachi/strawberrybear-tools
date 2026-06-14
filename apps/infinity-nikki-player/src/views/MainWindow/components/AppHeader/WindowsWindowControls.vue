<script setup lang="ts">
/**
 * @description: Windows 自定义窗口控制按钮
 * @description 渲染最小化、最大化/还原和关闭按钮，最大化按钮区域由 Rust 命中测试保留系统 Snap Layout 浮层
 */
import { onMounted, onUnmounted, ref } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X, Copy } from 'lucide-vue-next'
import { Tooltip } from 'antdv-next'
import { useI18n } from 'vue-i18n'

const appWindow = getCurrentWindow()
const isMaximized = ref(false)
let removeResizeListener: UnlistenFn | null = null
let snapOverlayTimer: ReturnType<typeof window.setTimeout> | null = null
let snapOverlayVisible = false
const SNAP_OVERLAY_HOVER_DELAY_MS = 450
/** 窗口控制按钮文案直接读取 i18n 上下文，避免父级为 tooltip 透传翻译函数。 */
const { t } = useI18n()

/**
 * @description: 同步窗口最大化状态
 * @return {Promise<void>} 无返回值
 */
async function syncMaximizedState(): Promise<void> {
  try {
    isMaximized.value = await appWindow.isMaximized()
  } catch (e) {
    console.error('同步窗口最大化状态失败:', e)
  }
}

/**
 * @description: 最小化当前窗口
 * @return {Promise<void>} 无返回值
 */
async function minimizeWindow(): Promise<void> {
  await appWindow.minimize()
}

/**
 * @description: 切换窗口最大化状态
 * @return {Promise<void>} 无返回值
 */
async function toggleMaximizeWindow(): Promise<void> {
  clearSnapOverlayTimer()
  void hideSnapOverlay()
  await appWindow.toggleMaximize()
  await syncMaximizedState()
}

/**
 * @description: 关闭当前窗口
 * @return {Promise<void>} 无返回值
 */
async function closeWindow(): Promise<void> {
  await appWindow.close()
}

/**
 * @description: 清理 Windows Snap Layout 浮层触发定时器
 * @return {void} 无返回值
 */
function clearSnapOverlayTimer(): void {
  if (snapOverlayTimer === null) {
    return
  }

  window.clearTimeout(snapOverlayTimer)
  snapOverlayTimer = null
}

/**
 * @description: 隐藏已经由悬停触发的 Windows Snap Layout 浮层
 * @return {Promise<void>} 无返回值
 */
async function hideSnapOverlay(): Promise<void> {
  clearSnapOverlayTimer()
  if (!snapOverlayVisible) {
    return
  }

  snapOverlayVisible = false
  await invoke('hide_windows_snap_overlay').catch((e) => {
    console.error('隐藏 Windows Snap Layout 浮层失败', e)
  })
}

/**
 * @description: 在最大化按钮悬停时延迟显示系统 Snap Layout 浮层
 * @return {void} 无返回值
 */
function scheduleSnapOverlay(): void {
  if (isMaximized.value || snapOverlayTimer !== null) {
    return
  }

  snapOverlayTimer = window.setTimeout(() => {
    snapOverlayTimer = null
    snapOverlayVisible = true
    void invoke('show_windows_snap_overlay').catch((e) => {
      snapOverlayVisible = false
      console.error('显示 Windows Snap Layout 浮层失败', e)
    })
  }, SNAP_OVERLAY_HOVER_DELAY_MS)
}

onMounted(async () => {
  await syncMaximizedState()
  removeResizeListener = await appWindow.onResized(() => {
    void syncMaximizedState()
  })
})

onUnmounted(() => {
  clearSnapOverlayTimer()
  void hideSnapOverlay()
  removeResizeListener?.()
  removeResizeListener = null
})
</script>

<template>
  <div class="flex h-full shrink-0 items-center">
    <Tooltip :title="t('windowControls.minimize')" placement="bottom">
      <button
        class="window-control-btn"
        type="button"
        :aria-label="t('windowControls.minimize')"
        @click="minimizeWindow"
      >
        <Minus :size="16" :stroke-width="1.8" />
      </button>
    </Tooltip>

    <Tooltip
      :title="isMaximized ? t('windowControls.restore') : t('windowControls.maximize')"
      placement="bottom"
    >
      <button
        class="window-control-btn"
        type="button"
        :aria-label="isMaximized ? t('windowControls.restore') : t('windowControls.maximize')"
        @mouseenter="scheduleSnapOverlay"
        @mouseleave="hideSnapOverlay"
        @click="toggleMaximizeWindow"
      >
        <Copy v-if="isMaximized" :size="14" :stroke-width="1.7" />
        <Square v-else :size="14" :stroke-width="1.7" />
      </button>
    </Tooltip>

    <Tooltip :title="t('windowControls.close')" placement="bottom">
      <button
        class="window-control-btn close"
        type="button"
        :aria-label="t('windowControls.close')"
        @click="closeWindow"
      >
        <X :size="17" :stroke-width="1.8" />
      </button>
    </Tooltip>
  </div>
</template>

<style scoped>
.window-control-btn {
  @apply flex h-[46px] w-[46px] items-center justify-center text-foreground transition-colors;
}

.window-control-btn:hover {
  background: rgba(247, 183, 190, 0.16);
}

.window-control-btn.close:hover {
  background: #d92d20;
  color: var(--color-white);
}
</style>
