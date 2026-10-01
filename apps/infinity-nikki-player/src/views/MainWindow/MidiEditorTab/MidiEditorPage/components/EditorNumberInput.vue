<script setup lang="ts">
/** 数字编辑以 Enter/失焦、步进按钮松开或方向键松开为一次提交。 */
import { onBeforeUnmount, onMounted } from 'vue'
import { InputNumber } from 'antdv-next'
import type { InputNumberStepContext } from 'antdv-next'
import { useEditorValueDraft } from '../useEditorValueDraft'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ value: number | null }>()
const emit = defineEmits<{ commit: [value: number] }>()
const draft = useEditorValueDraft<number | null>(() => props.value, value => {
  // 清空输入框是编辑中间态，不能把 null 转换为 0 并意外改变音高。
  if (value !== null && Number.isFinite(value)) emit('commit', value)
})
let steppingWithPointer = false
let cancelled = false
function begin(): void { cancelled = false }
function update(value: number | string | null): void {
  if (cancelled) return
  draft.update(value === null || value === '' ? null : Number(value))
}
function onStep(_value: unknown, info: InputNumberStepContext): void {
  if (cancelled) return
  if (info.emitter === 'handler') steppingWithPointer = true
  if (info.emitter === 'wheel') draft.commit()
}
function finishPointerStep(): void {
  if (!steppingWithPointer) return
  steppingWithPointer = false
  draft.commit()
}
function cancel(): void {
  cancelled = true
  steppingWithPointer = false
  draft.cancel()
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') {
    if (!event.repeat) begin()
    return
  }
  event.preventDefault()
  event.stopPropagation()
  cancel()
}
function onKeyup(event: KeyboardEvent): void {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') draft.commit()
}
onMounted(() => {
  // 在控件外释放步进按钮也要结束交互；取消和失焦不能留下悬空草稿。
  window.addEventListener('pointerup', finishPointerStep)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('blur', cancel)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', finishPointerStep)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('blur', cancel)
})
</script>

<template>
  <InputNumber
    v-bind="$attrs"
    :value="draft.value.value"
    @change="update"
    @step="onStep"
    @blur="draft.commit"
    @press-enter="draft.commit"
    @pointerdown.capture="begin"
    @focus="begin"
    @beforeinput="begin"
    @keydown.capture="onKeydown"
    @keyup="onKeyup"
  />
</template>
