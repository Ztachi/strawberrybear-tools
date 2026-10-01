<script setup lang="ts">
/**
 * @description: 主窗口 Header
 * @description 平台布局由共用沉浸式标题栏处理，主窗口只组合应用导航和操作
 */
import { Tooltip } from 'antdv-next'
import HeaderActions from './HeaderActions.vue'
import WindowTitleBar from '@/components/WindowTitleBar/WindowTitleBar.vue'
import AppUpdateButton from '@/components/AppUpdateButton.vue'
import HeaderNavigation from '@/components/HeaderNavigation/index.vue'

/**
 * @description: 主窗口 Header 属性
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
  <WindowTitleBar>
    <template #title>
      <img
        src="@/assets/images/logo.png"
        alt="logo"
        class="h-7 w-7 rounded-lg"
        data-tauri-drag-region
      >
      <Tooltip :title="title">
        <h1
          class="truncate text-sm font-semibold text-foreground"
          data-tauri-drag-region
        >
          {{ title }}
        </h1>
      </Tooltip>
      <AppUpdateButton />
      <HeaderNavigation />
    </template>
    <template #actions>
      <HeaderActions
        :has-accessibility="hasAccessibility"
        @open-accessibility-settings="emit('openAccessibilitySettings')"
        @enter-overlay-mode="emit('enterOverlayMode')"
        @switch-locale="emit('switchLocale', $event)"
        @open-help="emit('openHelp')"
      />
    </template>
  </WindowTitleBar>
</template>
