<script setup lang="ts">
/**
 * @description: 正常模式右侧常驻全局播放器
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button, Tooltip } from 'antdv-next'
import { Expand, ListMusic, Music2 } from 'lucide-vue-next'
import MarqueeText from '@/components/MarqueeText.vue'
import MusicPlayerCore from '@/components/MusicPlayerCore/index.vue'
import { usePlayerStore } from '@/stores/player'
import PlayQueueDrawer from './PlayQueueDrawer.vue'

const { t } = useI18n()
const router = useRouter()
const playerStore = usePlayerStore()
const queueDrawerOpen = ref(false)

function openCurrentSongDetail(): void {
  const filename = playerStore.currentMidi?.filename
  if (!filename) return
  void router.push({ name: 'files-midi-detail', params: { filename } })
}
</script>

<template>
  <section v-if="playerStore.midiLibrary.length > 0" class="global-music-player">
    <div class="current-song">
      <Tooltip :title="playerStore.currentMidi ? t('player.openSongDetail') : t('player.noMedia')">
        <button
          type="button"
          class="current-cover"
          :disabled="!playerStore.currentMidi"
          @click="openCurrentSongDetail"
        >
          <Music2 class="current-cover-icon" />
          <span class="cover-detail-mask">
            <Expand class="cover-detail-icon" />
          </span>
        </button>
      </Tooltip>
      <div class="current-main">
        <Tooltip :title="playerStore.currentMidi?.filename || t('player.noMedia')">
          <MarqueeText
            class="current-title"
            :text="playerStore.currentMidi?.filename || t('player.noMedia')"
          />
        </Tooltip>
      </div>
    </div>

    <MusicPlayerCore
      class="player-core"
      variant="compact"
      :show-template="false"
      :show-mode-row="false"
    />

    <div class="player-actions">
      <Tooltip :title="t('player.openQueue')">
        <Button type="text" class="queue-btn" @click="queueDrawerOpen = true">
          <template #icon>
            <ListMusic class="queue-btn-icon" />
          </template>
        </Button>
      </Tooltip>
    </div>

    <PlayQueueDrawer v-model:open="queueDrawerOpen" />
  </section>
</template>

<style scoped>
.global-music-player {
  @apply  h-[68px] grid grid-cols-[repeat(3,1fr)] rounded-2xl px-3 py-1;
  background: var(--bg-white-50);
  border: 1px solid var(--border-primary-20);
  box-shadow: 0 16px 48px rgba(201, 67, 127, 0.12);
}

.current-song {
  @apply flex min-w-0 items-center gap-3;
}

.current-cover {
  @apply relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl;
  background: linear-gradient(135deg, var(--bg-primary-15), var(--bg-white-95));
  border: 1px solid var(--border-primary-15);
  color: var(--color-primary-active);
}

.current-cover:disabled {
  cursor: default;
}

.current-cover-icon {
  width: 21px;
  height: 21px;
  stroke-width: 2.25;
}

.cover-detail-mask {
  @apply absolute inset-0 flex items-center justify-center opacity-0 transition-opacity;
  background: rgba(26, 18, 48, 0.52);
  color: white;
}

.current-cover:not(:disabled):hover .cover-detail-mask {
  opacity: 1;
}

.cover-detail-icon {
  width: 20px;
  height: 20px;
  stroke-width: 2.4;
}

.current-main {
  @apply min-w-0 flex-1;
}

.current-title {
  @apply block text-sm font-semibold;
  color: var(--color-foreground);
}

.player-core {
  @apply min-w-0;
}

.player-actions {
  @apply flex items-center justify-center;
}

.queue-btn {
  @apply h-9 w-9 rounded-xl;
  color: var(--color-primary-active);
}

.queue-btn:hover {
  background: var(--bg-primary-10);
}

.queue-btn-icon {
  width: 20px;
  height: 20px;
  stroke-width: 2.25;
}
</style>
