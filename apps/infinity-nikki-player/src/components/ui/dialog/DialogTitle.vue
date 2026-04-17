<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 11:21:25
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-17 11:21:31
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\ui\dialog\DialogTitle.vue
 * @Description: 
-->
<script lang="ts" setup>
import type { DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogTitle } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()
const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DialogTitle
    data-slot="dialog-title"
    v-bind="delegatedProps"
    :class="cn('text-lg font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
