<script setup lang="ts">
/** 曲名滚动直接使用歌曲项的选中结果，高亮与滚动不会各自判断播放域。 */
import MarqueeText from '@/components/MarqueeText.vue'

defineProps<{
  text: string
  selected: boolean
}>()
</script>

<template>
  <MarqueeText :text="text" :enabled="selected" />
</template>
