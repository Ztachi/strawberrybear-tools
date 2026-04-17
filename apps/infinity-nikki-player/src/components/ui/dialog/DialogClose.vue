<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 11:21:15
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-17 11:21:24
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\ui\dialog\DialogClose.vue
 * @Description: 
-->
<script lang="ts" setup>
import type { DialogCloseProps } from 'reka-ui'
import { useForwardProps } from 'reka-ui'
import { DialogClose } from 'reka-ui'

const props = defineProps<DialogCloseProps>()
const forwarded = useForwardProps(props)
</script>

<template>
  <DialogClose data-slot="dialog-close" v-bind="forwarded">
    <slot />
  </DialogClose>
</template>
