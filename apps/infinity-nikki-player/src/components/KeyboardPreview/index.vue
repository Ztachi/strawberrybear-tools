<script setup lang="ts">
/**
 * @description: 键盘预览组件
 * @description 显示虚拟键盘布局，实时显示激活的按键状态，支持按键日志查看
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  activeKeys?: Set<string>
  keyLog?: KeyLogEntry[]
  getKeyLogByChapters?: () => KeyLogChapter[]
  clearKeyLog?: () => void
  keyCodeToPitch?: Map<string, number>
}>()

const activeKeySet = computed(() => props.activeKeys ?? new Set<string>())
const showKeyLog = computed(
  () => Boolean(props.keyLog && props.getKeyLogByChapters && props.clearKeyLog)
)
const slots = defineSlots<{
  toolbarLeft?: () => unknown
}>()
const showToolbar = computed(() => showKeyLog.value || Boolean(slots.toolbarLeft))
const scaleShellRef = ref<HTMLDivElement | null>(null)
const keyboardAreaRef = ref<HTMLDivElement | null>(null)
const keyboardScale = ref(1)
const scaledKeyboardHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

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
  if (!props.keyCodeToPitch?.has(code)) return
  emit('keyClick', code)
}

function getKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    SPACE: 'Space',
    TAB: 'Tab',
    ENTER: 'Enter',
    BACKSPACE: 'Backspace',
    DELETE: 'Del',
    ARROWUP: '↑',
    ARROWDOWN: '↓',
    ARROWLEFT: '←',
    ARROWRIGHT: '→',
  }
  return labels[key] ?? key
}

function getRowClass(rowIndex: number) {
  return {
    'function-row': rowIndex === 0,
    'space-row': rowIndex === KEYBOARD_LAYOUT.length - 1,
  }
}

function getKeyClass(key: string) {
  const classes: Record<string, string> = {
    SPACE: 'key-space',
    DELETE: 'key-delete',
    ARROWLEFT: 'key-arrow-left',
    ARROWDOWN: 'key-arrow-down',
    ARROWRIGHT: 'key-arrow-right',
  }
  return classes[key] ?? ''
}

function updateKeyboardScale() {
  const shell = scaleShellRef.value
  const area = keyboardAreaRef.value
  if (!shell || !area) return

  const availableWidth = shell.clientWidth
  const contentWidth = area.scrollWidth
  const contentHeight = area.scrollHeight
  const nextScale = contentWidth > 0 ? Math.min(1, availableWidth / contentWidth) : 1
  keyboardScale.value = Number.isFinite(nextScale) ? nextScale : 1
  scaledKeyboardHeight.value = Math.ceil(contentHeight * keyboardScale.value)
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updateKeyboardScale())
  if (scaleShellRef.value) resizeObserver.observe(scaleShellRef.value)
  if (keyboardAreaRef.value) resizeObserver.observe(keyboardAreaRef.value)
  void nextTick(updateKeyboardScale)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

watch(
  () => [props.keyCodeToPitch, props.activeKeys, showToolbar.value],
  () => void nextTick(updateKeyboardScale)
)
</script>

<template>
  <div class="keyboard-preview">
    <!-- 顶部操作区 -->
    <div v-if="showToolbar" class="toolbar">
      <div class="toolbar-left">
        <slot name="toolbarLeft" />
      </div>
      <!-- 按键日志弹窗 -->
      <KeyLogPopover
        v-if="showKeyLog"
        :active-keys="activeKeySet"
        :key-log="props.keyLog!"
        :get-key-log-by-chapters="props.getKeyLogByChapters!"
        :clear-key-log="props.clearKeyLog!"
      />
    </div>

    <!-- 键盘区域 -->
    <div
      ref="scaleShellRef"
      class="keyboard-scale-shell"
      :style="{ height: `${scaledKeyboardHeight}px` }"
    >
      <div
        ref="keyboardAreaRef"
        class="keyboard-area"
        :style="{ transform: `translateX(-50%) scale(${keyboardScale})` }"
      >
        <!-- 遍历每一行键盘布局 -->
        <div
          v-for="(row, rowIndex) in KEYBOARD_LAYOUT"
          :key="rowIndex"
          class="keyboard-row"
          :class="getRowClass(rowIndex)"
        >
          <!-- 遍历每个按键 -->
          <div
            v-for="key in row"
            :key="key.code"
            class="key"
            :class="{
              active: activeKeySet.has(key.code), // 是否激活
              function: key.type === 'function', // 是否为功能键
              control: key.type === 'control',
              clickable: props.keyCodeToPitch?.has(key.code), // 是否可点击（有映射）
              [`width-${key.width}`]: key.width,
              [getKeyClass(key.key)]: getKeyClass(key.key),
            }"
            :title="
              props.keyCodeToPitch?.has(key.code)
                ? pitchToNoteName(props.keyCodeToPitch!.get(key.code)!)
                : ''
            "
            @click="handleKeyClick(key.code)"
          >
            <!-- 按键标签 -->
            <span class="key-label">{{ getKeyLabel(key.key) }}</span>
            <!-- 音高标签（如果有映射） -->
            <span v-if="props.keyCodeToPitch?.has(key.code)" class="pitch-label">
              {{ pitchToNoteName(props.keyCodeToPitch!.get(key.code)!) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-preview {
  @apply flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg p-1.5;
  background: var(--bg-primary-05);
  border: 1px solid var(--border-primary-15);
  width: 100%;
}

.toolbar {
  @apply flex items-center justify-between gap-3;
}

.toolbar-left {
  @apply min-w-0 flex-1;
}

.keyboard-scale-shell {
  @apply relative min-w-0 overflow-hidden;
  width: 100%;
}

.keyboard-area {
  @apply absolute left-1/2 top-0 flex flex-col;
  gap: 2px;
  transform-origin: top center;
  width: max-content;
}

.keyboard-row {
  @apply flex items-center justify-center;
  gap: 2px;
}

.keyboard-row.function-row {
  margin-bottom: 2px;
}

.keyboard-row.space-row {
  margin-top: 2px;
  justify-content: end;
}

.keyboard-row.space-row .key-arrow-left {
  margin-left: 20px;
}
.keyboard-row.space-row .key-arrow-right {
  margin-right: 16px;
}

.key {
  @apply flex shrink-0 flex-col items-center justify-center rounded-md font-medium transition-all;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-20);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  width: 29px;
  height: 30px;
}

.key.function {
  width: 34px;
  height: 25px;
}

.key.control {
  background: var(--bg-white-95);
}

.key.width-md {
  width: 38px;
}

.key.width-lg {
  width: 47px;
}

.key.width-xl {
  width: 60px;
}

.key.width-space {
  width: 170px;
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
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pitch-label {
  @apply text-[7px] leading-none;
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
