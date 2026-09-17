<script setup lang="ts">
/** 全局播放器与独立窗口共用的歌曲名：完整名称提示、溢出跑马灯、切歌重置。 */
import { Tooltip } from 'antdv-next'
import MarqueeText from '@/components/MarqueeText.vue'
defineOptions({ inheritAttrs: false })
defineProps<{ title: string; mediaId: string | null }>()
</script>

<template>
  <Tooltip :title="title">
    <MarqueeText
      :key="mediaId ?? 'no-media'"
      v-bind="$attrs"
      class="current-title"
      :text="title"
    />
  </Tooltip>
</template>

<style scoped>
.current-title { @apply block min-w-0 text-sm font-semibold; color: var(--color-foreground); }
</style>
