<script setup lang="ts">
/**
 * @description: 在线曲库 - 单曲详情页
 * @description 展示服务端返回的完整元数据；长描述参照歌单详情用 Popover 展开。
 * @description 复用 list 接口返回的字段类型，不再单独定义 detail 模型。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button, Popover, Spin } from 'antdv-next'
import { Download, Music2, Pause, Play } from 'lucide-vue-next'
import { feedback as toast } from '@/lib/feedback'
import { playMidi, stopPreview } from '@/lib/midiPlayer'
import {
  downloadOnlineMidiSongFile,
  fetchOnlineMidiSong,
  type OnlineMidiSong,
} from '@/lib/onlineMidiLibraryApi'
import { usePlayerStore } from '@/stores/player'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()

const song = ref<OnlineMidiSong | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')
const isImporting = ref(false)
const previewLoading = ref(false)
const currentPreviewing = ref(false)

/** 弹层用：详情页主动停止试听时清理状态。 */
let previewEndTimer: number | undefined

const songId = computed(() => String(route.params.id ?? ''))
const descriptionText = computed(() => {
  const desc = song.value?.description?.trim()
  return desc ? desc : t('onlineLibrary.detail.noDescription')
})
const isDescriptionEmpty = computed(() => !song.value?.description?.trim())

/** 长描述溢出检测使用的 DOM 引用。 */
const descriptionRef = ref<HTMLElement | null>(null)
/** 当前描述是否溢出（用于显示 Popover 展开按钮）。 */
const isDescriptionOverflowing = ref(false)
/** Popover 显示状态。 */
const isDescriptionPopoverOpen = ref(false)
let descriptionResizeObserver: ResizeObserver | null = null

/**
 * @description: 重新检测描述是否溢出
 * @return {void}
 */
function updateDescriptionOverflow(): void {
  const element = descriptionRef.value
  if (!element) {
    isDescriptionOverflowing.value = false
    isDescriptionPopoverOpen.value = false
    return
  }
  isDescriptionOverflowing.value = element.scrollWidth > element.clientWidth + 1
  if (!isDescriptionOverflowing.value) isDescriptionPopoverOpen.value = false
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * @description: 将字段值展示为本地化的展示文案（无对应 key 时回退原值）
 * @description 集中管理 5 个枚举（曲风 / 来源 / 难度 / 版权）和其他元数据的标签查找逻辑。
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

/** 时间戳（Unix ms）格式化为可读字符串。 */
function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '--'
  return new Date(ms).toLocaleString()
}

