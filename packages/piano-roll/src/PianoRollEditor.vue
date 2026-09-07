<script setup lang="ts">
import PianoRoll from './PianoRoll.vue'
import type { PianoRollProps } from './vue-props'

defineOptions({ inheritAttrs: false })
const props = defineProps<Omit<PianoRollProps, 'variant'>>()
</script>

<template>
  <PianoRoll
    v-bind="{ ...props, ...$attrs }"
    variant="editor"
  >
    <template #toolbar="slotProps">
      <slot
        name="toolbar"
        v-bind="slotProps"
      />
    </template>
  </PianoRoll>
</template>
