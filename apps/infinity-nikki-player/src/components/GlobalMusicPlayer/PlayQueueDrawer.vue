<script setup lang="ts">
/**
 * @description: 当前播放队列抽屉
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Drawer, Tooltip } from 'antdv-next'
import { ListMusic, Music2, X } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { getContentDrawerRootStyle, getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import { formatDuration } from '@/views/MainWindow/FilesTab/utils'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const { t } = useI18n()
const playerStore = usePlayerStore()

const queueItems = computed(() => playerStore.activePreviewQueueItems)
const queueTitle = computed(
  () => playerStore.previewQueueContext?.title || t('player.currentQueue')
)

async function playQueueItem(index: number): Promise<void> {
  const midi = queueItems.value[index]
  if (!midi) return
  await playerStore.playMidiInQueue(midi, queueItems.value, playerStore.previewQueueContext)
}
</script>

<template>
  <Drawer
    :open="props.open"
    placement="right"
    width="420"
    root-class="content-area-drawer play-queue-drawer"
    :closable="false"
    :get-container="getMainWindowPopupContainer"
    :root-style="getContentDrawerRootStyle()"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="queue-title-wrap">
        <ListMusic class="queue-title-icon" />
        <div class="min-w-0">
          <h2 class="queue-title">
            {{ t('player.queue') }}
          </h2>
          <p class="queue-subtitle">
            {{ queueTitle }} · {{ t('songList.totalSongs', { count: queueItems.length }) }}
          </p>
        </div>
      </div>
    </template>

    <template #extra>
      <Button type="text" class="drawer-close-btn" @click="emit('update:open', false)">
        <template #icon>
          <X class="drawer-close-icon" />
        </template>
      </Button>
    </template>

    <div v-if="queueItems.length === 0" class="queue-empty">
      <Music2 class="queue-empty-icon" />
      <span>{{ t('player.noQueue') }}</span>
    </div>

    <div v-else class="queue-list">
      <button
        v-for="(midi, index) in queueItems"
        :key="`${midi.filename}-${index}`"
        type="button"
        class="queue-item"
        :class="{ active: playerStore.currentMidi?.filename === midi.filename }"
        @click="playQueueItem(index)"
      >
        <div class="queue-cover">
          <Music2 class="queue-cover-icon" />
        </div>
        <div class="queue-main">
          <Tooltip :title="midi.filename">
            <span class="queue-song-title">{{ midi.filename }}</span>
          </Tooltip>
          <span class="queue-song-meta">
            {{ midi.track_count }} {{ t('midi.tracks') }} · {{ midi.melody_note_count || 0 }}
            {{ t('midi.melodyNotes') }}
          </span>
        </div>
        <span class="queue-duration">{{ formatDuration(midi.duration_ms) }}</span>
      </button>
    </div>
  </Drawer>
</template>

<style scoped>
.queue-title-wrap {
  @apply flex min-w-0 items-center gap-3;
}

.queue-title-icon {
  width: 22px;
  height: 22px;
  color: var(--color-primary-active);
}

.queue-title {
  @apply truncate text-base font-semibold;
  color: var(--color-foreground);
}

.queue-subtitle {
  @apply truncate text-xs;
  color: var(--color-muted);
}

.drawer-close-btn {
  @apply h-9 w-9 rounded-lg;
}

.drawer-close-icon {
  width: 18px;
  height: 18px;
  stroke-width: 2.35;
}

.queue-list {
  @apply flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-3;
}

.queue-item {
  @apply flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left;
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

:global(.play-queue-drawer .ant-drawer-content) {
  background: var(--bg-white-95);
}

:global(.play-queue-drawer .ant-drawer-header) {
  border-bottom-color: var(--border-primary-15);
}

:global(.play-queue-drawer .ant-drawer-body) {
  min-height: 0;
  padding: 0;
}
</style>
