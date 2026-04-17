<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 11:21:32
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-17 11:21:37
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\ui\dialog\DialogDescription.vue
 * @Description: 
-->
<script lang="ts" setup>
import type { DialogDescriptionProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogDescription } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogDescriptionProps & { class?: HTMLAttributes['class'] }>()
const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DialogDescription
    data-slot="dialog-description"
    v-bind="delegatedProps"
    :class="cn('text-sm text-muted-foreground', props.class)"
  >
    <slot />
  </DialogDescription>
</template>
