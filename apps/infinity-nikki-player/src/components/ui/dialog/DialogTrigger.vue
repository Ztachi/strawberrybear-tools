<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 11:20:49
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-17 11:20:57
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\ui\dialog\DialogTrigger.vue
 * @Description: 
-->
<script lang="ts" setup>
import type { DialogTriggerProps } from 'reka-ui'
import { useForwardProps } from 'reka-ui'
import { DialogTrigger } from 'reka-ui'

const props = defineProps<DialogTriggerProps>()
const forwarded = useForwardProps(props)
</script>

<template>
  <DialogTrigger data-slot="dialog-trigger" v-bind="forwarded">
    <slot />
  </DialogTrigger>
</template>
