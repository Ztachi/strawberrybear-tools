<script setup lang="ts">
/** 设置分组只承载统一的视觉层级，具体交互由所属功能组件管理。 */
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <section class="rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
    <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <h4 class="m-0 text-sm font-semibold">
          {{ title }}
        </h4>
        <p v-if="description" class="mb-0 mt-1 text-xs leading-5 text-[var(--color-muted-dark)]">
          {{ description }}
        </p>
      </div>
      <slot name="action" />
    </header>
    <div class="flex min-w-0 flex-col gap-4">
      <slot />
    </div>
  </section>
</template>
