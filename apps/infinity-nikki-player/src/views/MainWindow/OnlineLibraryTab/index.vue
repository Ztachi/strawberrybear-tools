<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Download, Play, RefreshCw, Search, Square } from 'lucide-vue-next'
import { feedback as toast } from '@/lib/feedback'
import { playMidi, stopPreview } from '@/lib/midiPlayer'
import {
  downloadOnlineMidiSongFile,
  fetchOnlineMidiSongs,
  ONLINE_MIDI_DIFFICULTY_TYPES,
  ONLINE_MIDI_GENRE_TYPES,
  ONLINE_MIDI_SOURCE_TYPES,
  type OnlineMidiSong,
} from '@/lib/onlineMidiLibraryApi'
import { usePlayerStore } from '@/stores/player'

const { t } = useI18n()
const router = useRouter()
const playerStore = usePlayerStore()

const songs = ref<OnlineMidiSong[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
const previewLoadingId = ref<string | null>(null)
const importLoadingId = ref<string | null>(null)
const currentPreviewId = ref<string | null>(null)
const pagination = reactive({
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
})
const filters = reactive({
  keyword: '',
  genreType: '',
  sourceType: '',
  difficultyType: '',
})

const downloadedFiles = new Map<string, Uint8Array>()
let keywordTimer: number | undefined
let previewEndTimer: number | undefined

const hasFilters = computed(
  () => filters.keyword || filters.genreType || filters.sourceType || filters.difficultyType
)

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
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

function labelFor(group: 'genre' | 'source' | 'difficulty', value: string) {
  if (!value) return '--'
  const key = `onlineLibrary.${group}.${value}`
  const label = t(key)
  return label === key ? value : label
}

async function loadSongs() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const result = await fetchOnlineMidiSongs({
      ...filters,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    songs.value = result.list
    pagination.page = result.pagination.page
    pagination.pageSize = result.pagination.pageSize
    pagination.total = result.pagination.total
    pagination.totalPages = Math.max(1, result.pagination.totalPages)
  } catch (error) {
    errorMessage.value = describeError(error)
  } finally {
    isLoading.value = false
  }
}

function scheduleKeywordSearch() {
  window.clearTimeout(keywordTimer)
  keywordTimer = window.setTimeout(() => {
    pagination.page = 1
    void loadSongs()
  }, 320)
}

function resetFilters() {
  filters.keyword = ''
  filters.genreType = ''
  filters.sourceType = ''
  filters.difficultyType = ''
  pagination.page = 1
  void loadSongs()
}

async function getSongBytes(song: OnlineMidiSong) {
  const cached = downloadedFiles.get(song.id)
  if (cached) return cached

  const bytes = await downloadOnlineMidiSongFile(song.id)
  downloadedFiles.set(song.id, bytes)
  return bytes
}

async function stopOnlinePreview() {
  window.clearTimeout(previewEndTimer)
  previewEndTimer = undefined
  currentPreviewId.value = null
  stopPreview()
  await playerStore.stopPreviewPlayback().catch(() => undefined)
}

async function togglePreview(song: OnlineMidiSong) {
  if (currentPreviewId.value === song.id) {
    await stopOnlinePreview()
    return
  }

  previewLoadingId.value = song.id
  try {
    await stopOnlinePreview()
    const bytes = await getSongBytes(song)
    await playMidi(toArrayBuffer(bytes), 1)
    currentPreviewId.value = song.id

    const fallbackDuration = 60_000
    previewEndTimer = window.setTimeout(
      () => {
        if (currentPreviewId.value === song.id) {
          currentPreviewId.value = null
        }
      },
      Math.max(song.durationMs || fallbackDuration, 1000) + 800
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
  importLoadingId.value = song.id
  try {
    await stopOnlinePreview()
    const bytes = await getSongBytes(song)
    const filename = song.downloadFilename || `${song.title || song.id}.mid`
    const imported = await playerStore.importMidiBuffer(filename, bytes, { autoSelect: true })
    if (imported) {
      toast.success(t('onlineLibrary.feedback.imported'), { richColors: true })
      await router.push({ name: 'files-all' })
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

function gotoPage(page: number) {
  const nextPage = Math.min(Math.max(1, page), pagination.totalPages)
  if (nextPage === pagination.page) return
  pagination.page = nextPage
  void loadSongs()
}

watch(
  () => [filters.genreType, filters.sourceType, filters.difficultyType],
  () => {
    pagination.page = 1
    void loadSongs()
  }
)

onMounted(() => {
  void loadSongs()
})

onUnmounted(() => {
  window.clearTimeout(keywordTimer)
  void stopOnlinePreview()
})
</script>

<template>
  <div class="online-library">
    <div class="online-toolbar">
      <label class="search-field">
        <Search class="search-icon" />
        <input
          v-model="filters.keyword"
          type="search"
          :placeholder="t('onlineLibrary.searchPlaceholder')"
          @input="scheduleKeywordSearch"
        />
      </label>

      <select
        v-model="filters.genreType"
        class="filter-select"
        :aria-label="t('onlineLibrary.filters.genre')"
      >
        <option value="">
          {{ t('onlineLibrary.filters.allGenres') }}
        </option>
        <option v-for="genre in ONLINE_MIDI_GENRE_TYPES" :key="genre" :value="genre">
          {{ labelFor('genre', genre) }}
        </option>
      </select>

      <select
        v-model="filters.difficultyType"
        class="filter-select"
        :aria-label="t('onlineLibrary.filters.difficulty')"
      >
        <option value="">
          {{ t('onlineLibrary.filters.allDifficulties') }}
        </option>
        <option
          v-for="difficulty in ONLINE_MIDI_DIFFICULTY_TYPES"
          :key="difficulty"
          :value="difficulty"
        >
          {{ labelFor('difficulty', difficulty) }}
        </option>
      </select>

      <select
        v-model="filters.sourceType"
        class="filter-select"
        :aria-label="t('onlineLibrary.filters.source')"
      >
        <option value="">
          {{ t('onlineLibrary.filters.allSources') }}
        </option>
        <option v-for="source in ONLINE_MIDI_SOURCE_TYPES" :key="source" :value="source">
          {{ labelFor('source', source) }}
        </option>
      </select>

      <button v-if="hasFilters" type="button" class="text-button" @click="resetFilters">
        {{ t('actions.clear') }}
      </button>

      <button
        type="button"
        class="icon-button"
        :title="t('onlineLibrary.refresh')"
        :aria-label="t('onlineLibrary.refresh')"
        :disabled="isLoading"
        @click="loadSongs"
      >
        <RefreshCw :class="{ spinning: isLoading }" />
      </button>
    </div>

    <div v-if="errorMessage" class="state-panel">
      <p class="state-title">
        {{ t('onlineLibrary.feedback.loadFailed') }}
      </p>
      <p class="state-text">
        {{ errorMessage }}
      </p>
      <button type="button" class="primary-button" @click="loadSongs">
        <RefreshCw />
        {{ t('onlineLibrary.retry') }}
      </button>
    </div>

    <div v-else-if="isLoading && songs.length === 0" class="state-panel">
      <p class="state-title">
        {{ t('onlineLibrary.loading') }}
      </p>
    </div>

    <div v-else-if="songs.length === 0" class="state-panel">
      <p class="state-title">
        {{ t('onlineLibrary.empty') }}
      </p>
    </div>

    <template v-else>
      <div class="song-grid" :class="{ 'is-refreshing': isLoading }">
        <article v-for="song in songs" :key="song.id" class="song-card">
          <div class="song-card-head">
            <div class="song-title-group">
              <h3 :title="song.title">
                {{ song.title }}
              </h3>
              <p :title="song.authorName || t('onlineLibrary.unknownAuthor')">
                {{ song.authorName || t('onlineLibrary.unknownAuthor') }}
              </p>
            </div>
            <span class="difficulty-chip">
              {{ labelFor('difficulty', song.difficultyType) }}
            </span>
          </div>

          <p v-if="song.description" class="song-description">
            {{ song.description }}
          </p>

          <div class="metadata-row">
            <span>{{ formatDuration(song.durationMs) }}</span>
            <span>{{ t('onlineLibrary.trackCount', { count: song.trackCount || 0 }) }}</span>
            <span>{{ t('onlineLibrary.noteCount', { count: song.noteCount || 0 }) }}</span>
            <span>{{ formatFileSize(song.fileSize) }}</span>
          </div>

          <div class="tag-row">
            <span v-for="genre in song.genreTypes" :key="genre" class="tag-chip">
              {{ labelFor('genre', genre) }}
            </span>
            <span class="tag-chip muted">{{ labelFor('source', song.sourceType) }}</span>
            <span class="tag-chip muted">{{ formatDate(song.entryDate) }}</span>
          </div>

          <div v-if="song.tags.length > 0" class="tag-row compact">
            <span v-for="tag in song.tags.slice(0, 4)" :key="tag" class="plain-tag">{{ tag }}</span>
          </div>

          <div class="song-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="previewLoadingId === song.id || importLoadingId === song.id"
              @click="togglePreview(song)"
            >
              <Square v-if="currentPreviewId === song.id" />
              <Play v-else />
              {{
                currentPreviewId === song.id
                  ? t('player.stopPreview')
                  : previewLoadingId === song.id
                    ? t('onlineLibrary.loading')
                    : t('player.preview')
              }}
            </button>
            <button
              type="button"
              class="primary-button"
              :disabled="importLoadingId === song.id || previewLoadingId === song.id"
              @click="importSong(song)"
            >
              <Download />
              {{ importLoadingId === song.id ? t('onlineLibrary.importing') : t('songList.actions.import') }}
            </button>
          </div>
        </article>
      </div>

      <div v-if="pagination.totalPages > 1" class="pagination-bar">
        <button
          type="button"
          class="text-button"
          :disabled="pagination.page <= 1"
          @click="gotoPage(pagination.page - 1)"
        >
          {{ t('onlineLibrary.prev') }}
        </button>
        <span
          >{{ t('onlineLibrary.pageInfo', { page: pagination.page, total: pagination.totalPages }) }}</span
        >
        <button
          type="button"
          class="text-button"
          :disabled="pagination.page >= pagination.totalPages"
          @click="gotoPage(pagination.page + 1)"
        >
          {{ t('onlineLibrary.next') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.online-library {
  @apply flex min-h-full flex-col gap-4 pb-6;
}

.online-toolbar {
  @apply grid items-center gap-2;
  grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(130px, 0.45fr)) auto auto;
}

.search-field,
.filter-select,
.icon-button,
.text-button,
.primary-button,
.secondary-button {
  height: 34px;
  border: 1px solid var(--border-primary-20);
  background: var(--bg-white-80);
  color: var(--color-foreground);
}

.search-field {
  @apply flex items-center gap-2 rounded-xl px-3;
}

.search-field input {
  @apply min-w-0 flex-1 bg-transparent text-sm outline-none;
}

.search-icon {
  width: 16px;
  height: 16px;
  color: var(--color-muted-dark);
}

.filter-select {
  @apply rounded-xl px-3 text-sm outline-none;
}

.icon-button,
.text-button,
.primary-button,
.secondary-button {
  @apply inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition;
}

.icon-button {
  width: 34px;
  padding: 0;
}

.icon-button svg,
.primary-button svg,
.secondary-button svg {
  width: 16px;
  height: 16px;
  stroke-width: 2.3;
}

.text-button:hover,
.icon-button:hover,
.secondary-button:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.primary-button {
  border-color: transparent;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-white);
}

.primary-button:disabled,
.secondary-button:disabled,
.text-button:disabled,
.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.state-panel {
  @apply flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center;
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

.song-grid {
  @apply grid gap-3;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.song-grid.is-refreshing {
  opacity: 0.72;
}

.song-card {
  @apply flex min-h-[230px] flex-col gap-3 rounded-xl p-4;
  border: 1px solid rgba(214, 94, 143, 0.16);
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 12px 32px rgba(201, 67, 127, 0.08);
}

.song-card-head {
  @apply flex items-start justify-between gap-3;
}

.song-title-group {
  @apply min-w-0 flex-1;
}

.song-title-group h3 {
  @apply line-clamp-2 text-base font-semibold leading-6;
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
  @apply line-clamp-2 min-h-[40px] text-sm leading-5;
}

.difficulty-chip,
.tag-chip,
.plain-tag {
  @apply inline-flex shrink-0 items-center rounded-full text-xs;
}

.difficulty-chip {
  @apply px-2.5 py-1 font-semibold;
  background: rgba(74, 144, 226, 0.13);
  color: #2563a8;
}

.metadata-row {
  @apply grid gap-2 text-xs;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metadata-row span {
  @apply truncate rounded-lg px-2 py-1;
  background: rgba(255, 255, 255, 0.66);
}

.tag-row {
  @apply flex flex-wrap gap-1.5;
}

.tag-row.compact {
  @apply min-h-[22px];
}

.tag-chip {
  @apply px-2 py-1 font-medium;
  background: var(--bg-primary-15);
  color: var(--color-primary-active);
}

.tag-chip.muted {
  background: rgba(95, 118, 137, 0.1);
  color: var(--color-muted-dark);
}

.plain-tag {
  @apply px-2 py-0.5;
  background: rgba(255, 255, 255, 0.58);
}

.song-actions {
  @apply mt-auto grid gap-2;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.pagination-bar {
  @apply flex items-center justify-center gap-4 py-2 text-sm;
  color: var(--color-muted-dark);
}

.spinning {
  animation: spin 0.9s linear infinite;
}

@media (max-width: 920px) {
  .online-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .search-field {
    grid-column: 1 / -1;
  }
}

@media (max-width: 620px) {
  .online-toolbar,
  .song-actions {
    grid-template-columns: 1fr;
  }

  .icon-button {
    width: 100%;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
