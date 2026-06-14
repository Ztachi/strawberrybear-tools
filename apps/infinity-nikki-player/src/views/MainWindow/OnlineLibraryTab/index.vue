<script setup lang="ts">
/**
 * @description: 在线曲库 - 列表 + 过滤 + 试听/导入
 * @description 全部交互组件走 antdv-next（Input / Select / Button / Tooltip），不再使用原生 HTML。
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button, Empty, Input, Pagination, Select, SelectOption, Spin, Tooltip } from 'antdv-next'
import { Download, Info, Play, RefreshCw, Square } from 'lucide-vue-next'
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
  genreType: undefined as string | undefined,
  sourceType: undefined as string | undefined,
  difficultyType: undefined as string | undefined,
})

/** 已下载文件的内存缓存，跨试听/导入复用。 */
const downloadedFiles = new Map<string, Uint8Array>()
/** 防抖用的关键字搜索定时器。 */
let keywordTimer: number | undefined
/** 试听结束自动停止的定时器。 */
let previewEndTimer: number | undefined

const hasFilters = computed(
  () =>
    Boolean(filters.keyword.trim()) ||
    Boolean(filters.genreType) ||
    Boolean(filters.sourceType) ||
    Boolean(filters.difficultyType)
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

/**
 * @description: 将字段值展示为本地化的展示文案（无对应 key 时回退原值）
 * @description 集中管理 5 个枚举（曲风 / 来源 / 难度 / 版权）的标签查找逻辑。
 * @param {'genre' | 'source' | 'difficulty' | 'license'} group - 枚举分组
 * @param {string} value - 原始枚举值
 * @return {string} 展示文案
 */
function labelFor(
  group: 'genre' | 'source' | 'difficulty' | 'license',
  value: string
): string {
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
      keyword: filters.keyword.trim() || undefined,
      genreType: filters.genreType,
      sourceType: filters.sourceType,
      difficultyType: filters.difficultyType,
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
  filters.genreType = undefined
  filters.sourceType = undefined
  filters.difficultyType = undefined
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

/**
 * @description: 跳转到在线歌曲详情页
 * @param {OnlineMidiSong} song - 当前歌曲
 * @return {void}
 */
function openSongDetail(song: OnlineMidiSong) {
  void router.push({ name: 'online-library-song-detail', params: { id: song.id } })
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
    <!-- 工具栏：搜索 + 三个过滤下拉 + 清空 + 刷新，全部走 antdv-next -->
    <div class="online-toolbar">
      <Input
        v-model:value="filters.keyword"
        :placeholder="t('onlineLibrary.searchPlaceholder')"
        allow-clear
        class="toolbar-search"
        @input="scheduleKeywordSearch"
      />

      <Select
        v-model:value="filters.genreType"
        :placeholder="t('onlineLibrary.filters.allGenres')"
        :aria-label="t('onlineLibrary.filters.genre')"
        allow-clear
        class="toolbar-select"
      >
        <SelectOption v-for="genre in ONLINE_MIDI_GENRE_TYPES" :key="genre" :value="genre">
          {{ labelFor('genre', genre) }}
        </SelectOption>
      </Select>

      <Select
        v-model:value="filters.difficultyType"
        :placeholder="t('onlineLibrary.filters.allDifficulties')"
        :aria-label="t('onlineLibrary.filters.difficulty')"
        allow-clear
        class="toolbar-select"
      >
        <SelectOption
          v-for="difficulty in ONLINE_MIDI_DIFFICULTY_TYPES"
          :key="difficulty"
          :value="difficulty"
        >
          {{ labelFor('difficulty', difficulty) }}
        </SelectOption>
      </Select>

      <Select
        v-model:value="filters.sourceType"
        :placeholder="t('onlineLibrary.filters.allSources')"
        :aria-label="t('onlineLibrary.filters.source')"
        allow-clear
        class="toolbar-select"
      >
        <SelectOption v-for="source in ONLINE_MIDI_SOURCE_TYPES" :key="source" :value="source">
          {{ labelFor('source', source) }}
        </SelectOption>
      </Select>

      <Button v-if="hasFilters" @click="resetFilters">
        {{ t('actions.clear') }}
      </Button>

      <Tooltip :title="t('onlineLibrary.refresh')" placement="bottom">
        <Button
          shape="circle"
          :aria-label="t('onlineLibrary.refresh')"
          :disabled="isLoading"
          @click="loadSongs"
        >
          <template #icon>
            <RefreshCw :class="{ spinning: isLoading }" />
          </template>
        </Button>
      </Tooltip>
    </div>

    <!-- 错误状态：显示错误信息和重试按钮 -->
    <div v-if="errorMessage" class="state-panel">
      <p class="state-title">
        {{ t('onlineLibrary.feedback.loadFailed') }}
      </p>
      <p class="state-text">
        {{ errorMessage }}
      </p>
      <Button type="primary" @click="loadSongs">
        <template #icon>
          <RefreshCw />
        </template>
        {{ t('onlineLibrary.retry') }}
      </Button>
    </div>

    <!-- 加载中（首次） -->
    <div v-else-if="isLoading && songs.length === 0" class="state-panel">
      <Spin />
      <p class="state-title">
        {{ t('onlineLibrary.loading') }}
      </p>
    </div>

    <!-- 空状态：使用 antdv-next Empty 统一风格 -->
    <div v-else-if="songs.length === 0" class="state-panel">
      <Empty :description="t('onlineLibrary.empty')" />
    </div>

    <template v-else>
      <!-- 列表刷新时保留旧数据，但加 dim 效果 -->
      <div class="song-grid" :class="{ 'is-refreshing': isLoading }">
        <article v-for="song in songs" :key="song.id" class="song-card">
          <div class="song-card-head">
            <div class="song-title-group">
              <Tooltip :title="song.title">
                <h3>{{ song.title }}</h3>
              </Tooltip>
              <Tooltip :title="song.authorName || t('onlineLibrary.unknownAuthor')">
                <p>{{ song.authorName || t('onlineLibrary.unknownAuthor') }}</p>
              </Tooltip>
            </div>
            <span class="difficulty-chip">
              {{ labelFor('difficulty', song.difficultyType) }}
            </span>
          </div>

          <!-- 描述仅截断 2 行展示，完整内容跳转详情页查看 -->
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
            <Button
              :disabled="previewLoadingId === song.id || importLoadingId === song.id"
              @click="togglePreview(song)"
            >
              <template #icon>
                <Square v-if="currentPreviewId === song.id" />
                <Play v-else />
              </template>
              {{
                currentPreviewId === song.id
                  ? t('player.stopPreview')
                  : previewLoadingId === song.id
                    ? t('onlineLibrary.loading')
                    : t('player.preview')
              }}
            </Button>
            <Button
              type="primary"
              :disabled="importLoadingId === song.id || previewLoadingId === song.id"
              @click="importSong(song)"
            >
              <template #icon>
                <Download />
              </template>
              {{
                importLoadingId === song.id
                  ? t('onlineLibrary.importing')
                  : t('songList.actions.import')
              }}
            </Button>
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
        </article>
      </div>

      <Pagination
        v-if="pagination.totalPages > 1"
        class="pagination-bar"
        :current="pagination.page"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        :show-size-changer="false"
        @change="gotoPage"
      />
    </template>
  </div>
</template>

<style scoped>
.online-library {
  @apply flex min-h-full flex-col gap-4 pb-6;
}

.online-toolbar {
  @apply flex flex-wrap items-center gap-2;
}

.toolbar-search {
  @apply min-w-[220px] flex-1;
}

.toolbar-select {
  width: 160px;
}

.spinning {
  animation: spin 0.9s linear infinite;
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
  @apply mt-auto flex items-center gap-2;
}

.song-actions > :first-child,
.song-actions > :nth-child(2) {
  @apply flex-1;
}

.pagination-bar {
  @apply flex items-center justify-center pt-2;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
