<script setup lang="ts">
/**
 * @description: MIDI 歌曲详情页
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button, Popover, Tooltip } from 'antdv-next'
import { Clock3, Music2, Pause, Piano, Play, ExternalLink } from 'lucide-vue-next'
import AutoSwitchDetailButton from '@/components/AutoSwitchDetailButton.vue'
import PianoWorkspace from '@/components/PianoWorkspace/PianoWorkspace.vue'
import type { PianoWorkspaceState } from '@/features/piano-editor'
import { usePlayerStore } from '@/stores/player'
import { getMidiDisplayArtist, getMidiDisplayName, getMidiDisplayTitle } from '@/lib/midiDisplay'
import { formatDuration } from '../utils'
import { adaptMidiToPianoRoll, applyPianoTrackEnabled } from './MidiDetailPage/pianoRollAdapter'
import { usePianoDetailSeek } from './MidiDetailPage/usePianoDetailSeek'
import { usePianoEditorWindow } from './MidiDetailPage/usePianoEditorWindow'
import { useAutoSwitchDetail } from './MidiDetailPage/useAutoSwitchDetail'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()

const filename = computed(() => String(route.params.filename ?? ''))
// 区分路由换曲的中间态与加载已结束但没有数据；失效文件不能让浮窗永久停在加载中。
const resolvedDetailFilename = ref<string | null>(null)
let detailLoadRequest = 0
const autoSwitchDetail = useAutoSwitchDetail(filename)
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
const {
  matchesPlayback: currentPlaybackMatchesDetail,
  previewSeconds: pianoSeekPreviewSeconds,
  error: pianoSeekError,
  preview: previewPianoSeek,
  seek: seekPianoRoll,
  getQueue: getDetailQueue,
} = usePianoDetailSeek(detailMidi, filename)
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
const workspace = ref<{ getState: () => PianoWorkspaceState } | null>(null)
const editorWindow = usePianoEditorWindow(
  computed(() => ({
    filename: filename.value,
    autoSwitchDetail: autoSwitchDetail.value,
    title: detailDisplayName.value || filename.value,
    document: pianoRollDocument.value,
    labels: pianoRollLabels.value,
    locale: locale.value,
    error: pianoSeekError.value || (!detailMidi.value && resolvedDetailFilename.value === filename.value ? t('midi.notFound') : ''),
    loading: !detailMidi.value && resolvedDetailFilename.value !== filename.value,
  })),
  pianoRollTransport,
  seekPianoRoll,
  previewPianoSeek,
  togglePianoTrack
)
const isEditorDetached = editorWindow.detached
const editorWindowStatus = editorWindow.status
const editorWindowError = editorWindow.error
const workspaceRestore = editorWindow.restore
function rememberWorkspace(state: PianoWorkspaceState): void {
  editorWindow.latestViewport.value = state
}
async function detachPianoWorkspace(): Promise<void> {
  editorWindow.latestViewport.value = workspace.value?.getState()
  await editorWindow.open()
}

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
    const target = filename.value
    const request = ++detailLoadRequest
    resolvedDetailFilename.value = null
    void playerStore.loadMidiDetailByFilename(target).finally(() => {
      if (request === detailLoadRequest && filename.value === target) resolvedDetailFilename.value = target
    })
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
  detailLoadRequest += 1
  descriptionResizeObserver?.disconnect()
  descriptionResizeObserver = null
})
</script>

<template>
  <section class="midi-detail-page">
    <template v-if="detailMidi">
      <header class="detail-summary">
        <Tooltip :title="isDetailPlaying ? t('player.pauseSong') : t('player.playSong')">
          <Button
            type="text"
            class="detail-cover group/detail-cover"
            :aria-label="isDetailPlaying ? t('player.pauseSong') : t('player.playSong')"
            @click="playDetailMidi"
          >
            <Music2 class="detail-cover-icon" />
            <span
              class="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition-opacity group-hover/detail-cover:opacity-100"
            >
              <Pause
                v-if="isDetailPlaying"
                class="size-7 stroke-0"
                fill="currentColor"
              />
              <Play
                v-else
                class="ml-1 size-7 stroke-0"
                fill="currentColor"
              />
            </span>
          </Button>
        </Tooltip>

        <div class="detail-main">
          <Popover
            :content="detailDisplayName"
            placement="topLeft"
          >
            <h1 class="detail-title">
              {{ detailDisplayTitle }}
            </h1>
          </Popover>
          <p
            v-if="detailAuthor"
            class="detail-author"
          >
            {{ detailAuthor }}
          </p>
          <div
            v-if="detailDescription"
            class="description-row"
          >
            <p
              ref="descriptionRef"
              class="detail-description"
            >
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
              <Button
                type="link"
                class="description-detail-link"
              >
                {{ t('onlineLibrary.detail.actions.detail') }}
              </Button>
            </Popover>
          </div>
          <div class="detail-stats">
            <div
              v-for="stat in detailStats"
              :key="stat.key"
              class="detail-stat"
            >
              <component
                :is="stat.icon"
                class="detail-stat-icon"
              />
              <span class="detail-stat-value">{{ stat.value }}</span>
              <span class="detail-stat-label">{{ stat.label }}</span>
            </div>
            <AutoSwitchDetailButton
              class="ml-auto"
              :active="autoSwitchDetail"
              @change="autoSwitchDetail = $event"
            />
          </div>
        </div>
      </header>

      <div class="detail-body">
        <PianoWorkspace
          v-if="!isEditorDetached"
          :key="filename"
          ref="workspace"
          :filename="filename"
          :document="pianoRollDocument"
          :transport="pianoRollTransport"
          :labels="pianoRollLabels"
          :restore="workspaceRestore"
          :opening="editorWindowStatus === 'opening'"
          @state-change="rememberWorkspace"
          @toggle-track="togglePianoTrack"
          @seek="seekPianoRoll"
          @seek-preview="previewPianoSeek"
          @migrate="detachPianoWorkspace"
        />
        <div
          v-else
          class="m-auto flex items-center gap-3"
        >
          <Button
            type="primary"
            :aria-label="t('midi.pianoRoll.focusWindow')"
            @click="editorWindow.open"
          >
            <template #icon>
              <ExternalLink
                class="size-4"
                :stroke-width="2"
              />
            </template>
            {{ t('midi.pianoRoll.focusWindow') }}
          </Button>
          <Button
            class="nikki-outline-btn"
            @click="editorWindow.dock"
          >
            {{ t('midi.pianoRoll.dock') }}
          </Button>
        </div>
        <p
          v-if="editorWindowError"
          class="piano-seek-error"
          role="alert"
        >
          {{ t('midi.pianoRoll.windowFailed', { error: editorWindowError }) }}
        </p>
        <p
          v-if="pianoSeekError"
          class="piano-seek-error"
          role="status"
        >
          {{ pianoSeekError }}
        </p>
      </div>
    </template>

    <section
      v-else
      class="missing-state"
    >
      <Music2 class="missing-icon" />
      <span>{{ playerStore.isDetailLoading ? t('onlineLibrary.loading') : t('midi.notFound') }}</span>
      <Button @click="navigateBack">
        {{ t('songList.allSongs') }}
      </Button>
    </section>
  </section>
</template>

<style scoped>
.midi-detail-page {
  @apply flex h-full min-h-0 flex-col bg-white rounded-xl;
}

.detail-summary {
  @apply flex shrink-0 items-center gap-4 px-2 py-3;
  border-bottom: 1px solid var(--border-primary-15);
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

.detail-body { @apply relative flex min-h-0 flex-1 flex-col; }

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
