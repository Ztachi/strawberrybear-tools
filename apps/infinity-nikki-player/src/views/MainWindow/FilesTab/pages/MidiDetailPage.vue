<script setup lang="ts">
/**
 * @description: MIDI 歌曲详情页
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button, Popover } from 'antdv-next'
import { Clock3, Music2, Pause, Piano, Play, X } from 'lucide-vue-next'
import PianoRoll from '@strawberrybear/piano-roll/vue'
import { usePlayerStore } from '@/stores/player'
import { getMidiDisplayArtist, getMidiDisplayName, getMidiDisplayTitle } from '@/lib/midiDisplay'
import { formatDuration } from '../utils'
import { adaptMidiToPianoRoll, applyPianoTrackEnabled } from './MidiDetailPage/pianoRollAdapter'
import { usePianoDetailSeek } from './MidiDetailPage/usePianoDetailSeek'
import { usePianoEditorResize } from './MidiDetailPage/usePianoEditorResize'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()

const filename = computed(() => String(route.params.filename ?? ''))
const detailMidi = computed(() => {
  const midi = playerStore.detailMidi
  return midi?.filename === filename.value ? midi : null
})
const detailDuration = computed(() => detailMidi.value?.duration_ms ?? 0)
const detailPlaybackState = computed(() =>
  detailMidi.value ? playerStore.getSongPlaybackState(detailMidi.value.filename) : 'idle'
)
const isDetailPlaying = computed(() => detailPlaybackState.value === 'playing')
const detailDisplayTitle = computed(() =>
  detailMidi.value ? getMidiDisplayTitle(detailMidi.value) : ''
)
const detailDisplayName = computed(() =>
  detailMidi.value ? getMidiDisplayName(detailMidi.value) : ''
)
const detailAuthor = computed(() =>
  detailMidi.value ? getMidiDisplayArtist(detailMidi.value) : ''
)
const detailDescription = computed(() => detailMidi.value?.description?.trim() ?? '')
const selectedTrackId = ref<string | null>(null)
const isPianoEditorOpen = ref(false)
const {
  matchesPlayback: currentPlaybackMatchesDetail,
  previewSeconds: pianoSeekPreviewSeconds,
  error: pianoSeekError,
  preview: previewPianoSeek,
  seek: seekPianoRoll,
  getQueue: getDetailQueue,
} = usePianoDetailSeek(detailMidi, filename)
const {
  heightPercent: editorHeightPercent,
  handleRef: editorResizeHandleRef,
  containerRef: detailBodyRef,
  begin: beginEditorResize,
  move: moveEditorResize,
  end: endEditorResize,
  onKeydown: handleEditorResizeKey,
} = usePianoEditorResize(closePianoEditor)

const pianoRollLabels = computed(() => ({
  overview: t('midi.pianoRoll.overview'),
  editor: t('midi.pianoRoll.editor'),
  follow: t('midi.pianoRoll.follow'),
  following: t('midi.pianoRoll.following'),
  timeZoom: t('midi.pianoRoll.timeZoom'),
  pitchZoom: t('midi.pianoRoll.pitchZoom'),
  enableTrack: t('midi.clickToEnable'),
  disableTrack: t('midi.clickToDisable'),
  notes: t('midi.pianoRoll.notes'),
  empty: t('midi.pianoRoll.empty'),
  playhead: t('midi.pianoRoll.playhead'),
  fit: t('midi.pianoRoll.fit'),
  close: t('midi.pianoRoll.close'),
}))
const sourcePianoDocument = computed(() =>
  adaptMidiToPianoRoll(detailMidi.value, (index) => t('midi.trackIndex', { n: index }))
)
const pianoRollDocument = computed(() => {
  // Set 可原地修改，版本号使启用状态更新；大型音符数组保持同一份引用。
  void playerStore.detailDisabledTracksVersion
  return applyPianoTrackEnabled(sourcePianoDocument.value, playerStore.detailDisabledTracks)
})
const pianoRollTracks = computed(() => pianoRollDocument.value.tracks)

const pianoRollTransport = computed(() => ({
  positionSeconds:
    pianoSeekPreviewSeconds.value ??
    (currentPlaybackMatchesDetail.value ? playerStore.previewCurrentTime / 1000 : 0),
  isPlaying:
    currentPlaybackMatchesDetail.value &&
    isDetailPlaying.value &&
    pianoSeekPreviewSeconds.value === null,
  playbackRate: playerStore.speed,
}))

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

const detailStats = computed(() => [
  {
    key: 'duration',
    label: t('midi.duration'),
    value: formatDuration(detailDuration.value),
    icon: Clock3,
  },
  {
    key: 'tracks',
    label: t('midi.tracks'),
    value: String(detailMidi.value?.track_count ?? 0),
    icon: Piano,
  },
  {
    key: 'notes',
    label: t('midi.melodyNotes'),
    value: String(playerStore.detailMelody.length || detailMidi.value?.melody_note_count || 0),
    icon: Music2,
  },
])

function selectPianoTrack(trackId: string): void {
  if (pianoRollTracks.value.some((track) => track.id === trackId)) selectedTrackId.value = trackId
}

function openPianoEditor(trackId: string): void {
  selectPianoTrack(trackId)
  isPianoEditorOpen.value = true
}

function closePianoEditor(): void {
  endEditorResize()
  previewPianoSeek(null)
  isPianoEditorOpen.value = false
}

function togglePianoTrack(trackId: string): void {
  playerStore.toggleDetailTrackById(trackId)
}

function navigateBack(): void {
  // 页面级主动返回的兜底逻辑保留：当前自定义标题栏已经提供后退按钮（与浏览器历史栈同步），
  // 但 missing-state 等异常分支仍需要主动跳转到文件页，因此函数不能删除。
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.push({ name: 'files-all' })
}

async function playDetailMidi(): Promise<void> {
  if (!detailMidi.value) return

  // 详情页只是查看入口，不天然代表一个播放域；点击封面播放时才需要决定队列。
  // 如果当前播放域已经包含这首歌，沿用当前域；否则回退到全部歌曲，避免详情页误写歌单作用域。
  const queue = getDetailQueue(detailMidi.value)
  await playerStore.toggleMidiInQueue(detailMidi.value, queue.items, queue.context)
}

watch(
  [filename, () => playerStore.midiLibrary.map((midi) => midi.filename).join('\n')],
  () => {
    if (!filename.value) return
    void playerStore.loadMidiDetailByFilename(filename.value)
  },
  { immediate: true }
)

watch(
  pianoRollTracks,
  (tracks) => {
    if (!tracks.some((track) => track.id === selectedTrackId.value)) {
      selectedTrackId.value = tracks[0]?.id ?? null
    }
  },
  { immediate: true }
)

watch(detailDescription, () => {
  void nextTick(() => {
    if (descriptionRef.value) descriptionResizeObserver?.observe(descriptionRef.value)
    updateDescriptionOverflow()
  })
})

onMounted(() => {
  descriptionResizeObserver = new ResizeObserver(updateDescriptionOverflow)
  if (descriptionRef.value) descriptionResizeObserver.observe(descriptionRef.value)
  void nextTick(updateDescriptionOverflow)
})

onBeforeUnmount(() => {
  descriptionResizeObserver?.disconnect()
  descriptionResizeObserver = null
})
</script>

<template>
  <section class="midi-detail-page">
    <template v-if="detailMidi">
      <header class="detail-summary">
        <button
          type="button"
          class="detail-cover group/detail-cover"
          :aria-label="isDetailPlaying ? t('player.pauseSong') : t('player.playSong')"
          @click="playDetailMidi"
        >
          <Music2 class="detail-cover-icon" />
          <span
            class="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition-opacity group-hover/detail-cover:opacity-100"
          >
            <Pause v-if="isDetailPlaying" class="size-7 stroke-0" fill="currentColor" />
            <Play v-else class="ml-1 size-7 stroke-0" fill="currentColor" />
          </span>
        </button>

        <div class="detail-main">
          <Popover :content="detailDisplayName" placement="topLeft">
            <h1 class="detail-title">
              {{ detailDisplayTitle }}
            </h1>
          </Popover>
          <p v-if="detailAuthor" class="detail-author">
            {{ detailAuthor }}
          </p>
          <div v-if="detailDescription" class="description-row">
            <p ref="descriptionRef" class="detail-description">
              {{ detailDescription }}
            </p>
            <Popover
              v-if="isDescriptionOverflowing"
              v-model:open="isDescriptionPopoverOpen"
              trigger="click"
              placement="bottom"
              overlay-class-name="midi-description-popover"
            >
              <template #content>
                <div class="description-popover-content">
                  {{ detailDescription }}
                </div>
              </template>
              <button type="button" class="description-detail-link">
                {{ t('onlineLibrary.detail.actions.detail') }}
              </button>
            </Popover>
          </div>
          <div class="detail-stats">
            <div v-for="stat in detailStats" :key="stat.key" class="detail-stat">
              <component :is="stat.icon" class="detail-stat-icon" />
              <span class="detail-stat-value">{{ stat.value }}</span>
              <span class="detail-stat-label">{{ stat.label }}</span>
            </div>
          </div>
        </div>
      </header>

      <div
        ref="detailBodyRef"
        class="detail-body"
        :style="{ '--piano-editor-height': `${editorHeightPercent}%` }"
      >
        <div
          class="piano-overview-host"
          :class="{ 'piano-overview-host--with-editor': isPianoEditorOpen }"
        >
          <PianoRoll
            :key="detailMidi.filename"
            class="detail-piano-roll"
            variant="overview"
            :document="pianoRollDocument"
            :transport="pianoRollTransport"
            :labels="pianoRollLabels"
            :selected-track-id="selectedTrackId"
            @select-track="selectPianoTrack"
            @open-editor="openPianoEditor"
            @toggle-track="togglePianoTrack"
            @seek="seekPianoRoll"
            @seek-preview="previewPianoSeek"
          />
        </div>
        <section
          v-if="isPianoEditorOpen"
          class="piano-editor-overlay"
          :aria-label="t('midi.pianoRoll.editor')"
          @keydown.esc.stop="closePianoEditor"
        >
          <div
            ref="editorResizeHandleRef"
            class="piano-editor-resize-handle"
            role="separator"
            tabindex="0"
            aria-orientation="horizontal"
            :aria-label="t('midi.pianoRoll.resize')"
            :aria-valuenow="Math.round(editorHeightPercent)"
            :aria-valuemin="25"
            :aria-valuemax="82"
            :aria-valuetext="t('midi.pianoRoll.heightPercent', { value: Math.round(editorHeightPercent) })"
            @pointerdown="beginEditorResize"
            @pointermove="moveEditorResize"
            @pointerup="endEditorResize"
            @pointercancel="endEditorResize"
            @lostpointercapture="endEditorResize"
            @keydown="handleEditorResizeKey"
          >
            <span aria-hidden="true" />
          </div>
          <PianoRoll
            class="detail-piano-editor"
            variant="editor"
            :document="pianoRollDocument"
            :transport="pianoRollTransport"
            :labels="pianoRollLabels"
            :selected-track-id="selectedTrackId"
            @select-track="selectPianoTrack"
            @toggle-track="togglePianoTrack"
            @seek="seekPianoRoll"
            @seek-preview="previewPianoSeek"
          >
            <template #toolbar>
              <Button
                type="text"
                size="small"
                :aria-label="t('midi.pianoRoll.close')"
                :title="t('midi.pianoRoll.close')"
                @click="closePianoEditor"
              >
                <template #icon>
                  <X class="size-4" :stroke-width="2" />
                </template>
              </Button>
            </template>
          </PianoRoll>
        </section>
        <p v-if="pianoSeekError" class="piano-seek-error" role="status">
          {{ pianoSeekError }}
        </p>
      </div>
    </template>

    <section v-else class="missing-state">
      <Music2 class="missing-icon" />
      <span
        >{{ playerStore.isDetailLoading ? t('onlineLibrary.loading') : t('midi.notFound') }}</span
      >
      <Button @click="navigateBack">
        {{ t('songList.allSongs') }}
      </Button>
    </section>
  </section>
</template>

<style scoped>
.midi-detail-page {
  @apply flex h-full min-h-0 flex-col gap-3 rounded-2xl bg-white;
}

.detail-summary {
  @apply flex shrink-0 items-center gap-4 rounded-2xl bg-white p-4;
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
  @apply min-w-0 flex-1;
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
  @apply mt-1 truncate text-sm;
  color: var(--color-muted-dark);
}

.description-row {
  @apply mt-2 flex min-w-0 items-start gap-1;
}

.detail-description {
  @apply min-w-0 flex-1 text-sm leading-6;
  color: var(--color-foreground);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.description-detail-link {
  @apply inline-flex h-6 shrink-0 items-center rounded px-1 text-sm font-medium transition-colors;
  color: var(--color-primary);
}

.description-detail-link:hover {
  color: var(--color-primary-hover);
  background: var(--bg-primary-10);
}

.detail-stats {
  @apply mt-3 flex flex-wrap items-center gap-3;
}

.detail-stat {
  @apply flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs;
  background: var(--bg-primary-10);
  color: var(--color-muted-dark);
}

.detail-stat-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary-active);
}

.detail-stat-value {
  @apply font-semibold;
  color: var(--color-primary-active);
}

.detail-body {
  @apply relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white;
  --piano-editor-size: max(0px, min(var(--piano-editor-height), calc(100% - 6rem)));
  border: 1px solid var(--border-primary-15);
}

.piano-overview-host {
  @apply min-h-0 shrink-0 overflow-hidden p-3;
  height: 100%;
}

.piano-overview-host--with-editor {
  /* 浮层按需出现时保留总览滚动条的可见区域，实例、缩放与滚动策略保持独立。 */
  height: calc(100% - var(--piano-editor-size));
}

