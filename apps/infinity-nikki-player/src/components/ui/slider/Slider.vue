<script setup lang="ts">
import { type HTMLAttributes, ref, watch } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: number[]
  min?: number
  max?: number
  step?: number
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const internalValue = ref(props.modelValue ?? [props.min ?? 0, props.max ?? 100])

watch(() => props.modelValue, (val) => {
  if (val) internalValue.value = val
})
</script>

<template>
  <div :class="cn('relative flex w-full touch-none select-none items-center', props.class)">
    <div class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
      <div
        class="absolute h-full bg-primary"
        :style="{ width: `${((internalValue[1] - (props.min ?? 0)) / ((props.max ?? 100) - (props.min ?? 0))) * 100}%` }"
      />
    </div>
    <input
      type="range"
      :min="props.min ?? 0"
      :max="props.max ?? 100"
      :step="props.step ?? 1"
      :value="internalValue[0]"
      class="absolute w-full h-full opacity-0 cursor-pointer"
      @input="internalValue[0] = Number(($event.target as HTMLInputElement).value); emit('update:modelValue', internalValue)"
    />
    <input
      type="range"
      :min="props.min ?? 0"
      :max="props.max ?? 100"
      :step="props.step ?? 1"
      :value="internalValue[1]"
      class="absolute w-full h-full opacity-0 cursor-pointer"
      @input="internalValue[1] = Number(($event.target as HTMLInputElement).value); emit('update:modelValue', internalValue)"
    />
  </div>
</template>
