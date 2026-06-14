<script setup lang="ts">
/**
 * @description: 所有歌曲页面
 */
import { useI18n } from 'vue-i18n'
import { inject } from 'vue'
import { Button } from 'antdv-next'
import { Folder, Upload } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { midiImportActionsKey } from '../../importActions'
import SongCollectionView from '../components/SongCollectionView.vue'

const { t } = useI18n()
const playerStore = usePlayerStore()
const importActions = inject(midiImportActionsKey)
</script>

<template>
  <section class="all-songs-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">
          {{ t('songList.allSongs') }}
        </h1>
        <p class="page-subtitle">
          {{ t('songList.totalSongs', { count: playerStore.midiLibrary.length }) }}
        </p>
      </div>
      <div class="page-actions">
        <Button
          size="small"
          color="primary"
          variant="outlined"
          @click="importActions?.selectFile()"
        >
          <template #icon>
            <Upload class="page-action-icon" />
          </template>
          {{ t('actions.selectFile') }}
        </Button>
        <Button
          size="small"
          color="primary"
          variant="outlined"
          @click="importActions?.selectFolder()"
        >
          <template #icon>
            <Folder class="page-action-icon" />
          </template>
          {{ t('actions.selectFolder') }}
        </Button>
      </div>
    </div>

    <SongCollectionView
      type="all"
      :songs="playerStore.midiLibrary"
      :collection-title="t('songList.allSongs')"
    />
  </section>
</template>

<style scoped>
.all-songs-page {
  @apply flex h-full min-h-0 flex-col;
}

.page-header {
  @apply flex shrink-0 items-center justify-between gap-4 pb-2;
}

.page-actions {
  @apply flex shrink-0 items-center gap-2;
}

.page-action-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.25;
}

.page-title {
  @apply text-xl font-semibold;
  color: var(--color-foreground);
}

.page-subtitle {
  @apply mt-1 text-sm;
  color: var(--color-muted);
}
</style>
