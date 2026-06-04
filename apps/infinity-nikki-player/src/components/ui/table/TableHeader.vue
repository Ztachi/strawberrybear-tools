<script setup lang="ts">
/**
 * @description: TableHeader - 表头容器
 * @description 提供 shadcn-vue 风格的表头样式入口
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * @description: TableHeader 组件属性
 * @param {string} [class] - 额外 Tailwind 类名
 */
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <thead :class="cn('[&_tr]:border-b', $props.class)">
    <slot />
  </thead>
</template>
