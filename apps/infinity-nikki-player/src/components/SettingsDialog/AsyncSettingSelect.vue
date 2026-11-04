<script setup lang="ts">
/** Select 内部先选中候选项；异步保存或确认失败时，把候选值回退到已提交值。 */
import { nextTick, ref, watch } from 'vue'
import { Select } from 'antdv-next'

interface AsyncSelectProps {
  value: string | number
  options: { value: string | number; label: string }[]
  disabled?: boolean
  // eslint-disable-next-line no-unused-vars -- 回调形参仅声明异步保存接口。
  save: (value: string | number) => Promise<boolean>
}
const props = defineProps<AsyncSelectProps>()
const selected = ref(props.value)
const pending = ref(false)
watch(() => props.value, value => { selected.value = value })

async function update(value: unknown): Promise<void> {
  if (props.disabled || pending.value || (typeof value !== 'string' && typeof value !== 'number')) return
  const before = props.value
  selected.value = value
  pending.value = true
  // 框架只在 value 属性变化时同步内部值，先呈现候选项才能可靠回退同值配置。
  await nextTick()
  try { if (!(await props.save(value))) selected.value = before }
  catch { selected.value = before }
  finally { pending.value = false }
}
</script>
<template>
  <Select
    :value="selected"
    :options="options"
    :disabled="pending ? true : disabled"
    @update:value="update"
  />
</template>
