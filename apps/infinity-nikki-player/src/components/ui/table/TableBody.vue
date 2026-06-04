<script setup lang="ts">
/**
 * @description: TableBody - 表格主体容器
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * @description: TableBody 组件属性
 * @param {string} [class] - 额外 Tailwind 类名
 */
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <tbody :class="cn('[&_tr:last-child]:border-0', $props.class)">
    <slot />
  </tbody>
</template>
