<script setup lang="ts">
/**
 * @description: TableCell - 表格内容单元格组件
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * @description: TableCell 组件属性
 * @param {string} [class] - 额外 Tailwind 类名
 */
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <td :class="cn('px-4 py-3 align-middle', $props.class)">
    <slot />
  </td>
</template>
