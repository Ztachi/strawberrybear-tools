<script setup lang="ts">
/**
 * @description: 在线曲库 - 本地缓存优先 + 虚拟滚动列表。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { Button, Empty, Input, Spin, Tooltip } from 'antdv-next'
import { Check, Download, Info, Play, RefreshCw, Square } from 'lucide-vue-next'
import { feedback as toast } from '@/lib/feedback'
import {
  downloadOnlineMidiSongFile,
  type OnlineMidiSong,
} from '@/lib/onlineMidiLibraryApi'
import { sanitizeMidiFilename, stripMidiExtension } from '@/lib/midiDisplay'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { useOnlineMidiLibraryStore } from '@/stores/onlineMidiLibrary'
import { usePlayerStore, type OnlineMidiMetadata } from '@/stores/player'
import type { FloatingActionRegistration } from '@/stores/mainWindowUi'
import type { MidiInfo } from '@/types'

const { t } = useI18n()
const router = useRouter()
const mainWindowUiStore = useMainWindowUiStore()
const onlineStore = useOnlineMidiLibraryStore()
const playerStore = usePlayerStore()

const GRID_COLUMN_COUNT = 2
const CARD_HEIGHT = 324
const CARD_GAP = 16
const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP
const SCROLL_THRESHOLD = 200

const viewportRef = ref<HTMLElement | null>(null)
const previewLoadingId = ref<string | null>(null)
const importLoadingId = ref<string | null>(null)
const shouldRestoreOnUnmount = ref(true)

const downloadedFiles = new Map<string, Uint8Array>()
let resizeObserver: ResizeObserver | null = null
let backToTopRegistration: FloatingActionRegistration | null = null

const songs = computed(() => onlineStore.filteredSongs)
const filters = onlineStore.filters
const isInitialLoading = computed(() => onlineStore.isSyncing && !onlineStore.hasCache)
const virtualRowsCount = computed(() => Math.ceil(songs.value.length / GRID_COLUMN_COUNT))
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: virtualRowsCount.value,
    getScrollElement: () => viewportRef.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  }))
)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${GRID_COLUMN_COUNT}, minmax(0, 1fr))`,
  gap: `${CARD_GAP}px`,
}))

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function displaySongTitle(song: OnlineMidiSong) {
  return stripMidiExtension(song.title || song.downloadFilename || song.originalFilename || song.id)
}

function displaySongAuthor(song: OnlineMidiSong) {
  return song.authorName?.trim() || t('onlineLibrary.unknownAuthor')
}

function getSongMetadata(song: OnlineMidiSong): OnlineMidiMetadata {
  return {
    title: displaySongTitle(song),
    authorName: song.authorName,
    description: song.description,
    onlineSongId: song.id,
    onlineSha256: song.sha256,
  }
}

function formatDuration(ms: number) {
  if (!ms || ms < 0) return '--'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatFileSize(bytes: number) {
  if (!bytes || bytes < 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ms: number) {
  if (!ms) return '--'
  return new Date(ms).toLocaleDateString()
}

function formatSyncTime(ms: number | null) {
  if (!ms) return ''
  return t('onlineLibrary.syncedAt', { time: new Date(ms).toLocaleString() })
}

function labelFor(
  group: 'genre' | 'source' | 'difficulty' | 'license',
  value: string
): string {
  if (!value) return '--'
  const key = `onlineLibrary.${group}.${value}`
  const label = t(key)
  return label === key ? value : label
}

function getRowSongs(rowIndex: number) {
  const start = rowIndex * GRID_COLUMN_COUNT
  return songs.value.slice(start, start + GRID_COLUMN_COUNT)
}

function findImportedMidi(song: OnlineMidiSong): MidiInfo | null {
  return (
    playerStore.midiLibrary.find((midi) => {
      if (midi.online_song_id && midi.online_song_id === song.id) return true
      if (midi.online_sha256 && song.sha256 && midi.online_sha256 === song.sha256) return true
      return false
    }) ?? null
  )
}

function isSongPlaying(song: OnlineMidiSong) {
  if (
    playerStore.currentTemporaryOnlineSongId === song.id &&
    playerStore.currentMidi?.online_song_id === song.id
  ) {
    return playerStore.isPreviewPlaying || playerStore.isPreviewPaused
  }
  const imported = findImportedMidi(song)
  return imported ? playerStore.getSongPlaybackState(imported.filename) !== 'idle' : false
}

async function getSongBytes(song: OnlineMidiSong) {
  const cached = downloadedFiles.get(song.id)
  if (cached) return cached
  const bytes = await downloadOnlineMidiSongFile(song.id)
  downloadedFiles.set(song.id, bytes)
  return bytes
}

async function syncLibrary() {
  const ok = await onlineStore.syncAllSongs()
  if (!ok && onlineStore.errorMessage) {
    toast.error(t('onlineLibrary.feedback.loadFailed'), {
      description: onlineStore.errorMessage,
      richColors: true,
    })
  }
}

function clearHiddenFilters() {
  filters.genreType = undefined
  filters.sourceType = undefined
  filters.difficultyType = undefined
}

function observeViewport(element: HTMLElement | null) {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!element) return

  resizeObserver = new ResizeObserver(() => {
    rowVirtualizer.value.measure()
  })
  resizeObserver.observe(element)
  void nextTick(() => {
    rowVirtualizer.value.measure()
  })
}

function handleScroll(): void {
  backToTopRegistration?.setVisible((viewportRef.value?.scrollTop ?? 0) > SCROLL_THRESHOLD)
}

function scrollToTop(): void {
  viewportRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function togglePlay(song: OnlineMidiSong) {
  if (isSongPlaying(song)) {
    if (playerStore.currentTemporaryOnlineSongId === song.id) {
      await playerStore.restoreTemporaryOnlinePreview()
    } else {
      await playerStore.stopPreviewPlayback()
    }
    return
  }

  previewLoadingId.value = song.id
  try {
    const imported = findImportedMidi(song)
    if (imported) {
      if (playerStore.currentTemporaryOnlineSongId) {
        await playerStore.restoreTemporaryOnlinePreview()
      }
      await playerStore.playMidiInQueue(imported, playerStore.midiLibrary, {
        id: 'all',
        title: t('songList.allSongs'),
      })
      return
    }

    const bytes = await getSongBytes(song)
    await playerStore.playTemporaryMidiBuffer(
      sanitizeMidiFilename(displaySongTitle(song) || song.downloadFilename || song.id),
      bytes,
      getSongMetadata(song)
    )
  } catch (error) {
    toast.error(t('onlineLibrary.feedback.previewFailed'), {
      description: describeError(error),
      richColors: true,
    })
  } finally {
    previewLoadingId.value = null
  }
}

async function importSong(song: OnlineMidiSong) {
  if (findImportedMidi(song)) return
  importLoadingId.value = song.id
  try {
    const bytes = await getSongBytes(song)
    const imported = await playerStore.importMidiBuffer(
      sanitizeMidiFilename(displaySongTitle(song) || song.downloadFilename || song.id),
      bytes,
      { autoSelect: false, metadata: getSongMetadata(song) }
    )
    if (imported) {
      toast.success(t('onlineLibrary.feedback.imported'), { richColors: true })
      const importedMidi = findImportedMidi(song)
      if (importedMidi && playerStore.currentTemporaryOnlineSongId === song.id) {
        await playerStore.replaceTemporaryOnlinePreviewWithLocal(
          importedMidi,
          playerStore.midiLibrary,
          { id: 'all', title: t('songList.allSongs') }
        )
      }
    }
  } catch (error) {
    toast.error(t('onlineLibrary.feedback.importFailed'), {
      description: describeError(error),
      richColors: true,
    })
  } finally {
    importLoadingId.value = null
  }
}

function openSongDetail(song: OnlineMidiSong) {
  void router.push({ name: 'online-library-song-detail', params: { id: song.id } })
}

watch(
  () => songs.value.length,
  () => {
    void nextTick(() => {
      rowVirtualizer.value.measure()
      rowVirtualizer.value.scrollToIndex(0)
    })
  }
)

watch(viewportRef, observeViewport, { immediate: true })

onMounted(() => {
  clearHiddenFilters()
  backToTopRegistration = mainWindowUiStore.registerBackToTop(scrollToTop)
  handleScroll()
  void onlineStore.ensureReady()
})

onBeforeRouteLeave((to) => {
  shouldRestoreOnUnmount.value =
    to.name !== 'online-library' && to.name !== 'online-library-song-detail'
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  backToTopRegistration?.()
  backToTopRegistration = null
  if (shouldRestoreOnUnmount.value) {
    void playerStore.restoreTemporaryOnlinePreview()
  }
})
</script>

<template>
  <div class="online-library">
    <div class="online-toolbar">
      <Input
        v-model:value="filters.keyword"
        :placeholder="t('onlineLibrary.searchPlaceholder')"
        allow-clear
        class="toolbar-search"
      />

      <Tooltip :title="t('onlineLibrary.sync')" placement="bottom">
        <Button
          shape="circle"
          :aria-label="t('onlineLibrary.sync')"
          :disabled="onlineStore.isSyncing"
          @click="syncLibrary"
        >
          <template #icon>
            <RefreshCw :class="{ spinning: onlineStore.isSyncing }" />
          </template>
        </Button>
      </Tooltip>

      <span v-if="onlineStore.syncedAt" class="sync-time">
        {{ formatSyncTime(onlineStore.syncedAt) }}
      </span>
    </div>

    <div v-if="onlineStore.errorMessage && songs.length > 0" class="inline-error">
      {{ onlineStore.errorMessage }}
    </div>

    <div
      v-if="onlineStore.errorMessage && songs.length === 0 && !isInitialLoading"
      class="state-panel"
    >
      <p class="state-title">
        {{ t('onlineLibrary.feedback.loadFailed') }}
      </p>
      <p class="state-text">
        {{ onlineStore.errorMessage }}
      </p>
      <Button type="primary" @click="syncLibrary">
        <template #icon>
          <RefreshCw />
        </template>
        {{ t('onlineLibrary.retry') }}
      </Button>
    </div>

    <div v-else-if="isInitialLoading" class="state-panel">
      <Spin />
      <p class="state-title">
        {{ t('onlineLibrary.loading') }}
      </p>
    </div>

    <div v-else-if="songs.length === 0" class="state-panel">
      <Empty :description="t('onlineLibrary.empty')" />
    </div>

    <div v-else ref="viewportRef" class="virtual-scroll" @scroll="handleScroll">
      <div class="virtual-canvas" :style="{ height: `${totalSize}px` }">
        <div
          v-for="virtualRow in virtualRows"
          :key="String(virtualRow.key)"
          class="virtual-row"
          :style="{ transform: `translateY(${virtualRow.start}px)` }"
        >
          <div class="song-grid-row" :style="gridStyle">
            <article v-for="song in getRowSongs(virtualRow.index)" :key="song.id" class="song-card">
              <div class="song-card-head">
                <div class="song-title-group">
                  <Tooltip :title="displaySongTitle(song)">
                    <h3>{{ displaySongTitle(song) }}</h3>
                  </Tooltip>
                  <Tooltip :title="displaySongAuthor(song)">
                    <p>{{ displaySongAuthor(song) }}</p>
                  </Tooltip>
                </div>
                <Tooltip :title="t('onlineLibrary.detail.actions.detail')" placement="top">
                  <Button
                    shape="circle"
                    :aria-label="t('onlineLibrary.detail.actions.detail')"
                    @click="openSongDetail(song)"
                  >
                    <template #icon>
                      <Info />
                    </template>
                  </Button>
                </Tooltip>
              </div>

              <Tooltip v-if="song.description" :title="song.description" placement="topLeft">
                <p class="song-description">
                  {{ song.description }}
                </p>
              </Tooltip>
              <p v-else class="song-description muted">
                {{ t('onlineLibrary.detail.noDescription') }}
              </p>

              <div class="metadata-row">
                <span>{{ formatDuration(song.durationMs) }}</span>
                <span>{{ t('onlineLibrary.trackCount', { count: song.trackCount || 0 }) }}</span>
                <span>{{ t('onlineLibrary.noteCount', { count: song.noteCount || 0 }) }}</span>
                <span>{{ formatFileSize(song.fileSize) }}</span>
              </div>

              <div class="tag-row">
                <span
                  v-for="genre in song.genreTypes.slice(0, 2)"
                  :key="genre"
                  class="tag-chip genre-tag"
                >
                  {{ labelFor('genre', genre) }}
                </span>
                <span class="tag-chip source-tag">{{ labelFor('source', song.sourceType) }}</span>
                <span class="tag-chip date-tag">{{ formatDate(song.entryDate) }}</span>
              </div>

              <div class="tag-row compact">
                <span v-for="tag in song.tags.slice(0, 3)" :key="tag" class="plain-tag">
                  {{ tag }}
                </span>
              </div>

              <div class="song-actions">
                <Button
                  :disabled="previewLoadingId === song.id || importLoadingId === song.id"
                  @click="togglePlay(song)"
                >
                  <template #icon>
                    <Square v-if="isSongPlaying(song)" />
                    <Play v-else />
                  </template>
                  {{
                    isSongPlaying(song)
                      ? t('onlineLibrary.stopPlaying')
                      : previewLoadingId === song.id
                        ? t('onlineLibrary.loading')
                        : t('onlineLibrary.play')
                  }}
                </Button>
                <Button
                  type="primary"
                  :disabled="Boolean(findImportedMidi(song)) || importLoadingId === song.id"
                  @click="importSong(song)"
                >
                  <template #icon>
                    <Check v-if="findImportedMidi(song)" />
                    <Download v-else />
                  </template>
                  {{
                    findImportedMidi(song)
                      ? t('onlineLibrary.imported')
                      : importLoadingId === song.id
                        ? t('onlineLibrary.importing')
                        : t('songList.actions.import')
                  }}
                </Button>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.online-library {
  @apply flex h-full min-h-0 flex-col gap-3 pb-4;
}

.online-toolbar {
  @apply flex shrink-0 items-center gap-3;
}

.toolbar-search {
  width: 370px;
  max-width: 44vw;
}

.sync-time {
  @apply whitespace-nowrap text-xs;
  color: var(--color-muted-dark);
}

.spinning {
  animation: spin 0.9s linear infinite;
}

.inline-error {
  @apply rounded-lg px-3 py-2 text-sm;
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
}

.state-panel {
  @apply flex min-h-[280px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center;
  border: 1px dashed var(--border-primary-20);
  background: rgba(255, 255, 255, 0.62);
}

.state-title {
  @apply text-base font-semibold;
  color: var(--color-foreground);
}

.state-text {
  @apply max-w-xl text-sm leading-6;
  color: var(--color-muted-dark);
}

.virtual-scroll {
  @apply min-h-0 flex-1 overflow-auto pr-1;
}

.virtual-canvas {
  @apply relative w-full;
}

.virtual-row {
  @apply absolute left-0 top-0 w-full;
  height: 324px;
}

.song-grid-row {
  @apply grid mb-[16px];
}

.song-card {
  @apply flex justify-between min-w-0 flex-col gap-2.5 overflow-hidden rounded-lg p-5;
  border: 1px solid rgba(214, 94, 143, 0.16);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 10px 26px rgba(201, 67, 127, 0.07);
}

.song-card-head {
  @apply flex items-start justify-between gap-3;
}

.song-title-group {
  @apply min-w-0 flex-1;
}

.song-title-group h3 {
  @apply truncate text-base font-semibold leading-6;
  color: var(--color-foreground);
}

.song-title-group p,
.song-description,
.metadata-row,
.plain-tag {
  color: var(--color-muted-dark);
}

.song-title-group p {
  @apply truncate text-sm;
}

.song-description {
  @apply line-clamp-2 text-sm leading-5;
}

.song-description.muted {
  color: var(--color-muted);
}

.metadata-row {
  @apply grid gap-2 text-xs;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metadata-row span {
  @apply truncate rounded-md px-2 py-1;
  background: rgba(255, 255, 255, 0.66);
}

.tag-row {
  @apply flex flex-wrap gap-1.5;
}

.tag-chip,
.plain-tag {
  @apply inline-flex max-w-full shrink-0 items-center truncate rounded-full px-2 py-1 text-xs;
}

.genre-tag {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.source-tag {
  background: rgba(5, 150, 105, 0.12);
  color: #047857;
}

.date-tag {
  background: rgba(217, 119, 6, 0.12);
  color: #b45309;
}

.plain-tag {
  @apply py-0.5;
  background: var(--color-primary);
  color: white;
}

.song-actions {
  @apply grid shrink-0 grid-cols-2 gap-3 pt-1;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
