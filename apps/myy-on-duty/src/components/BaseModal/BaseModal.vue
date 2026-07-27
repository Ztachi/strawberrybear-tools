<script setup lang="ts">
defineProps<{ title: string }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(74_63_63/45%)] p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @click.self="$emit('close')"
  >
    <section
      class="max-h-[88dvh] w-full max-w-lg overflow-auto rounded-[2rem] border-2 border-[var(--color-border)] bg-[var(--panel)] p-6 text-[var(--text)] shadow-[0_20px_60px_rgb(238_143_161/30%)]"
    >
      <header class="mb-5 flex items-center justify-between gap-4">
        <h2 class="font-display text-2xl font-black">
          {{ title }}
        </h2>
        <button class="icon-button" :aria-label="$t('common.close')" @click="$emit('close')">
          ×
        </button>
      </header>
      <slot />
    </section>
  </div>
</template>
