<script setup lang="ts">
/**
 * @description: AvatarPickerBody - 头像选择弹窗内容
 * @description 当前先用 Vuetify Avatar 占位，后续接入真实头像图后只需替换展示源。
 */
import type { AvatarPickerOption } from '../../types'

defineProps<{
  emptyText: string
  items: AvatarPickerOption[]
  manageLabel: string
  officialLabel: string
  selectedId: string
}>()

const emit = defineEmits<{
  manage: []
  select: [id: string]
}>()
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-3">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :class="[
          'grid min-h-[76px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border bg-white/75 p-3 text-left text-[var(--color-foreground)] transition hover:-translate-y-0.5 hover:border-[#ef5f8f]/55 hover:bg-[#fff4f8]',
          item.id === selectedId
            ? 'border-[#ef5f8f] shadow-[0_12px_26px_rgba(239,95,143,0.16)]'
            : 'border-[#ef5f8f]/20',
        ]"
        data-sound="select"
        @click="emit('select', item.id)"
      >
        <v-avatar color="primary" variant="tonal" size="48">
          <v-icon icon="mdi-account-circle-outline" size="30" />
        </v-avatar>
        <span class="grid min-w-0 gap-1">
          <strong class="truncate text-[15px] font-[780]">
            {{ item.displayName }}
          </strong>
          <small class="truncate text-[13px] text-[var(--color-muted-dark)]">
            {{ officialLabel }}
          </small>
        </span>
        <v-icon v-if="item.id === selectedId" icon="mdi-check-circle" color="primary" size="22" />
      </button>
    </div>

    <div
      class="grid gap-2 rounded-[18px] border border-dashed border-[#ef5f8f]/25 bg-white/55 p-4 text-[13px] text-[var(--color-muted-dark)]"
    >
      <span>{{ emptyText }}</span>
      <v-btn
        variant="text"
        color="primary"
        class="justify-self-start"
        data-sound="nav"
        @click="emit('manage')"
      >
        {{ manageLabel }}
      </v-btn>
    </div>
  </div>
</template>
