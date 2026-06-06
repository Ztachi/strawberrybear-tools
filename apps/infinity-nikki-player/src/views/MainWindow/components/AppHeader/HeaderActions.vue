<script setup lang="ts">
/**
 * @description: 主窗口 Header 公共操作区
 * @description 封装权限提示、悬浮模式入口、语言切换和帮助按钮，供 macOS 与 Windows Header 复用
 */
import { computed, h } from 'vue'
import type { VNode } from 'vue'
import { Button, Dropdown, Tooltip } from 'antdv-next'
import { QuestionCircleFilled } from '@antdv-next/icons'
import { AlertCircle, ChevronDown, Globe2, Languages, Monitor } from 'lucide-vue-next'
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

/** 当前语言选项，用于 Header 下拉触发器展示。 */
const currentLocaleOption = computed(
  () => SUPPORTED_LOCALES.find((loc) => loc.value === locale.value) ?? SUPPORTED_LOCALES[0]
)

/** Header 语言下拉菜单项，数据来自统一语言注册表，避免在组件内硬编码语言列表。 */
const localeMenuItems = computed(() =>
  SUPPORTED_LOCALES.map((loc) => ({
    key: loc.value,
    label: loc.label,
    icon: renderLocaleMenuIcon(loc.value),
  }))
)

/**
 * @description: 渲染语言菜单项图标
 * @param {string} localeValue - 语言标识
 * @return {VNode} 菜单项图标
 */
function renderLocaleMenuIcon(localeValue: string): VNode {
  // 中文用翻译语义图标，其他语言默认用全球化图标，避免新增语言时修改模板结构。
  const Icon = localeValue === 'zh-CN' ? Languages : Globe2
  return h(Icon, {
    class: 'h-[18px] w-[18px] text-muted-foreground',
    strokeWidth: 2.2,
  })
}

/**
 * @description: 处理 Header 语言菜单点击
 * @param {{ key: string | number }} info - antdv-next Dropdown 菜单点击信息
 * @return {void}
 */
function handleLocaleMenuClick(info: { key: string | number }): void {
  const nextLocale = String(info.key)
  // 当前语言再次点击不触发持久化写入，减少无意义状态更新。
  if (nextLocale === locale.value) return
  emit('switchLocale', nextLocale)
}
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

    <Dropdown
      placement="bottomRight"
      :trigger="['click']"
      :menu="{
        items: localeMenuItems,
        selectedKeys: [locale],
        onClick: handleLocaleMenuClick,
      }"
    >
      <Button
        type="text"
        size="small"
        class="flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium"
        :aria-label="currentLocaleOption.label"
        @click.stop
      >
        <Languages class="h-[18px] w-[18px] text-muted-foreground" :stroke-width="2.2" />
        <span class="max-w-20 truncate">
          {{ currentLocaleOption.label }}
        </span>
        <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" :stroke-width="2.2" />
      </Button>
    </Dropdown>

    <Tooltip placement="bottomRight" :title="t('about.title')">
      <button class="help-btn" :aria-label="t('about.title')" @click="emit('openHelp')">
        <QuestionCircleFilled class="help-icon" />
      </button>
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