/** 文件大小自适应 B / KB / MB。 */
function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes < 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 时长 ms 格式化为 m:ss。 */
function formatDuration(ms: number | undefined | null): string {
  if (!ms || ms < 0) return '--'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

async function loadSong(): Promise<void> {
  if (!songId.value) return
  isLoading.value = true
  errorMessage.value = ''
  song.value = null
  try {
    song.value = await fetchOnlineMidiSong(songId.value)
    void nextTick(updateDescriptionOverflow)
  } catch (error) {
    errorMessage.value = describeError(error)
  } finally {
    isLoading.value = false
  }
}

/**
 * @description: 停止当前试听（幂等）
 * @return {Promise<void>}
 */
async function stopPreviewSafely(): Promise<void> {
  window.clearTimeout(previewEndTimer)
  previewEndTimer = undefined
  currentPreviewing.value = false
  stopPreview()
  await playerStore.stopPreviewPlayback().catch(() => undefined)
}

/**
 * @description: 切换试听（播放 / 停止）
 * @return {Promise<void>}
 */
async function togglePreview(): Promise<void> {
  if (!song.value) return
  if (currentPreviewing.value) {
    await stopPreviewSafely()
    return
  }
  previewLoading.value = true
  try {
    await stopPreviewSafely()
    const bytes = await downloadOnlineMidiSongFile(song.value.id)
    await playMidi(toArrayBuffer(bytes), 1)
    currentPreviewing.value = true
    const fallbackDuration = 60_000
    previewEndTimer = window.setTimeout(
      () => {
        if (currentPreviewing.value) currentPreviewing.value = false
      },
      Math.max(song.value.durationMs || fallbackDuration, 1000) + 800
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

/**
 * @description: 导入当前歌曲到本地库并跳转到文件管理页
 * @return {Promise<void>}
 */
async function importSong(): Promise<void> {
  if (!song.value) return
  isImporting.value = true
  try {
    await stopPreviewSafely()
    const bytes = await downloadOnlineMidiSongFile(song.value.id)
    const filename = song.value.downloadFilename || `${song.value.title || song.value.id}.mid`
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
    isImporting.value = false
  }
}

/**
 * @description: 返回在线曲库列表
 * @return {void}
 */
function navigateBack(): void {
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.push({ name: 'online-library' })
}

watch(songId, () => {
  void loadSong()
})

watch(descriptionText, () => {
  void nextTick(updateDescriptionOverflow)
})

onMounted(() => {
  descriptionResizeObserver = new ResizeObserver(updateDescriptionOverflow)
  if (descriptionRef.value) descriptionResizeObserver.observe(descriptionRef.value)
  void loadSong()
})

onBeforeUnmount(() => {
  descriptionResizeObserver?.disconnect()
  descriptionResizeObserver = null
  window.clearTimeout(previewEndTimer)
  void stopPreviewSafely()
})
</script>

<template>
  <section class="online-song-detail">
    <Spin :spinning="isLoading">
      <!-- 加载或失败：统一 missing-state -->
      <section v-if="!song" class="missing-state">
        <Music2 class="missing-icon" />
        <span v-if="!errorMessage">{{ t('onlineLibrary.loading') }}</span>
        <template v-else>
          <span>{{ t('onlineLibrary.detail.notFound') }}</span>
          <span class="missing-tip">{{ t('onlineLibrary.detail.notFoundDescription') }}</span>
          <span v-if="errorMessage" class="missing-tip">{{ errorMessage }}</span>
        </template>
        <Button @click="navigateBack">
          {{ t('onlineLibrary.detail.back') }}
        </Button>
      </section>

      <template v-else>
        <header class="detail-header">
          <button
            type="button"
            class="detail-cover group/detail-cover"
            :aria-label="currentPreviewing ? t('player.pauseSong') : t('player.playSong')"
            @click="togglePreview"
          >
            <Music2 class="detail-cover-icon" />
            <span
              class="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition-opacity group-hover/detail-cover:opacity-100"
            >
              <Pause v-if="currentPreviewing" class="size-7 stroke-0" fill="currentColor" />
              <Play v-else class="ml-1 size-7 stroke-0" fill="currentColor" />
            </span>
          </button>

          <div class="detail-main">
            <div class="title-row">
              <div class="min-w-0">
                <h1 class="detail-title">
                  {{ song.title }}
                </h1>
                <p class="detail-author">
                  {{ song.authorName || t('onlineLibrary.unknownAuthor') }}
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

            <div class="detail-bottom-actions">
              <Button
                type="primary"
                :disabled="previewLoading || isImporting"
                @click="togglePreview"
              >
                <template #icon>
                  <Pause v-if="currentPreviewing" class="action-icon" />
                  <Play v-else class="action-icon" />
                </template>
                {{
                  currentPreviewing
                    ? t('player.stopPreview')
                    : previewLoading
                      ? t('onlineLibrary.loading')
                      : t('player.preview')
                }}
              </Button>
              <Button :disabled="isImporting || previewLoading" @click="importSong">
                <template #icon>
                  <Download class="action-icon" />
                </template>
                {{
                  isImporting
                    ? t('onlineLibrary.importing')
                    : t('songList.actions.import')
                }}
              </Button>
            </div>
          </div>
        </header>

        <!-- 元数据卡片：使用 Description 列表风格的字段展示，所有枚举走 labelFor -->
        <section class="metadata-card">
          <h2 class="metadata-title">
            {{ t('midi.melodyInfo') }}
          </h2>
          <dl class="metadata-grid">
            <div class="metadata-item">
              <dt>{{ t('midi.duration') }}</dt>
              <dd>{{ formatDuration(song.durationMs) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('midi.tracks') }}</dt>
              <dd>{{ song.trackCount || 0 }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('midi.melodyNotes') }}</dt>
              <dd>{{ song.noteCount || 0 }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.fileSize') }}</dt>
              <dd>{{ formatFileSize(song.fileSize) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.license') }}</dt>
              <dd>{{ labelFor('license', song.licenseType) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.filters.difficulty') }}</dt>
              <dd>{{ labelFor('difficulty', song.difficultyType) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.filters.source') }}</dt>
              <dd>{{ labelFor('source', song.sourceType) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.originalFilename') }}</dt>
              <dd class="break-all">
                {{ song.originalFilename || '--' }}
              </dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.downloadFilename') }}</dt>
              <dd class="break-all">
                {{ song.downloadFilename || '--' }}
              </dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.sha256') }}</dt>
              <dd class="break-all mono">
                {{ song.sha256 || '--' }}
              </dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.entryDate') }}</dt>
              <dd>{{ formatDateTime(song.entryDate) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.publishedAt') }}</dt>
              <dd>{{ formatDateTime(song.publishedAt) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.createdAt') }}</dt>
              <dd>{{ formatDateTime(song.createdAt) }}</dd>
            </div>
            <div class="metadata-item">
              <dt>{{ t('onlineLibrary.detail.updatedAt') }}</dt>
              <dd>{{ formatDateTime(song.updatedAt) }}</dd>
            </div>
          </dl>
        </section>

        <!-- 曲风 + 标签 chip 区 -->
        <section class="tag-section">
          <div v-if="song.genreTypes.length > 0" class="tag-row">
            <span v-for="genre in song.genreTypes" :key="`genre-${genre}`" class="tag-chip primary">
              {{ labelFor('genre', genre) }}
            </span>
          </div>
          <div v-if="song.tags.length > 0" class="tag-row">
            <span v-for="tag in song.tags" :key="`tag-${tag}`" class="tag-chip plain">
              {{ tag }}
            </span>
          </div>
        </section>
      </template>
    </Spin>
  </section>
</template>

<style scoped>
.online-song-detail {
  @apply flex h-full min-h-0 flex-col gap-4 overflow-y-auto;
  padding: 4px 0 24px;
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
  @apply flex shrink-0 items-start gap-4 rounded-2xl bg-white p-4;
  border: 1px solid var(--border-primary-15);
}

.detail-cover {
  @apply relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl;
  background: linear-gradient(135deg, var(--bg-primary-15), var(--bg-white-95));
  border: 1px solid var(--border-primary-20);
  color: var(--color-primary-active);
}

.detail-cover-icon {
  width: 34px;
  height: 34px;
  stroke-width: 2.2;
}

.detail-main {
  @apply flex min-w-0 flex-1 flex-col gap-3;
}

.title-row {
  @apply flex min-w-0 items-start justify-between gap-4;
}

.detail-title {
  @apply text-xl font-semibold leading-snug;
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
  @apply flex min-w-0 items-center gap-1;
}

.detail-description {
  @apply min-w-0 flex-1 truncate text-sm leading-6;
  color: var(--color-foreground);
}

.detail-description.muted {
  color: var(--color-muted);
  font-style: italic;
}

.description-detail-link {
  @apply inline-flex h-6 shrink-0 items-center rounded px-1 text-sm font-medium transition-colors;
  color: var(--color-primary);
}

.description-detail-link:hover {
  color: var(--color-primary-hover);
  background: var(--bg-primary-10);
}

.detail-bottom-actions {
  @apply flex shrink-0 items-center gap-2 pt-1;
}

.action-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.25;
}

.metadata-card {
  @apply flex shrink-0 flex-col gap-3 rounded-2xl bg-white p-4;
  border: 1px solid var(--border-primary-15);
}

.metadata-title {
  @apply text-base font-semibold;
  color: var(--color-foreground);
}

.metadata-grid {
  @apply grid gap-x-6 gap-y-3;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.metadata-item {
  @apply flex min-w-0 flex-col gap-1;
}

.metadata-item dt {
  @apply text-xs;
  color: var(--color-muted-dark);
}

.metadata-item dd {
  @apply min-w-0 text-sm leading-5;
  color: var(--color-foreground);
}

.metadata-item dd.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.tag-section {
  @apply flex shrink-0 flex-col gap-2;
}

.tag-row {
  @apply flex flex-wrap gap-1.5;
}

.tag-chip {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium;
}

.tag-chip.primary {
  background: var(--bg-primary-15);
  color: var(--color-primary-active);
}

.tag-chip.plain {
  background: rgba(95, 118, 137, 0.1);
  color: var(--color-muted-dark);
}

:global(.online-song-description-popover) {
  max-width: 520px;
}

.description-popover-content {
  @apply max-h-64 max-w-[520px] overflow-auto whitespace-pre-wrap text-sm leading-6;
  color: var(--color-foreground);
}
</style>
