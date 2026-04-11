<script setup lang="ts">
/**
 * @description: 键盘映射预览组件
 */
import { KEYBOARD_LAYOUT } from './constants'
import KeyLogPopover from './components/KeyLogPopover.vue'
import type { KeyLogEntry, KeyLogChapter } from '@/lib/keyboardMapper'

const props = defineProps<{
  activeKeys: Set<string> // 当前激活的按键 code 集合
  keyLog: KeyLogEntry[] // 按键日志
  getKeyLogByChapters: () => KeyLogChapter[]
}>()
</script>

<template>
  <div class="keyboard-preview">
    <!-- 顶部操作区 -->
    <div class="toolbar">
      <KeyLogPopover
        :active-keys="props.activeKeys"
        :key-log="props.keyLog"
        :get-key-log-by-chapters="props.getKeyLogByChapters"
      />
    </div>

    <!-- 键盘区域 -->
    <div class="keyboard-area">
      <div
        v-for="(row, rowIndex) in KEYBOARD_LAYOUT"
        :key="rowIndex"
        class="keyboard-row"
        :class="{ 'function-row': rowIndex === 0 }"
      >
        <div
          v-for="key in row"
          :key="key.code"
          class="key"
          :class="{
            active: props.activeKeys.has(key.code),
            function: key.type === 'function',
          }"
        >
          <span class="key-label">{{ key.key }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-preview {
  @apply flex flex-col gap-2 p-3 rounded-xl;
  background: var(--bg-primary-05);
  border: 1px solid var(--border-primary-15);
}

.toolbar {
  @apply flex items-center justify-end;
}

.keyboard-area {
  @apply flex flex-col gap-1;
}

.keyboard-row {
  @apply flex gap-1;
}

.keyboard-row.function-row {
  @apply mb-1;
}

.key {
  @apply flex items-center justify-center rounded-lg font-medium transition-all;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-20);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  min-width: 32px;
  height: 28px;
}

.key.function {
  min-width: 36px;
  height: 24px;
  background: var(--bg-primary-10);
}

.key-label {
  @apply text-xs;
  color: var(--color-muted);
}

.key.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px var(--bg-primary-30);
  transform: translateY(1px);
}

.key.active .key-label {
  color: white;
}
</style>
