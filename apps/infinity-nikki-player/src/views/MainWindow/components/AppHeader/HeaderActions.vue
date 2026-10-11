<script setup lang="ts">
/**
 * @description: 主窗口 Header 公共操作区
 * @description 封装权限提示、悬浮模式入口、语言切换和帮助按钮，供 macOS 与 Windows Header 复用
 */
import { Button, Tooltip } from 'antdv-next'
import { AlertCircle, Monitor, Settings } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

/**
 * @description: Header 公共操作区属性
 * @param {boolean} hasAccessibility - 是否已获得辅助功能权限
 */
defineProps<{
  hasAccessibility: boolean
}>()

const emit = defineEmits<{
  openAccessibilitySettings: []
  enterOverlayMode: []
  openSettings: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-2" data-tauri-drag-region>
    <Tooltip
      v-if="!hasAccessibility"
      placement="bottomRight"
      :title="t('permissions.reauthorizeTip')"
      overlay-class-name="access-tooltip"
    >
      <Button
        danger
        type="primary"
        size="small"
        class="access-btn"
        @click="emit('openAccessibilitySettings')"
      >
        <template #icon>
          <AlertCircle class="header-btn-icon access-icon" />
        </template>
        {{ t('permissions.required') }}
      </Button>
    </Tooltip>

    <Button type="primary" size="small" class="overlay-btn" @click="emit('enterOverlayMode')">
      <template #icon>
        <Monitor class="header-btn-icon" />
      </template>
      {{ t('app.overlayMode') }}
    </Button>

    <Tooltip placement="bottomRight" :title="t('appSettings.title')">
      <Button type="text" :aria-label="t('appSettings.title')" @click="emit('openSettings')">
        <template #icon>
          <Settings class="header-btn-icon" />
        </template>
      </Button>
    </Tooltip>
  </div>
</template>

<style scoped>
.access-btn {
  @apply h-8 gap-1.5 px-3 text-xs;
  animation: pulse 2s ease-in-out infinite;
}

.header-btn-icon {
  width: 17px;
  height: 17px;
  stroke-width: 2.25;
}

.header-btn-icon.access-icon {
  width: 16px;
  height: 16px;
}

.access-tooltip {
  max-width: 280px;
  line-height: 1.5;
  white-space: normal;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.7;
  }
}

.overlay-btn {
  @apply h-8 gap-1.5 px-3 text-xs font-medium;
}
</style>