.detail-piano-roll {
  @apply h-full w-full min-h-0;
}

.piano-editor-overlay {
  @apply absolute inset-x-0 bottom-0 z-20 flex min-h-0 flex-col overflow-hidden;
  height: var(--piano-editor-size);
  background: var(--color-primary-light);
  box-shadow: 0 -8px 24px var(--border-primary-15);
}

.piano-editor-resize-handle {
  @apply flex h-3 shrink-0 touch-none cursor-ns-resize items-center justify-center;
  background: var(--bg-primary-15);
}

.piano-editor-resize-handle span {
  @apply h-1 w-10 rounded-full;
  background: var(--color-primary-active);
}

.piano-editor-resize-handle:focus-visible {
  @apply outline-none;
  box-shadow: inset 0 0 0 2px var(--color-primary-active);
}

.detail-piano-editor {
  @apply min-h-0 flex-1;
}

.piano-seek-error {
  @apply pointer-events-none absolute right-4 top-4 z-30 max-w-md rounded-lg px-3 py-2 text-sm;
  color: var(--color-foreground);
  background: var(--bg-white-95);
}

.missing-state {
  @apply flex h-full flex-col items-center justify-center gap-3 rounded-2xl text-sm;
  background: var(--bg-white-50);
  color: var(--color-muted-dark);
}

.missing-icon {
  width: 42px;
  height: 42px;
  color: var(--color-primary-active);
}

:global(.midi-description-popover) {
  max-width: 520px;
}

.description-popover-content {
  @apply max-h-64 max-w-[520px] overflow-auto whitespace-pre-wrap text-sm leading-6;
  color: var(--color-foreground);
}
</style>
