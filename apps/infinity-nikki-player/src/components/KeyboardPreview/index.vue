<script setup lang="ts">
/**
 * @description: 键盘预览组件
 * @description 显示虚拟键盘布局，实时显示激活的按键状态，支持按键日志查看
 */
import { KEYBOARD_LAYOUT } from './constants'
import KeyLogPopover from './components/KeyLogPopover.vue'
import type { KeyLogEntry, KeyLogChapter } from '@/lib/keyboardMapper'

/**
 * @description: 组件属性
 * @param {Set<string>} activeKeys - 当前激活的按键 code 集合
 * @param {KeyLogEntry[]} keyLog - 按键日志数组
 * @param {() => KeyLogChapter[]} getKeyLogByChapters - 获取按章节分组的按键日志
 * @param {() => void} clearKeyLog - 清空按键日志的回调
 * @param {Map<string, number>} [keyCodeToPitch] - 按键代码到音符号的映射（可选）
 */
const props = defineProps<{
  activeKeys: Set<string>
  keyLog: KeyLogEntry[]
  getKeyLogByChapters: () => KeyLogChapter[]
  clearKeyLog: () => void
  keyCodeToPitch?: Map<string, number>
}>()

/**
 * @description: 组件事件
 * @param {Function} keyClick - 点击键盘按键时触发，参数为按键代码
 */
const emit = defineEmits<{
  keyClick: [code: string]
}>()

/**
 * @description: 将音符号转换为音符名称
 * @param {number} pitch - MIDI 音符号 (0-127)
 * @return {string} 音符名称（如 "C4"、"F#5"）
 *
 * @example
 * pitchToNoteName(60) // "C4"
 * pitchToNoteName(69) // "A4"
 */
function pitchToNoteName(pitch: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  const noteIndex = pitch % 12
  return `${noteNames[noteIndex]}${octave}`
}

/**
 * @description: 处理按键点击事件
 * @param {string} code - 按键代码
 */
function handleKeyClick(code: string) {
  emit('keyClick', code)
}
</script>

<template>
  <div class="keyboard-preview">
    <!-- 顶部操作区 -->
    <div class="toolbar">
      <!-- 按键日志弹窗 -->
      <KeyLogPopover
        :active-keys="props.activeKeys"
        :key-log="props.keyLog"
        :get-key-log-by-chapters="props.getKeyLogByChapters"
        :clear-key-log="props.clearKeyLog"
      />
    </div>

    <!-- 键盘区域 -->
    <div class="keyboard-area">
      <!-- 遍历每一行键盘布局 -->
      <div
        v-for="(row, rowIndex) in KEYBOARD_LAYOUT"
        :key="rowIndex"
        class="keyboard-row"
        :class="{ 'function-row': rowIndex === 0 }"
      >
        <!-- 遍历每个按键 -->
        <div
          v-for="key in row"
          :key="key.code"
          class="key"
          :class="{
            active: props.activeKeys.has(key.code), // 是否激活
            function: key.type === 'function', // 是否为功能键
            clickable: props.keyCodeToPitch?.has(key.code), // 是否可点击（有映射）
          }"
          :title="props.keyCodeToPitch?.has(key.code) ? pitchToNoteName(props.keyCodeToPitch!.get(key.code)!) : ''"
          @click="handleKeyClick(key.code)"
        >
          <!-- 按键标签 -->
          <span class="key-label">{{ key.key }}</span>
          <!-- 音高标签（如果有映射） -->
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
