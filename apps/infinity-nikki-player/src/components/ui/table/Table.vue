<script setup lang="ts">
/**
 * @description: Table - shadcn-vue 风格表格根组件
 * @description 只封装表格外观与基础语义，不承载任何业务分页、筛选或排序逻辑
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * @description: Table 组件属性
 * @param {string} [class] - 额外 Tailwind 类名
 */
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <table :class="cn('w-full caption-bottom text-sm', $props.class)">
    <slot />
  </table>
</template>
