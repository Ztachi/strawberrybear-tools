<script setup lang="ts">
/**
 * @description: 歌单封面组件
 * @description 有封面时展示图片，无封面时使用当前主题的默认音符封面。
 */
import { Music } from 'lucide-vue-next'

defineProps<{
  src?: string | null
  alt: string
  size?: 'sm' | 'md' | 'lg'
}>()
</script>

<template>
  <div class="song-list-cover" :class="`song-list-cover-${size ?? 'md'}`">
    <img v-if="src" :src="src" :alt="alt" class="h-full w-full object-cover" />
    <div v-else class="default-cover" :aria-label="alt">
      <Music class="default-cover-icon" />
    </div>
  </div>
</template>

<style scoped>
.song-list-cover {
  @apply shrink-0 overflow-hidden rounded-lg;
  border: 1px solid var(--border-primary-20);
  background: linear-gradient(135deg, var(--bg-primary-15) 0%, var(--bg-white-80) 100%);
}

.song-list-cover-sm {
  @apply h-10 w-10;
}

.song-list-cover-md {
  @apply h-16 w-16;
}

.song-list-cover-lg {
  @apply h-36 w-36 rounded-xl;
}

.default-cover {
  @apply flex h-full w-full items-center justify-center;
  color: var(--color-primary-active);
}

.default-cover-icon {
  width: 46%;
  height: 46%;
  stroke-width: 2.2;
}
</style>
