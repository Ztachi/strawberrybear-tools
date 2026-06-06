<script setup lang="ts">
/**
 * @description: 主窗口平台 Header 分发组件
 * @description 根据运行平台选择 macOS 或 Windows Header，公共动作由父组件统一处理
 */
import { computed } from 'vue'
import MacAppHeader from './MacAppHeader.vue'
import WindowsAppHeader from './WindowsAppHeader.vue'

/**
 * @description: 平台 Header 属性
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

/** 当前平台是否为 Windows */
const isWindows = computed(() => /Windows/i.test(navigator.userAgent))
</script>

<template>
  <WindowsAppHeader
    v-if="isWindows"
    v-bind="$props"
    @open-accessibility-settings="emit('openAccessibilitySettings')"
    @enter-overlay-mode="emit('enterOverlayMode')"
    @switch-locale="emit('switchLocale', $event)"
    @open-help="emit('openHelp')"
  />
  <MacAppHeader
    v-else
    v-bind="$props"
    @open-accessibility-settings="emit('openAccessibilitySettings')"
    @enter-overlay-mode="emit('enterOverlayMode')"
    @switch-locale="emit('switchLocale', $event)"
    @open-help="emit('openHelp')"
  />
</template>
