<script setup lang="ts">
/**
 * @description: 播放列表模式选择控件
 * @description 使用 Popover 承载四种模式选项，供悬浮窗和主窗口详情播放器复用。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, RotateCwSquare, Repeat, Repeat1, Shuffle } from 'lucide-vue-next'
import { Popover, Tooltip } from 'antdv-next'
import type { Component } from 'vue'
import type { PlaybackMode } from '@strawberrybear/player'

/**
 * @description: 组件属性
 * @param {PlaybackMode} mode - 当前播放列表调度模式
 * @param {'default' | 'compact' | 'overlay'} [variant] - 控件视觉样式
 */
const props = withDefaults(
  defineProps<{
    mode: PlaybackMode
    variant?: 'default' | 'compact' | 'overlay'
  }>(),
  {
    variant: 'default',
  }
)

const emit = defineEmits<{
  change: [mode: PlaybackMode]
}>()

const { t } = useI18n()

/** Popover 打开状态，选择模式后立即收起。 */
const popoverOpen = ref(false)

/**
 * @description: 播放模式选项配置
 */
interface PlaybackModeOption {
  /** 模式值 */
  value: PlaybackMode
  /** 展示图标 */
  icon: Component
}

/** 播放模式选项顺序，和常见音乐播放器的模式菜单保持一致。 */
const playbackModeOptions: PlaybackModeOption[] = [
  { value: 'sequential', icon: RotateCwSquare },
  { value: 'shuffle', icon: Shuffle },
  { value: 'repeat-one', icon: Repeat1 },
  { value: 'repeat-all', icon: Repeat },
]

/** 当前模式选项，用于触发按钮展示对应图标。 */
const currentOption = computed(
  () => playbackModeOptions.find((option) => option.value === props.mode) ?? playbackModeOptions[0]!
)

/** 当前模式的本地化名称，用于按钮无障碍标签。 */
const currentModeLabel = computed(() => t(`overlay.playbackModes.${props.mode}`))

const isCompact = computed(() => props.variant === 'compact' || props.variant === 'overlay')

/** 悬浮窗靠左显示，避免 Popover 从按钮中心展开后被窗口 overflow 裁切。 */
const popoverPlacement = computed(() => (props.variant === 'overlay' ? 'right' : 'top'))

/** Hover 提示只展示当前模式名称，悬浮窗从按钮右侧弹出。 */
const tooltipPlacement = computed(() => (props.variant === 'overlay' ? 'right' : 'top'))

/** Popover 全局 class；悬浮窗使用更紧凑的尺寸。 */
const popoverClassName = computed(() =>
  isCompact.value
    ? 'playback-mode-popover playback-mode-popover-compact'
    : 'playback-mode-popover'
)

/**
 * @description: 选择播放模式
 * @param {PlaybackMode} mode - 目标播放模式
 * @return {void} 无返回值
 */
function selectPlaybackMode(mode: PlaybackMode) {
  // 重复点击当前项不再触发持久化写入，避免无意义保存 settings。
  if (mode !== props.mode) {
    emit('change', mode)
  }
  popoverOpen.value = false
}
</script>

<template>
  <Tooltip :title="popoverOpen ? '' : currentModeLabel" :placement="tooltipPlacement">
    <Popover
      v-model:open="popoverOpen"
      trigger="click"
      :placement="popoverPlacement"
      :overlay-class-name="popoverClassName"
    >
      <template #content>
        <div class="mode-menu" :class="{ compact: isCompact }">
          <button
            v-for="option in playbackModeOptions"
            :key="option.value"
            class="mode-option"
            :class="{ active: option.value === mode }"
            type="button"
            @click="selectPlaybackMode(option.value)"
          >
            <component :is="option.icon" class="mode-option-icon" />
            <span class="mode-option-label">{{ t(`overlay.playbackModes.${option.value}`) }}</span>
            <Check v-if="option.value === mode" class="mode-option-check" />
          </button>
        </div>
      </template>

      <button
        class="mode-trigger"
        :class="variant"
        type="button"
        :aria-label="currentModeLabel"
        @click.stop
      >
        <component :is="currentOption.icon" class="mode-trigger-icon" />
      </button>
    </Popover>
  </Tooltip>
</template>

<style scoped>
.mode-trigger {
  @apply inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors;
  color: var(--color-primary);
}

.mode-trigger:hover {
  background: var(--bg-primary-10);
}

.mode-trigger.overlay {
  @apply h-8 w-8 rounded-lg text-white/90 hover:bg-white/20 hover:text-white;
  background: transparent;
}

.mode-trigger.compact {
  @apply h-8 w-8 rounded-lg;
}

.mode-trigger-icon {
  @apply h-5 w-5;
  stroke-width: 2.25;
}

.mode-trigger.compact .mode-trigger-icon {
  @apply h-4 w-4;
}

.mode-trigger.overlay .mode-trigger-icon {
  @apply h-4 w-4;
  stroke-width: 2.35;
}

.mode-menu {
  @apply flex min-w-36 flex-col gap-1;
}

.mode-menu.compact {
  @apply min-w-[104px] gap-0.5;
}

.mode-option {
  @apply grid h-8 grid-cols-[18px_minmax(0,1fr)_16px] items-center gap-2 rounded-md px-2 text-left text-sm transition-colors;
  color: var(--color-foreground);
}

.mode-menu.compact .mode-option {
  @apply h-[26px] grid-cols-[14px_minmax(0,1fr)_12px] gap-1 rounded px-1.5 text-xs;
}

.mode-option:hover,
.mode-option.active {
  background: var(--bg-primary-10);
  color: var(--color-primary);
}

.mode-option-icon,
.mode-option-check {
  @apply h-4 w-4;
  stroke-width: 2.25;
}

.mode-option-label {
  @apply truncate;
}

.mode-menu.compact .mode-option-icon,
.mode-menu.compact .mode-option-check {
  @apply h-3.5 w-3.5;
  stroke-width: 2.15;
}

:global(.playback-mode-popover .ant-popover-inner) {
  padding: 8px;
  border-radius: 12px;
}

:global(.playback-mode-popover-compact .ant-popover-inner) {
  padding: 4px;
  border-radius: 10px;
}
</style>
