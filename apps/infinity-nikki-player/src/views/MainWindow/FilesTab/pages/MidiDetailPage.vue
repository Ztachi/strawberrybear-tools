<script setup lang="ts">
/**
 * @description: MIDI 歌曲详情页
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button, Popover, Switch, Tooltip } from 'antdv-next'
import { ArrowLeft, Clock3, HelpCircle, Keyboard, Music2, Pause, Piano, Play } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import PianoRoll from '@strawberrybear/piano-roll'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import KeyboardPreview from '@/components/KeyboardPreview/index.vue'
import { mappingKeyToCode } from '@/components/KeyboardPreview/constants'
import { KeyboardMapper } from '@/lib/keyboardMapper'
import type { KeyLogEntry } from '@/lib/keyboardMapper'
import { playNote } from '@/lib/midiPlayer'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import type { TrackInfo } from '@/types'
import { formatDuration } from '../utils'

type DetailTab = 'tracks' | 'keyboard'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

const activeTab = ref<DetailTab>('tracks')
const keyboardMapper = ref<KeyboardMapper | null>(null)
const keyLog = ref<KeyLogEntry[]>([])

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

const keyCodeToPitch = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  const template = settingsStore.getCurrentTemplate()
  if (!template) return map
  for (const mapping of template.mappings) {
    map.set(mappingKeyToCode(mapping.key), mapping.pitch)
  }
  return map
})

const activeKeys = computed<Set<string>>(() => {
  if (!currentPlaybackMatchesDetail.value || settingsStore.playMode !== 'piano' || !keyboardMapper.value) {
    return new Set()
  }
  const codes = new Set<string>()
  for (const note of playerStore.activeNotes) {
    const result = keyboardMapper.value.mapPitch(note.pitch)
    if (result) codes.add(result.code)
  }
  return codes
})

function initKeyboardMapper(): void {
  const template = settingsStore.getCurrentTemplate()
  if (!template) return
  if (!keyboardMapper.value) {
    keyboardMapper.value = new KeyboardMapper()
    keyboardMapper.value.setKeyLogCallback((entry: KeyLogEntry) => {
      keyLog.value = [...keyLog.value, entry]
    })
    keyboardMapper.value.setKeyboardSimCallback((action: string, key: string) => {
      if (
        (settingsStore.enableKeyboardSim || settingsStore.isOverlayMode) &&
        settingsStore.playMode === 'piano'
      ) {
        const command = action === 'press' ? 'simulate_key_down' : 'simulate_key_up'
        invoke(command, { key }).catch(console.error)
      }
    })
  }
  keyboardMapper.value.setTemplate(template)
}

function getKeyLogByChapters() {
  return keyboardMapper.value?.getKeyLogByChapters() ?? []
}

function clearKeyLog(): void {
  keyboardMapper.value?.clearKeyLog()
  keyLog.value = []
}

function handleKeyClick(code: string): void {
  const pitch = keyCodeToPitch.value.get(code)
  if (pitch !== undefined) {
    playNote(pitch, 80, 0.5)
  }
}

function toggleTrack(trackIndex: number): void {
  playerStore.toggleDetailTrack(trackIndex)
}

function navigateBack(): void {
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

function handleModeSwitch(isPiano: unknown): void {
  void settingsStore.setPlayMode(isPiano === true ? 'piano' : 'auto')
  if (playerStore.isPreviewPlaying) {
    playerStore.applyPlayModeFilter()
  }
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
  () => settingsStore.currentTemplateId,
  () => {
    keyboardMapper.value?.reset()
    keyLog.value = []
    initKeyboardMapper()
    if (currentPlaybackMatchesDetail.value) {
      playerStore.applyPlayModeFilter()
    }
  },
  { immediate: true }
)

watch(
  () => [playerStore.activeNotes, currentPlaybackMatchesDetail.value] as const,
  ([notes, matches]) => {
    if (!keyboardMapper.value || settingsStore.playMode !== 'piano' || !matches) {
      keyboardMapper.value?.clearKeyState(playerStore.previewCurrentTime)
      return
    }
    if (notes.length === 0) {
      keyboardMapper.value.clearKeyState(playerStore.previewCurrentTime)
    } else {
      keyboardMapper.value.setActiveNotes(notes, playerStore.previewCurrentTime)
    }
  }
)
</script>

<template>
  <section class="midi-detail-page">
    <template v-if="detailMidi">
      <header class="detail-summary">
        <Button type="text" class="back-btn" @click="navigateBack">
          <template #icon>
            <ArrowLeft class="back-icon" />
          </template>
        </Button>

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
          <Popover :content="detailMidi.filename" placement="topLeft">
            <h1 class="detail-title">
              {{ detailMidi.filename }}
            </h1>
          </Popover>
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
        <div class="detail-tab-list" role="tablist">
          <button
            type="button"
            class="detail-tab"
            :class="{ active: activeTab === 'tracks' }"
            role="tab"
            @click="activeTab = 'tracks'"
          >
            <Piano class="detail-tab-icon" />
            {{ t('midi.trackList') }}
          </button>
          <button
            type="button"
            class="detail-tab"
            :class="{ active: activeTab === 'keyboard' }"
            role="tab"
            @click="activeTab = 'keyboard'"
          >
            <Keyboard class="detail-tab-icon" />
            {{ t('midi.virtualKeyboard') }}
          </button>
        </div>

        <div class="detail-tab-panel">
          <div v-show="activeTab === 'tracks'" class="panel-scroll">
            <PianoRoll
              :key="detailMidi.filename"
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

          <div v-show="activeTab === 'keyboard'" class="panel-scroll keyboard-panel">
            <KeyboardPreview
              :active-keys="activeKeys"
              :key-log="keyLog"
              :get-key-log-by-chapters="getKeyLogByChapters"
              :clear-key-log="clearKeyLog"
              :key-code-to-pitch="keyCodeToPitch"
              @key-click="handleKeyClick"
            >
              <template #toolbarLeft>
                <div class="keyboard-mode-controls">
                  <div class="mode-toggle">
                    <Switch
                      :checked="settingsStore.playMode === 'piano'"
                      @update:checked="handleModeSwitch"
                    />
                    <span class="mode-label">{{ t('player.pianoMode') }}</span>
                  </div>
                  <div class="mode-toggle">
                    <Switch
                      :checked="settingsStore.enableKeyboardSim"
                      :disabled="settingsStore.playMode !== 'piano'"
                      @update:checked="(v) => settingsStore.setEnableKeyboardSim(!!v)"
                    />
                    <span
                      class="mode-label"
                      :class="{ disabled: settingsStore.playMode !== 'piano' }"
                    >
                      {{ t('player.keyboardSim') }}
                    </span>
                    <Tooltip :title="t('player.keyboardSimTip')">
                      <HelpCircle class="help-icon" />
                    </Tooltip>
                  </div>
                  <KeyTemplateSelect class="min-w-[168px] max-w-[220px] flex-1" />
                </div>
              </template>
            </KeyboardPreview>
          </div>
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

.back-btn {
  @apply h-10 w-10 shrink-0 rounded-xl;
}

.back-icon {
  width: 19px;
  height: 19px;
  stroke-width: 2.35;
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
  @apply flex min-h-0 flex-1 flex-col rounded-2xl bg-white;
  border: 1px solid var(--border-primary-15);
}

.detail-tab-list {
  @apply flex shrink-0 items-center gap-2 border-b border-primary/10 px-3 py-2;
}

.detail-tab {
  @apply inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors;
  color: var(--color-muted-dark);
}

.detail-tab:hover,
.detail-tab.active {
  background: var(--bg-primary-10);
  color: var(--color-primary-active);
}

.detail-tab-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.2;
}

.detail-tab-panel {
  @apply min-h-0 flex-1;
}

.panel-scroll {
  @apply h-full min-h-0 overflow-auto p-3;
}

.keyboard-panel {
  @apply flex items-start justify-center overflow-hidden;
}

.keyboard-mode-controls {
  @apply flex min-w-0 flex-wrap items-center gap-4;
}

.mode-toggle {
  @apply flex items-center gap-2;
}

.mode-label {
  @apply whitespace-nowrap text-xs;
  color: var(--color-muted-dark);
}

.mode-label.disabled {
  opacity: 0.5;
}

.help-icon {
  width: 14px;
  height: 14px;
  color: var(--color-muted);
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
</style>
