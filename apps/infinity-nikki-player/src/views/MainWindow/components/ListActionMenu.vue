<script setup lang="ts">
/**
 * @description: 主窗口列表统一操作菜单。
 * @description: 同时支持元素触发和鼠标坐标锚点，让普通列表与表格共享点击/右键行为。
 */
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import { Dropdown } from 'antdv-next'
import type { MenuProps } from 'antdv-next'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'

/** 列表菜单的屏幕坐标锚点，用于在右键位置打开浮层。 */
interface ListActionMenuAnchorPoint {
  /** 相对视口左侧的像素坐标。 */
  x: number
  /** 相对视口顶部的像素坐标。 */
  y: number
}

/** 主窗口列表操作菜单属性。 */
interface ListActionMenuProps {
  /** antdv-next 菜单项。 */
  items: NonNullable<MenuProps['items']>
  /** 受控打开状态。 */
  open?: boolean
  /** 元素触发方式；坐标锚点场景由外部受控打开。 */
  trigger?: 'click' | 'contextmenu'
  /** 是否禁用菜单。 */
  disabled?: boolean
  /** 右键菜单的屏幕坐标；为空时使用默认插槽作为触发元素。 */
  anchorPoint?: ListActionMenuAnchorPoint | null
}

const props = defineProps<ListActionMenuProps>()

const emit = defineEmits<{
  select: [key: string]
  'update:open': [open: boolean]
}>()

/** 将鼠标屏幕坐标转换为固定定位锚点，避免表格滚动影响菜单位置。 */
const anchorStyle = computed<CSSProperties>(() => ({
  left: `${props.anchorPoint?.x ?? 0}px`,
  top: `${props.anchorPoint?.y ?? 0}px`,
}))

/**
 * @description: 转发菜单选择并关闭受控浮层
 * @param {{ key: string | number }} info - antdv-next 菜单点击信息
 * @return {void}
 */
function handleMenuClick(info: { key: string | number }): void {
  emit('select', String(info.key))
  emit('update:open', false)
}
</script>

<template>
  <Dropdown
    v-bind="open !== undefined ? { open } : {}"
    :trigger="[trigger ?? 'click']"
    placement="bottomRight"
    :disabled="disabled"
    :get-popup-container="getMainWindowPopupContainer"
    :menu="{ items, onClick: handleMenuClick }"
    @update:open="(value) => emit('update:open', value)"
  >
    <span
      v-if="anchorPoint"
      class="pointer-events-none fixed z-[-1] block size-px"
      :style="anchorStyle"
      aria-hidden="true"
    />
    <slot v-else />
  </Dropdown>
</template>
