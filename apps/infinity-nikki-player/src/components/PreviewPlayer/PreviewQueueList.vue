<script setup lang="ts">
/** 共享队列内容，只滚动自身列表，不负责抽屉、路由或播放实例。 */
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Tooltip } from 'antdv-next'
import { Music2 } from 'lucide-vue-next'
import type { PreviewQueueState } from '@/features/player/previewQueue'
import { formatDuration } from '@/views/MainWindow/FilesTab/utils'
const props = defineProps<{ state: PreviewQueueState; currentId: string | null }>()
const emit = defineEmits<{ select: [id: string]; scroll: [top: number] }>()
const { t } = useI18n()
const queueListRef = ref<HTMLElement | null>(null)
function handleQueueScroll(): void { emit('scroll', queueListRef.value?.scrollTop ?? 0) }
function scrollToTop(): void { queueListRef.value?.scrollTo({ top: 0, behavior: 'smooth' }) }
/** 定位只能影响列表的 scrollTop，避免 scrollIntoView 滚动带动画的抽屉及外层窗口。 */
async function locateCurrent(): Promise<void> {
  const index = props.state.items.findIndex((item) => item.id === props.currentId)
  if (index < 0) return
  await nextTick()
  const list = queueListRef.value
  const item = list?.querySelector<HTMLElement>(`[data-queue-index="${index}"]`)
  if (!list || !item) return
  const top = list.scrollTop + item.getBoundingClientRect().top - list.getBoundingClientRect().top
  list.scrollTo({ top: Math.max(0, top - (list.clientHeight - item.offsetHeight) / 2), behavior: 'smooth' })
}
defineExpose({ scrollToTop, locateCurrent, getScrollTop: () => queueListRef.value?.scrollTop ?? 0 })
</script>

<template>
  <p
    v-if="state.error"
    role="alert"
    class="queue-error"
  >
    {{ state.error }}
  </p>
  <div
    v-if="state.items.length === 0"
    class="queue-empty"
  >
    <Music2 class="queue-empty-icon" />
    <span>{{ t('player.noQueue') }}</span>
  </div>

  <div
    v-else
    ref="queueListRef"
    class="queue-list"
    @scroll="handleQueueScroll"
  >
    <Button
      v-for="(midi, index) in state.items"
      :key="`${midi.id}-${index}`"
      type="text"
      class="queue-item"
      :class="{ active: currentId === midi.id }"
      :data-queue-index="index"
      @click="emit('select', midi.id)"
    >
      <div class="queue-cover">
        <Music2 class="queue-cover-icon" />
      </div>
      <div class="queue-main">
        <Tooltip :title="midi.title">
          <span class="queue-song-title">{{ midi.title }}</span>
        </Tooltip>
        <span class="queue-song-meta">
          {{ midi.trackCount }} {{ t('midi.tracks') }} · {{ midi.noteCount || 0 }}
          {{ t('midi.melodyNotes') }}
        </span>
      </div>
      <span class="queue-duration">{{ formatDuration(midi.durationMs) }}</span>
    </Button>
  </div>
</template>

<style scoped>

.queue-error { @apply px-3; color: var(--color-error); }

.queue-list {
  @apply flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-3;
}

.queue-item {
  @apply flex h-auto w-full items-center gap-3 rounded-xl px-3 py-2 text-left;
  background: var(--bg-white-70);
  border: 1px solid transparent;
  transition:
    background 0.16s ease,
    border-color 0.16s ease;
}

.queue-item:hover,
.queue-item.active {
  background: var(--bg-primary-10);
  border-color: var(--border-primary-20);
}

.queue-cover {
  @apply flex h-10 w-10 shrink-0 items-center justify-center rounded-xl;
  background: var(--bg-primary-15);
  color: var(--color-primary-active);
}

.queue-cover-icon {
  width: 18px;
  height: 18px;
}

.queue-main {
  @apply min-w-0 flex-1;
}

.queue-song-title {
  @apply block truncate text-sm font-medium;
  color: var(--color-foreground);
}

.queue-song-meta,
.queue-duration {
  @apply text-xs;
  color: var(--color-muted);
}

.queue-duration {
  @apply w-11 shrink-0 text-right;
}

.queue-empty {
  @apply flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-sm;
  color: var(--color-muted);
}

.queue-empty-icon {
  width: 38px;
  height: 38px;
  color: var(--color-primary-active);
}

</style>
