<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KeyBindings } from '@/game/types'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const { t } = useI18n()
const canEditKeys = ref(false)
const editingKey = ref<keyof KeyBindings | null>(null)

const keyRows = computed(() =>
  (['left', 'right', 'launch'] as const).map((id) => ({
    id,
    label: t(`settings.key.${id}`),
    value: formatKey(settingsStore.settings.keys[id]),
  }))
)

onMounted(() => {
  // 细指针设备才开放键盘录入；触屏设备仍展示当前配置。
  canEditKeys.value = window.matchMedia('(pointer: fine)').matches
})

/**
 * @description 把 KeyboardEvent.code 转换成易读标签
 * @param {string} code 浏览器物理按键代码
 * @return {string} 展示文案
 */
function formatKey(code: string): string {
  if (code === 'Space') return t('settings.key.space')
  return code.replace(/^Key/, '').replace(/^Digit/, '')
}

/**
 * @description 进入指定动作的按键录入状态
 * @param {keyof KeyBindings} action 动作编号
 * @return {void}
 */
function beginKeyEdit(action: keyof KeyBindings): void {
  if (!canEditKeys.value) return
  editingKey.value = action
}

/**
 * @description 保存新的物理按键映射并避免三个动作使用同一按键
 * @param {KeyboardEvent} event 键盘事件
 * @param {keyof KeyBindings} action 动作编号
 * @return {void}
 */
function captureKey(event: KeyboardEvent, action: keyof KeyBindings): void {
  if (!canEditKeys.value || editingKey.value !== action) return
  event.preventDefault()
  const code = event.code
  if (!code || ['Escape', 'Tab', 'Enter'].includes(code)) {
    editingKey.value = null
    return
  }
  const duplicate = (Object.entries(settingsStore.settings.keys) as [keyof KeyBindings, string][])
    .find(([otherAction, otherCode]) => otherAction !== action && otherCode === code)
  if (duplicate) settingsStore.settings.keys[duplicate[0]] = settingsStore.settings.keys[action]
  settingsStore.settings.keys[action] = code
  editingKey.value = null
}
</script>

<template>
  <label class="mb-6 block">
    <span class="mb-2 flex items-center justify-between">
      <span>{{ $t('settings.volume') }}</span>
      <strong>{{ Math.round(settingsStore.settings.volume * 100) }}%</strong>
    </span>
    <input
      v-model.number="settingsStore.settings.volume"
      class="w-full accent-[var(--pink)]"
      type="range"
      min="0"
      max="1"
      step="0.05"
    />
  </label>

  <label class="flex items-center justify-between rounded-xl bg-[var(--color-primary-light)] p-4">
    <span>{{ $t('settings.muted') }}</span>
    <input v-model="settingsStore.settings.muted" type="checkbox" />
  </label>

  <label
    class="mt-4 flex items-center justify-between rounded-xl bg-[var(--color-primary-light)] p-4"
  >
    <span>{{ $t('settings.language') }}</span>
    <select
      v-model="settingsStore.settings.locale"
      class="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2"
      :aria-label="$t('settings.language')"
    >
      <option value="zh-CN">{{ $t('settings.locale.zhCN') }}</option>
      <option value="en-US">{{ $t('settings.locale.enUS') }}</option>
    </select>
  </label>

  <section class="mt-5 rounded-xl bg-[var(--color-primary-light)] p-4">
    <h3 class="font-bold">
      {{ $t('settings.keys') }}
    </h3>
    <p class="mt-1 text-sm text-[var(--color-muted)]">
      {{ canEditKeys ? $t('settings.key.editHint') : $t('settings.key.mobileHint') }}
    </p>
    <div class="mt-4 grid gap-2">
      <button
        v-for="row in keyRows"
        :key="row.id"
        class="flex min-h-12 items-center justify-between rounded-xl border border-[var(--color-primary-disabled-border)] px-4 disabled:cursor-default"
        :class="editingKey === row.id ? 'border-[var(--color-primary-active)] bg-[var(--color-primary-light)]' : 'bg-white'"
        :disabled="!canEditKeys"
        :aria-label="$t('settings.key.editAria', { action: row.label })"
        @click="beginKeyEdit(row.id)"
        @keydown="captureKey($event, row.id)"
      >
        <span>{{ row.label }}</span>
        <kbd
          class="rounded-lg bg-[var(--color-primary-light)] px-3 py-1.5 font-mono text-[var(--color-primary-active)]"
        >
          {{ editingKey === row.id ? $t('settings.key.waiting') : row.value }}
        </kbd>
      </button>
    </div>
  </section>
</template>
