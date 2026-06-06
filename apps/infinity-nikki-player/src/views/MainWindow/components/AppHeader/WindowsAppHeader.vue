<script setup lang="ts">
/**
 * @description: Windows 主窗口 Header
 * @description 使用自绘标题栏和右侧窗口控制按钮，最大化按钮保留系统 Snap Layout 行为
 */
import HeaderActions from './HeaderActions.vue'
import WindowsWindowControls from './WindowsWindowControls.vue'

/**
 * @description: Windows Header 属性
 * @param {string} title - 应用标题
 * @param {boolean} hasAccessibility - 是否已获得辅助功能权限
 */
defineProps<{
  title: string
  hasAccessibility: boolean
}>()

const emit = defineEmits<{
  openAccessibilitySettings: []
  enterOverlayMode: []
  switchLocale: [locale: string]
  openHelp: []
}>()
</script>

<template>
  <header
    class="relative z-30 h-[var(--global-menu-height)] shrink-0 select-none"
    data-tauri-drag-region
  >
    <div class="flex h-full items-center justify-between pl-4" data-tauri-drag-region>
      <div class="flex min-w-0 items-center gap-2.5 pr-3" data-tauri-drag-region>
        <img
          src="@/assets/images/logo.png"
          alt="logo"
          class="h-7 w-7 rounded-lg"
          data-tauri-drag-region
        />
        <h1
          class="truncate text-sm font-semibold text-foreground"
          :title="title"
          data-tauri-drag-region
        >
          {{ title }}
        </h1>
      </div>

      <div class="flex h-full shrink-0 items-center gap-3" data-tauri-drag-region>
        <HeaderActions
          :has-accessibility="hasAccessibility"
          @open-accessibility-settings="emit('openAccessibilitySettings')"
          @enter-overlay-mode="emit('enterOverlayMode')"
          @switch-locale="emit('switchLocale', $event)"
          @open-help="emit('openHelp')"
        />
        <WindowsWindowControls />
      </div>
    </div>
  </header>
</template>
