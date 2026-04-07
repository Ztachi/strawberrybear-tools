<script setup lang="ts">
import { TabsRoot, type TabsRootProps } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<TabsRootProps & { class?: string }>()
</script>

<template>
  <TabsRoot :class="cn('space-y-2', props.class)" v-bind="props">
    <slot />
  </TabsRoot>
</template>
