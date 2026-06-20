<script setup lang="ts">
/**
 * @description: TitlePickerBody - 搭配师称号选择弹窗内容
 * @description 只负责称号列表展示和选择事件，不直接写草稿。
 */
import type { TitlePickerOption } from '../../types'

defineProps<{
  items: TitlePickerOption[]
  selectedId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <div class="grid gap-2.5">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :class="[
        'grid min-h-[74px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border bg-white/75 p-3 text-left text-[var(--color-foreground)] transition hover:-translate-y-0.5 hover:border-[#ef5f8f]/55 hover:bg-[#fff4f8]',
        item.id === selectedId
          ? 'border-[#ef5f8f] shadow-[0_12px_26px_rgba(239,95,143,0.16)]'
          : 'border-[#ef5f8f]/20',
      ]"
      data-sound="select"
      @click="emit('select', item.id)"
    >
      <span
        class="grid size-10 place-items-center rounded-full bg-[linear-gradient(135deg,#ef5f8f,#c48a2c)] text-lg font-black text-white shadow-[0_8px_18px_rgba(239,95,143,0.18)]"
      >
        {{ item.symbol }}
      </span>
      <span class="grid min-w-0 gap-1">
        <strong class="truncate text-[15px] font-[780]">
          {{ item.displayName }}
        </strong>
        <small class="line-clamp-1 text-[13px] leading-relaxed text-[var(--color-muted-dark)]">
          {{ item.displayDescription }}
        </small>
      </span>
      <v-icon v-if="item.id === selectedId" icon="mdi-check-circle" color="primary" size="22" />
    </button>
  </div>
</template>
