<script setup lang="ts">
/**
 * @description: TableHead - 表头单元格组件
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * @description: TableHead 组件属性
 * @param {string} [class] - 额外 Tailwind 类名
 */
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <th
    :class="cn('h-11 px-4 text-left align-middle text-xs font-medium text-muted-foreground', $props.class)"
  >
    <slot />
  </th>
</template>
