<script setup lang="ts">
/** 播放列表统一曲名：当前歌曲自动滚动，其余静态省略；完整名称由外层 Tooltip 提供。 */
import { computed } from 'vue'
import MarqueeText from '@/components/MarqueeText.vue'
import { useCurrentSong } from './currentSong'

const props = defineProps<{
  text: string
  filename?: string
  onlineSongId?: string
  onlineSha256?: string
}>()
const currentSong = useCurrentSong()
// 本地歌曲按文件名匹配；在线曲库同时兼容临时试听和已导入歌曲的在线身份。
const isCurrent = computed(() => {
  const current = currentSong.value
  if (!current) return false
  return Boolean(
    (props.filename && current.filename === props.filename) ||
    (props.onlineSongId && current.online_song_id === props.onlineSongId) ||
    (props.onlineSha256 && current.online_sha256 === props.onlineSha256)
  )
})
</script>

<template>
  <MarqueeText :text="text" :enabled="isCurrent" />
</template>
