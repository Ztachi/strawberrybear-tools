<script setup lang="ts">
/**
 * @description: MIDI 歌曲详情页
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button, Popover } from 'antdv-next'
import { Clock3, Music2, Pause, Piano, Play } from 'lucide-vue-next'
import PianoRoll from '@strawberrybear/piano-roll'
import { usePlayerStore } from '@/stores/player'
import type { TrackInfo } from '@/types'
import { getMidiDisplayArtist, getMidiDisplayName, getMidiDisplayTitle } from '@/lib/midiDisplay'
import { formatDuration } from '../utils'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()

const filename = computed(() => String(route.params.filename ?? ''))
const detailMidi = computed(() => playerStore.detailMidi)
const currentPlaybackMatchesDetail = computed(
  () => Boolean(detailMidi.value) && playerStore.currentMidi?.filename === detailMidi.value?.filename
)
const pianoRollCurrentTime = computed(() =>
  currentPlaybackMatchesDetail.value ? playerStore.previewCurrentTime : 0
)
const detailDuration = computed(() => playerStore.detailDuration || detailMidi.value?.duration_ms || 0)
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

const translatedTracks = computed<TrackInfo[]>(() =>
  playerStore.detailTracks.map((track) => {
    if (track.name.includes('|percussion')) {
      return { ...track, name: t('midi.percussionTrack') }
    }
    return { ...track, name: `${t('midi.trackIndex', { n: Number(track.name) })}` }
  })
)

function toggleTrack(trackIndex: number): void {
  playerStore.toggleDetailTrack(trackIndex)
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
  if (isDetailPlaying.value) {
    playerStore.pausePreviewPlayback()
    return
  }

  // 详情页只是查看入口，不天然代表一个播放域；点击封面播放时才需要决定队列。
  // 如果当前播放域已经包含这首歌，沿用当前域；否则回退到全部歌曲，避免详情页误写歌单作用域。
  const activeQueue = playerStore.activePreviewQueueItems
  const detailInActiveQueue = activeQueue.some((midi) => midi.filename === detailMidi.value?.filename)
  const queueItems = detailInActiveQueue ? activeQueue : playerStore.midiLibrary
  const queueContext = detailInActiveQueue
    ? playerStore.previewQueueContext
    : { id: 'all', title: t('songList.allSongs') }
  await playerStore.playMidiInQueue(detailMidi.value, queueItems, queueContext)
}

watch(
  [filename, () => playerStore.midiLibrary.map((midi) => midi.filename).join('\n')],
  () => {
    if (!filename.value) return
    void playerStore.loadMidiDetailByFilename(filename.value)
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

      <div class="detail-body">
        <div class="panel-scroll">
          <PianoRoll
            :key="detailMidi.filename"
            class="detail-piano-roll"
            :notes="detailMidi.events || []"
            :duration="detailDuration"
            :ticks-per-beat="detailMidi.ticks_per_beat || 480"
            :tempo="detailMidi.tempo || 500000"
            :tracks="translatedTracks"
            :disabled-tracks="playerStore.detailDisabledTracks"
            :disabled-tracks-version="playerStore.detailDisabledTracksVersion"
            :current-time="pianoRollCurrentTime"
            @toggle="toggleTrack"
          />
        </div>
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
  @apply flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white;
  border: 1px solid var(--border-primary-15);
}

.panel-scroll {
  @apply min-h-0 flex-1 overflow-auto p-3;
}

.detail-piano-roll {
  width: 100%;
  min-height: 100%;
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
