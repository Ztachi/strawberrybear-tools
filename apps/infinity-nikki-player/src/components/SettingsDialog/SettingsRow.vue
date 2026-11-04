<script setup lang="ts">
/** 标题与操作使用同一设置行；窄窗口自然换行，说明不挤压控件。 */
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <div class="min-w-0">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1 basis-40">
        <div class="text-sm leading-6">
          <slot name="title">
            {{ title }}
          </slot>
        </div>
        <p v-if="description" class="mb-0 mt-0.5 text-xs leading-5 text-[var(--color-muted-dark)]">
          {{ description }}
        </p>
      </div>
      <div class="flex max-w-full flex-wrap items-center gap-2">
        <slot />
      </div>
    </div>
    <div v-if="$slots.details" class="mt-3 min-w-0">
      <slot name="details" />
    </div>
  </div>
</template>
