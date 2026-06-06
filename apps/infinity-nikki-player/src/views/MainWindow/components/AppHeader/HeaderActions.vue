<script setup lang="ts">
/**
 * @description: 主窗口 Header 公共操作区
 * @description 封装权限提示、悬浮模式入口、语言切换和帮助按钮，供 macOS 与 Windows Header 复用
 */
import { Button, Tooltip } from 'antdv-next'
import { QuestionCircleFilled } from '@antdv-next/icons'
import { AlertCircle, Monitor } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES } from '@/i18n'

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
  switchLocale: [locale: string]
  openHelp: []
}>()

/** Header 内部文案和当前语言直接来自 i18n 上下文，避免把翻译函数沿组件链透传。 */
const { t, locale } = useI18n()
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

    <div class="locale-switch">
      <button
        v-for="loc in SUPPORTED_LOCALES"
        :key="loc.value"
        class="locale-btn"
        :class="{ active: locale === loc.value }"
        @click="emit('switchLocale', loc.value)"
      >
        {{ loc.label }}
      </button>
    </div>

    <Tooltip placement="bottomRight" :title="t('about.title')">
      <button class="help-btn" :aria-label="t('about.title')" @click="emit('openHelp')">
        <QuestionCircleFilled class="help-icon" />
      </button>
    </Tooltip>
  </div>
</template>

<style scoped>
.locale-switch {
  @apply flex h-8 items-center gap-0.5 rounded-lg p-0.5;
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
}

.locale-btn {
  @apply h-7 rounded-md px-2 text-xs font-medium transition-all;
  color: var(--color-muted);
}

.locale-btn:hover {
  color: var(--color-foreground);
}

.locale-btn.active {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-white);
}

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
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-white);
}

.help-btn {
  @apply flex h-8 w-8 items-center justify-center rounded-full transition-colors;
  color: var(--color-primary);
}

.help-btn:hover {
  background: var(--bg-primary-10);
}

.help-icon {
  font-size: 25px;
}
</style>
