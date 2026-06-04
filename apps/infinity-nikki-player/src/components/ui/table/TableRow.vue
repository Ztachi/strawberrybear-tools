<script setup lang="ts">
/**
 * @description: TableRow - 表格行组件
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * @description: TableRow 组件属性
 * @param {string} [class] - 额外 Tailwind 类名
 */
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <tr
    :class="cn('border-b border-primary/10 transition-colors hover:bg-primary/5 data-[state=selected]:bg-primary/10', $props.class)"
  >
    <slot />
  </tr>
</template>
