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
  clearKeyLog: () => void // 清空按键日志
  keyCodeToPitch?: Map<string, number> // 按键代码到音符号的映射
}>()

const emit = defineEmits<{
  keyClick: [code: string]
}>()

/** 将音符号转换为音符名称 */
function pitchToNoteName(pitch: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  const noteIndex = pitch % 12
  return `${noteNames[noteIndex]}${octave}`
}

/** 处理按键点击 */
function handleKeyClick(code: string) {
  emit('keyClick', code)
}
</script>

<template>
  <div class="keyboard-preview">
    <!-- 顶部操作区 -->
    <div class="toolbar">
      <KeyLogPopover
        :active-keys="props.activeKeys"
        :key-log="props.keyLog"
        :get-key-log-by-chapters="props.getKeyLogByChapters"
        :clear-key-log="props.clearKeyLog"
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
            clickable: props.keyCodeToPitch?.has(key.code),
          }"
          :title="props.keyCodeToPitch?.has(key.code) ? pitchToNoteName(props.keyCodeToPitch!.get(key.code)!) : ''"
          @click="handleKeyClick(key.code)"
        >
          <span class="key-label">{{ key.key }}</span>
          <span v-if="props.keyCodeToPitch?.has(key.code)" class="pitch-label">
            {{ pitchToNoteName(props.keyCodeToPitch!.get(key.code)!) }}
          </span>
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
  @apply flex flex-col items-center justify-center rounded-lg font-medium transition-all;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-20);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  min-width: 32px;
  height: 36px;
}

.key.function {
  min-width: 36px;
  height: 28px;
}

.key.clickable {
  cursor: pointer;
}

.key.clickable:hover {
  background: var(--bg-primary-10);
}

.key-label {
  @apply text-xs;
  color: var(--color-muted);
}

.pitch-label {
  @apply text-[8px] leading-none;
  color: var(--color-muted);
  opacity: 0.7;
}

.key.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px var(--bg-primary-30);
  transform: translateY(1px);
}

.key.active .key-label,
.key.active .pitch-label {
  color: white;
}

.key.active .pitch-label {
  opacity: 0.8;
}
</style>
