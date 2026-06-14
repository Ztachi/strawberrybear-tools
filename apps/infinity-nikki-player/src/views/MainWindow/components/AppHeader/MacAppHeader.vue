<script setup lang="ts">
/**
 * @description: macOS 主窗口 Header
 * @description 保留左侧系统交通灯预留区，并复用公共 Header 操作区
 */
import HeaderActions from './HeaderActions.vue'
import AppUpdateButton from '@/components/AppUpdateButton.vue'
import HeaderNavigation from '@/components/HeaderNavigation/index.vue'

/**
 * @description: macOS Header 属性
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
    <div class="flex h-full items-center justify-between px-4 pl-[90px]" data-tauri-drag-region>
      <div class="flex min-w-0 items-center gap-2.5" data-tauri-drag-region>
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
        <!-- 更新入口跟随标题区展示，避免挤占右侧窗口操作按钮区域。 -->
        <AppUpdateButton />
        <!-- 前进/后退/刷新按钮放在标题右侧，与 Windows Header 保持一致的导航交互。 -->
        <HeaderNavigation />
      </div>

      <HeaderActions
        :has-accessibility="hasAccessibility"
        @open-accessibility-settings="emit('openAccessibilitySettings')"
        @enter-overlay-mode="emit('enterOverlayMode')"
        @switch-locale="emit('switchLocale', $event)"
        @open-help="emit('openHelp')"
      />
    </div>
  </header>
</template>
