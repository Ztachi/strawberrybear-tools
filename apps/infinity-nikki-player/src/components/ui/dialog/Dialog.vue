<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 11:20:40
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-17 11:20:47
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\ui\dialog\Dialog.vue
 * @Description: 
-->
<script lang="ts" setup>
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { useForwardPropsEmits } from 'reka-ui'
import { DialogRoot } from 'reka-ui'

const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DialogRoot data-slot="dialog" v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
