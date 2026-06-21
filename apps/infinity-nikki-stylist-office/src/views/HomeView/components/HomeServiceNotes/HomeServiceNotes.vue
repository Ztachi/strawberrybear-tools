<script setup lang="ts">
/**
 * @description: HomeServiceNotes - 首页办理服务说明
 * @description 使用结构化数组渲染说明卡片，避免页面复制 DOM。
 */

defineProps<{
  notes: Array<{
    text: string
    title: string
  }>
  sectionLabel: string
}>()
</script>

<template>
  <section
    class="mt-[18px] grid grid-cols-3 gap-3.5 max-[760px]:grid-cols-1"
    :aria-label="sectionLabel"
  >
    <article
      v-for="(note, index) in notes"
      :key="note.title"
      class="min-h-[154px] rounded-[18px] border border-[#ef5f8f]/20 bg-[radial-gradient(circle_at_90%_20%,rgba(255,214,109,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,246,250,0.84))] p-[22px] shadow-[0_12px_32px_rgba(201,85,126,0.10)]"
    >
      <span class="block text-[12px] font-[850] text-[#c48a2c]/65">
        {{ String(index + 1).padStart(2, '0') }}
      </span>
      <h3 class="mb-2 mt-2.5 text-[18px] font-[820] text-[var(--color-primary-active)]">
        {{ note.title }}
      </h3>
      <p class="m-0 text-[14px] leading-[1.7] text-[var(--color-muted-dark)]">
        {{ note.text }}
      </p>
    </article>
  </section>
</template>
