<script setup lang="ts">
/**
 * @description: 在线曲库 - 单曲详情页。优先使用在线曲库缓存，缺少单曲缓存时只请求详情接口。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, Popover, Spin, TypographyText } from 'antdv-next'
import { Check, Download, Music2, Play, Square } from 'lucide-vue-next'
import { feedback as toast } from '@/lib/feedback'
import { sanitizeMidiFilename, stripMidiExtension } from '@/lib/midiDisplay'
import {
  downloadOnlineMidiSongFile,
  type OnlineMidiSong,
} from '@/lib/onlineMidiLibraryApi'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { useOnlineMidiLibraryStore } from '@/stores/onlineMidiLibrary'
import { usePlayerStore, type OnlineMidiMetadata } from '@/stores/player'
import type { FloatingActionRegistration } from '@/stores/mainWindowUi'
import type { MidiInfo } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const mainWindowUiStore = useMainWindowUiStore()
const onlineStore = useOnlineMidiLibraryStore()
const playerStore = usePlayerStore()

const SCROLL_THRESHOLD = 200

const song = ref<OnlineMidiSong | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')
const isImporting = ref(false)
const previewLoading = ref(false)
const shouldRestoreOnUnmount = ref(true)
const downloadedFiles = new Map<string, Uint8Array>()
const detailScrollRef = ref<HTMLElement | null>(null)
let backToTopRegistration: FloatingActionRegistration | null = null

const songId = computed(() => String(route.params.id ?? ''))
const descriptionText = computed(() => {
  const desc = song.value?.description?.trim()
  return desc ? desc : t('onlineLibrary.detail.noDescription')
})
const isDescriptionEmpty = computed(() => !song.value?.description?.trim())
const isImported = computed(() => (song.value ? Boolean(findImportedMidi(song.value)) : false))
const isPlaying = computed(() => (song.value ? isSongPlaying(song.value) : false))

const descriptionRef = ref<HTMLElement | null>(null)
const isDescriptionOverflowing = ref(false)
const isDescriptionPopoverOpen = ref(false)
let descriptionResizeObserver: ResizeObserver | null = null

function updateDescriptionOverflow(): void {
  const element = descriptionRef.value
  if (!element) {
    isDescriptionOverflowing.value = false
    isDescriptionPopoverOpen.value = false
    return
  }
  isDescriptionOverflowing.value = element.scrollHeight > element.clientHeight + 1
  if (!isDescriptionOverflowing.value) isDescriptionPopoverOpen.value = false
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function displaySongTitle(target: OnlineMidiSong) {
  return stripMidiExtension(
    target.title || target.downloadFilename || target.originalFilename || target.id
  )
}

function displaySongAuthor(target: OnlineMidiSong) {
  return target.authorName?.trim() || t('onlineLibrary.unknownAuthor')
}

function getSongMetadata(target: OnlineMidiSong): OnlineMidiMetadata {
  return {
    title: displaySongTitle(target),
    authorName: target.authorName,
    description: target.description,
    onlineSongId: target.id,
    onlineSha256: target.sha256,
  }
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

function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '--'
  return new Date(ms).toLocaleString()
}

function formatDate(ms: number | null | undefined): string {
  if (!ms) return '--'
  return new Date(ms).toLocaleDateString()
}

function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes < 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(ms: number | undefined | null): string {
  if (!ms || ms < 0) return '--'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function findImportedMidi(target: OnlineMidiSong): MidiInfo | null {
  return (
    playerStore.midiLibrary.find((midi) => {
      if (midi.online_song_id && midi.online_song_id === target.id) return true
      if (midi.online_sha256 && target.sha256 && midi.online_sha256 === target.sha256) return true
      return false
    }) ?? null
  )
}

function isSongPlaying(target: OnlineMidiSong) {
  if (
    playerStore.currentTemporaryOnlineSongId === target.id &&
    playerStore.currentMidi?.online_song_id === target.id
  ) {
    return playerStore.isPreviewPlaying || playerStore.isPreviewPaused
  }
  const imported = findImportedMidi(target)
  return imported ? playerStore.getSongPlaybackState(imported.filename) !== 'idle' : false
}

async function getSongBytes(target: OnlineMidiSong) {
  const cached = downloadedFiles.get(target.id)
  if (cached) return cached
  const bytes = await downloadOnlineMidiSongFile(target.id)
  downloadedFiles.set(target.id, bytes)
  return bytes
}

async function loadSong(): Promise<void> {
  if (!songId.value) return
  isLoading.value = true
  errorMessage.value = ''
  song.value = null
  try {
    song.value = await onlineStore.fetchSongById(songId.value)
    void nextTick(updateDescriptionOverflow)
  } catch (error) {
    errorMessage.value = describeError(error)
  } finally {
    isLoading.value = false
  }
}

async function togglePlay(): Promise<void> {
  if (!song.value) return
  if (isSongPlaying(song.value)) {
    if (playerStore.currentTemporaryOnlineSongId === song.value.id) {
      await playerStore.restoreTemporaryOnlinePreview()
    } else {
      await playerStore.stopPreviewPlayback()
    }
    return
  }

  previewLoading.value = true
  try {
    const imported = findImportedMidi(song.value)
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

    const bytes = await getSongBytes(song.value)
    await playerStore.playTemporaryMidiBuffer(
      sanitizeMidiFilename(displaySongTitle(song.value) || song.value.downloadFilename || song.value.id),
      bytes,
      getSongMetadata(song.value)
    )
  } catch (error) {
    toast.error(t('onlineLibrary.feedback.previewFailed'), {
      description: describeError(error),
      richColors: true,
    })
  } finally {
    previewLoading.value = false
  }
}

async function importSong(): Promise<void> {
  if (!song.value || findImportedMidi(song.value)) return
  isImporting.value = true
  try {
    const bytes = await getSongBytes(song.value)
    const imported = await playerStore.importMidiBuffer(
      sanitizeMidiFilename(displaySongTitle(song.value) || song.value.downloadFilename || song.value.id),
      bytes,
      { autoSelect: false, metadata: getSongMetadata(song.value) }
    )
    if (imported) {
      toast.success(t('onlineLibrary.feedback.imported'), { richColors: true })
      const importedMidi = findImportedMidi(song.value)
      if (importedMidi && playerStore.currentTemporaryOnlineSongId === song.value.id) {
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
    isImporting.value = false
  }
}

function navigateBack(): void {
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.push({ name: 'online-library' })
}

function handleScroll(): void {
  backToTopRegistration?.setVisible((detailScrollRef.value?.scrollTop ?? 0) > SCROLL_THRESHOLD)
}

function scrollToTop(): void {
  detailScrollRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(songId, () => {
  void loadSong()
})

watch(descriptionText, () => {
  void nextTick(updateDescriptionOverflow)
})

onMounted(() => {
  backToTopRegistration = mainWindowUiStore.registerBackToTop(scrollToTop)
  handleScroll()
  descriptionResizeObserver = new ResizeObserver(updateDescriptionOverflow)
  if (descriptionRef.value) descriptionResizeObserver.observe(descriptionRef.value)
  void loadSong()
})

onBeforeRouteLeave((to) => {
  shouldRestoreOnUnmount.value =
    to.name !== 'online-library' && to.name !== 'online-library-song-detail'
})

onBeforeUnmount(() => {
  descriptionResizeObserver?.disconnect()
  descriptionResizeObserver = null
  backToTopRegistration?.()
  backToTopRegistration = null
  if (shouldRestoreOnUnmount.value) {
    void playerStore.restoreTemporaryOnlinePreview()
  }
})
</script>

<template>
  <section ref="detailScrollRef" class="online-song-detail" @scroll="handleScroll">
    <Spin :spinning="isLoading">
      <section v-if="!song" class="missing-state">
        <Music2 class="missing-icon" />
        <span v-if="!errorMessage">{{ t('onlineLibrary.loading') }}</span>
        <template v-else>
          <span>{{ t('onlineLibrary.detail.notFound') }}</span>
          <span class="missing-tip">{{ t('onlineLibrary.detail.notFoundDescription') }}</span>
          <span class="missing-tip">{{ errorMessage }}</span>
        </template>
        <Button @click="navigateBack">
          {{ t('onlineLibrary.detail.back') }}
        </Button>
      </section>

      <template v-else>
        <header class="detail-header">
          <div class="detail-cover">
            <Music2 class="detail-cover-icon" />
          </div>

          <div class="detail-main">
            <div class="title-row">
              <div class="min-w-0">
                <h1 class="detail-title">
                  {{ displaySongTitle(song) }}
                </h1>
                <p class="detail-author">
                  {{ displaySongAuthor(song) }}
                </p>
              </div>
            </div>

            <div class="description-row">
              <p
                ref="descriptionRef"
                class="detail-description"
                :class="{ muted: isDescriptionEmpty }"
              >
                {{ descriptionText }}
              </p>
              <Popover
                v-if="isDescriptionOverflowing && !isDescriptionEmpty"
                v-model:open="isDescriptionPopoverOpen"
                trigger="click"
                placement="bottom"
                overlay-class-name="online-song-description-popover"
              >
                <template #content>
                  <div class="description-popover-content">
                    {{ descriptionText }}
                  </div>
                </template>
                <button type="button" class="description-detail-link">
                  {{ t('onlineLibrary.detail.actions.detail') }}
                </button>
              </Popover>
            </div>

            <div class="top-tags">
              <span
                v-for="genre in song.genreTypes"
                :key="`genre-${genre}`"
                class="tag-chip genre-tag"
              >
                {{ labelFor('genre', genre) }}
              </span>
              <span class="tag-chip source-tag">{{ labelFor('source', song.sourceType) }}</span>
              <span class="tag-chip date-tag">{{ formatDate(song.entryDate) }}</span>
              <span v-for="tag in song.tags" :key="`tag-${tag}`" class="plain-tag">
                {{ tag }}
              </span>
            </div>

            <div class="detail-actions">
              <Button type="primary" :disabled="previewLoading || isImporting" @click="togglePlay">
                <template #icon>
                  <Square v-if="isPlaying" class="action-icon" />
                  <Play v-else class="action-icon" />
                </template>
                {{
                  isPlaying
                    ? t('onlineLibrary.stopPlaying')
                    : previewLoading
                      ? t('onlineLibrary.loading')
                      : t('onlineLibrary.play')
                }}
              </Button>
              <Button :disabled="isImporting || previewLoading || isImported" @click="importSong">
                <template #icon>
                  <Check v-if="isImported" class="action-icon" />
                  <Download v-else class="action-icon" />
                </template>
                {{
                  isImported
                    ? t('onlineLibrary.imported')
                    : isImporting
                      ? t('onlineLibrary.importing')
                      : t('songList.actions.import')
                }}
              </Button>
            </div>
          </div>
        </header>

        <section class="metadata-card">
          <TypographyText class="metadata-title" strong>
            {{ t('midi.melodyInfo') }}
          </TypographyText>
          <div class="metadata-grid">
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('midi.duration') }}
              </TypographyText>
              <TypographyText strong>
                {{ formatDuration(song.durationMs) }}
              </TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('midi.tracks') }}
              </TypographyText>
              <TypographyText strong>
                {{ song.trackCount || 0 }}
              </TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('midi.melodyNotes') }}
              </TypographyText>
              <TypographyText strong>
                {{ song.noteCount || 0 }}
              </TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.fileSize') }}
              </TypographyText>
              <TypographyText strong>
                {{ formatFileSize(song.fileSize) }}
              </TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.detail.license') }}
              </TypographyText>
              <TypographyText>{{ labelFor('license', song.licenseType) }}</TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.filters.difficulty') }}
              </TypographyText>
              <TypographyText>{{ labelFor('difficulty', song.difficultyType) }}</TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.filters.source') }}
              </TypographyText>
              <TypographyText>{{ labelFor('source', song.sourceType) }}</TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.detail.originalFilename') }}
              </TypographyText>
              <TypographyText class="break-all">
                {{ song.originalFilename ? stripMidiExtension(song.originalFilename) : '--' }}
              </TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.detail.downloadFilename') }}
              </TypographyText>
              <TypographyText class="break-all">
                {{ song.downloadFilename ? stripMidiExtension(song.downloadFilename) : '--' }}
              </TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.detail.publishedAt') }}
              </TypographyText>
              <TypographyText>{{ formatDateTime(song.publishedAt) }}</TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.detail.createdAt') }}
              </TypographyText>
              <TypographyText>{{ formatDateTime(song.createdAt) }}</TypographyText>
            </div>
            <div class="metadata-item">
              <TypographyText type="secondary">
                {{ t('onlineLibrary.detail.updatedAt') }}
              </TypographyText>
              <TypographyText>{{ formatDateTime(song.updatedAt) }}</TypographyText>
            </div>
          </div>
        </section>
      </template>
    </Spin>
  </section>
</template>

<style scoped>
.online-song-detail {
  @apply flex h-full min-h-0 flex-col overflow-y-auto px-6 pb-6 pt-4;
}

:deep(.ant-spin-nested-loading),
:deep(.ant-spin-container) {
  min-height: 0;
  height: 100%;
}

:deep(.ant-spin-container) {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.missing-state {
  @apply flex h-full min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl text-sm;
  background: var(--bg-white-50);
  color: var(--color-muted-dark);
}

.missing-icon {
  width: 42px;
  height: 42px;
  color: var(--color-primary-active);
}

.missing-tip {
  @apply max-w-md text-center text-xs leading-5;
  color: var(--color-muted);
}

.detail-header {
  @apply flex shrink-0 items-start gap-6 rounded-lg bg-white p-6;
  border: 1px solid var(--border-primary-15);
  box-shadow: 0 10px 30px rgba(201, 67, 127, 0.07);
}

.detail-cover {
  @apply flex h-24 w-24 shrink-0 items-center justify-center rounded-lg;
  background: linear-gradient(135deg, var(--bg-primary-15), var(--bg-white-95));
  border: 1px solid var(--border-primary-20);
  color: var(--color-primary-active);
}

.detail-cover-icon {
  width: 38px;
  height: 38px;
  stroke-width: 2.2;
}

.detail-main {
  @apply flex min-w-0 flex-1 flex-col gap-3;
}

.title-row {
  @apply flex min-w-0 items-start justify-between gap-4;
}

.detail-title {
  @apply text-2xl font-semibold leading-snug;
  color: var(--color-foreground);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.detail-author {
  @apply mt-0.5 text-sm;
  color: var(--color-muted-dark);
}

.description-row {
  @apply flex min-w-0 items-start gap-1;
}

.detail-description {
  @apply min-w-0 flex-1 text-sm leading-6;
  color: var(--color-foreground);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.detail-description.muted {
  color: var(--color-muted);
}

.description-detail-link {
  @apply inline-flex h-6 shrink-0 items-center rounded px-1 text-sm font-medium transition-colors;
  color: var(--color-primary);
}

.description-detail-link:hover {
  color: var(--color-primary-hover);
  background: var(--bg-primary-10);
}

.top-tags {
  @apply flex flex-wrap gap-1.5;
}

.tag-chip,
.plain-tag {
  @apply inline-flex max-w-full shrink-0 items-center truncate rounded-full px-2.5 py-1 text-xs;
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
  background: var(--color-primary);
  color: white;
}

.detail-actions {
  @apply flex shrink-0 items-center gap-2 pt-1;
}

.action-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.25;
}

.metadata-card {
  @apply flex shrink-0 flex-col gap-5 rounded-lg bg-white p-6;
  border: 1px solid var(--border-primary-15);
}

.metadata-title {
  @apply text-base;
}

.metadata-grid {
  @apply grid gap-x-6 gap-y-4;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.metadata-item {
  @apply flex min-w-0 flex-col gap-1;
}

:global(.online-song-description-popover) {
  max-width: 520px;
}

.description-popover-content {
  @apply max-h-64 max-w-[520px] overflow-auto whitespace-pre-wrap text-sm leading-6;
  color: var(--color-foreground);
}
</style>
