<script setup lang="ts">
/**
 * @description: Song collection list
 * @description Shared by all songs and playlist song pages.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Button, Checkbox, Dropdown, Input, Modal, Tooltip } from 'antdv-next'
import { ListPlus, MoreVertical, Music, Search, Trash2, X } from 'lucide-vue-next'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { usePlayerStore } from '@/stores/player'
import { useSongListStore } from '@/stores/songLists'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import type { MidiInfo } from '@/types'
import { buildCollectionContext, formatDuration } from '../utils'
import SongActionMenu from './SongActionMenu.vue'

const props = defineProps<{
  type: 'all' | 'songList'
  songs: MidiInfo[]
  songListId?: string
  collectionTitle: string
}>()

const { t } = useI18n()
const mainWindowUiStore = useMainWindowUiStore()
const playerStore = usePlayerStore()
const songListStore = useSongListStore()

const searchKeyword = ref('')
const batchMode = ref(false)
const selectedFilenames = ref<Set<string>>(new Set())
const scrollElement = ref<HTMLElement | null>(null)
const confirmDialog = ref<{
  open: boolean
  title: string
  content: string
  okText: string
  resolve: CallableFunction | null
}>({
  open: false,
  title: '',
  content: '',
  okText: '',
  resolve: null,
})
let unregisterBackToTop: (() => void) | null = null
let confirmPromise: Promise<boolean> | null = null

const SCROLL_THRESHOLD = 200

const filteredSongs = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return props.songs
  return props.songs.filter((song) => song.filename.toLowerCase().includes(keyword))
})

const collectionContext = computed(() =>
  buildCollectionContext(
    props.type === 'all' ? 'all' : `song-list:${props.songListId ?? 'unknown'}`,
    props.collectionTitle
  )
)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: filteredSongs.value.length,
    getScrollElement: () => scrollElement.value,
    estimateSize: () => 74,
    overscan: 8,
  }))
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
const selectedCount = computed(() => selectedFilenames.value.size)
const selectedSongs = computed(() =>
  filteredSongs.value.filter((song) => selectedFilenames.value.has(song.filename))
)

const batchAddTargets = computed(() => {
  const filenames = selectedSongs.value.map((song) => song.filename)
  if (filenames.length === 0) return []
  return songListStore.songLists.filter((songList) =>
    filenames.some((filename) => !songList.song_filenames.includes(filename))
  )
})

const batchAddMenuItems = computed(() =>
  batchAddTargets.value.map((songList) => ({
    key: songList.id,
    label: songList.name,
  }))
)

function setSelectedFilenames(nextSet: Set<string>): void {
  selectedFilenames.value = nextSet
}

function toggleBatchMode(): void {
  batchMode.value = !batchMode.value
  selectedFilenames.value = new Set()
}

function toggleSong(song: MidiInfo): void {
  const nextSet = new Set(selectedFilenames.value)
  if (nextSet.has(song.filename)) {
    nextSet.delete(song.filename)
  } else {
    nextSet.add(song.filename)
  }
  setSelectedFilenames(nextSet)
}

function handleRowClick(song: MidiInfo): void {
  if (batchMode.value) {
    toggleSong(song)
    return
  }
  void playerStore.selectMidi(song, {
    openDetail: true,
    queueItems: filteredSongs.value,
    queueContext: collectionContext.value,
  })
}

function handleRowDoubleClick(song: MidiInfo): void {
  if (batchMode.value) return
  void playerStore.playMidiInQueue(song, filteredSongs.value, collectionContext.value)
}

function confirmAction(title: string, content: string, okText: string): Promise<boolean> {
  if (confirmPromise) return confirmPromise
  confirmPromise = new Promise((resolve) => {
    confirmDialog.value = {
      open: true,
      title,
      content,
      okText,
      resolve,
    }
  })
  return confirmPromise
}

function resolveConfirmDialog(value: boolean): void {
  const resolve = confirmDialog.value.resolve
  confirmDialog.value.open = false
  confirmDialog.value.resolve = null
  confirmPromise = null
  if (resolve) resolve(value)
}

async function removeSelectedFromSongList(): Promise<void> {
  if (!props.songListId || selectedCount.value === 0) return
  const confirmed = await confirmAction(
    t('songList.confirm.batchRemoveTitle'),
    t('songList.confirm.batchRemoveDescription', { count: selectedCount.value }),
    t('songList.actions.removeFromSongList')
  )
  if (!confirmed) return
  const removed = await songListStore.removeSongs(
    props.songListId,
    selectedSongs.value.map((song) => song.filename)
  )
  if (removed) selectedFilenames.value = new Set()
}

async function deleteSelectedFiles(): Promise<void> {
  if (selectedCount.value === 0) return
  const confirmed = await confirmAction(
    t('songList.confirm.batchDeleteFileTitle'),
    t('songList.confirm.batchDeleteFileDescription', { count: selectedCount.value }),
    t('songList.actions.deleteFile')
  )
  if (!confirmed) return
  const filenames = selectedSongs.value.map((song) => song.filename)
  for (const filename of filenames) {
    await playerStore.deleteMidi(filename)
  }
  selectedFilenames.value = new Set()
}

async function addSelectedToSongList(info: { key: string | number }): Promise<void> {
  const songListId = String(info.key)
  const targetSongList = songListStore.getSongListById(songListId)
  if (!targetSongList) return
  const missingFilenames = selectedSongs.value
    .map((song) => song.filename)
    .filter((filename) => !targetSongList.song_filenames.includes(filename))
  await songListStore.addSongs(songListId, missingFilenames)
}

function handleScroll(): void {
  mainWindowUiStore.setBackToTopVisible((scrollElement.value?.scrollTop ?? 0) > SCROLL_THRESHOLD)
}

function scrollToTop(): void {
  scrollElement.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(searchKeyword, () => {
  rowVirtualizer.value.scrollToIndex(0)
  handleScroll()
})

watch(
  () => filteredSongs.value.map((song) => song.filename).join('\n'),
  () => {
    const visibleFilenames = new Set(filteredSongs.value.map((song) => song.filename))
    selectedFilenames.value = new Set(
      Array.from(selectedFilenames.value).filter((filename) => visibleFilenames.has(filename))
    )
  }
)

onMounted(() => {
  unregisterBackToTop = mainWindowUiStore.registerBackToTop(scrollToTop)
  handleScroll()
})

onUnmounted(() => {
  unregisterBackToTop?.()
  unregisterBackToTop = null
  resolveConfirmDialog(false)
})
</script>

<template>
  <div class="song-collection">
    <div class="collection-toolbar">
      <Input
        v-model:value="searchKeyword"
        allow-clear
        class="search-input"
        :placeholder="t('songList.searchPlaceholder')"
      >
        <template #prefix>
          <Search class="h-4 w-4 text-muted-foreground" />
        </template>
      </Input>

      <div class="toolbar-actions">
        <template v-if="batchMode && selectedCount > 0">
          <Button
            v-if="type === 'songList'"
            color="danger"
            variant="solid"
            size="small"
            @click="removeSelectedFromSongList"
          >
            <template #icon>
              <Trash2 class="toolbar-icon" />
            </template>
            {{ t('songList.actions.removeFromSongList') }}
          </Button>
          <Button v-else color="danger" variant="solid" size="small" @click="deleteSelectedFiles">
            <template #icon>
              <Trash2 class="toolbar-icon" />
            </template>
            {{ t('songList.actions.deleteFile') }}
          </Button>

          <Dropdown
            placement="bottomRight"
            :trigger="['click']"
            :disabled="batchAddTargets.length === 0"
            :get-popup-container="getMainWindowPopupContainer"
            :menu="{ items: batchAddMenuItems, onClick: addSelectedToSongList }"
          >
            <Button size="small" :disabled="batchAddTargets.length === 0">
              <template #icon>
                <ListPlus class="toolbar-icon" />
              </template>
              {{ t('songList.actions.addTo') }}
            </Button>
          </Dropdown>
        </template>

        <Button size="small" @click="toggleBatchMode">
          <template #icon>
            <X v-if="batchMode" class="toolbar-icon" />
            <ListPlus v-else class="toolbar-icon" />
          </template>
          {{ batchMode ? t('songList.actions.exitBatch') : t('songList.actions.batch') }}
        </Button>

        <span v-if="batchMode" class="selected-count">
          {{ t('songList.selectedCount', { count: selectedCount }) }}
        </span>
      </div>
    </div>

    <div v-if="filteredSongs.length === 0" class="empty-state">
      <Music class="empty-icon" />
      <span class="empty-title">
        {{ searchKeyword ? t('songList.noSearchResults') : t('songList.noSongs') }}
      </span>
    </div>

    <div v-else ref="scrollElement" class="song-scroll" @scroll="handleScroll">
      <div class="virtual-space" :style="{ height: `${totalSize}px` }">
        <div
          v-for="virtualRow in virtualRows"
          :key="filteredSongs[virtualRow.index]?.filename"
          class="virtual-row"
          :style="{ transform: `translateY(${virtualRow.start}px)` }"
        >
          <SongActionMenu
            :midi="filteredSongs[virtualRow.index]!"
            :source-type="type"
            :source-song-list-id="songListId"
            trigger="contextmenu"
          >
            <div
              class="song-row"
              :class="{
                'song-row-selected': selectedFilenames.has(filteredSongs[virtualRow.index]!.filename),
              }"
              role="button"
              tabindex="0"
              @click="handleRowClick(filteredSongs[virtualRow.index]!)"
              @dblclick="handleRowDoubleClick(filteredSongs[virtualRow.index]!)"
              @keydown.enter="handleRowClick(filteredSongs[virtualRow.index]!)"
              @keydown.space.prevent="handleRowClick(filteredSongs[virtualRow.index]!)"
            >
              <Checkbox
                v-if="batchMode"
                :checked="selectedFilenames.has(filteredSongs[virtualRow.index]!.filename)"
                class="song-checkbox"
                @click.stop="toggleSong(filteredSongs[virtualRow.index]!)"
              />

              <div class="song-icon">
                <Music :size="18" />
              </div>

              <div class="song-main">
                <Tooltip :title="filteredSongs[virtualRow.index]!.filename">
                  <span class="song-title">{{ filteredSongs[virtualRow.index]!.filename }}</span>
                </Tooltip>
                <span class="song-meta">
                  {{ filteredSongs[virtualRow.index]!.track_count }}
                  {{ t('midi.tracks') }} ·
                  {{ filteredSongs[virtualRow.index]!.melody_note_count || 0 }}
                  {{ t('midi.melodyNotes') }}
                </span>
              </div>

              <span class="song-duration">
                {{ formatDuration(filteredSongs[virtualRow.index]!.duration_ms) }}
              </span>

              <SongActionMenu
                :midi="filteredSongs[virtualRow.index]!"
                :source-type="type"
                :source-song-list-id="songListId"
                trigger="click"
              >
                <button
                  class="song-menu-trigger"
                  :aria-label="t('songList.actions.more')"
                  @click.stop
                >
                  <MoreVertical :size="16" />
                </button>
              </SongActionMenu>
            </div>
          </SongActionMenu>
        </div>
      </div>
    </div>

    <Modal
      :open="confirmDialog.open"
      :title="confirmDialog.title"
      :footer="null"
      width="420"
      centered
      @cancel="resolveConfirmDialog(false)"
    >
      <div class="text-sm leading-6 text-muted-foreground">
        {{ confirmDialog.content }}
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button
          size="small"
          color="primary"
          variant="outlined"
          @click="resolveConfirmDialog(false)"
        >
          {{ t('actions.cancel') }}
        </Button>
        <Button type="primary" size="small" danger @click="resolveConfirmDialog(true)">
          {{ confirmDialog.okText }}
        </Button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.song-collection {
  @apply relative flex min-h-0 flex-1 flex-col;
}

.collection-toolbar {
  @apply flex shrink-0 items-center justify-between gap-3 py-3;
}

.search-input {
  min-width: 180px;
  width: 240px;
  max-width: 30%;
}

.toolbar-actions {
  @apply flex min-w-0 items-center justify-end gap-2;
}

.toolbar-icon {
  width: 15px;
  height: 15px;
  stroke-width: 2.25;
}

.selected-count {
  @apply whitespace-nowrap text-xs font-medium;
  color: var(--color-muted-dark);
}

.song-scroll {
  @apply min-h-0 flex-1 overflow-auto pr-1;
}

.virtual-space {
  @apply relative w-full;
}

.virtual-row {
  @apply absolute left-0 top-0 w-full;
}

.song-row {
  @apply mb-2 flex h-[66px] items-center gap-3 rounded-xl px-3;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-15);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.song-row:hover,
.song-row-selected {
  background: var(--bg-white-95);
  border-color: var(--border-primary-30);
  transform: translateX(3px);
}

.song-checkbox {
  @apply shrink-0;
}

.song-icon {
  @apply flex h-10 w-10 shrink-0 items-center justify-center rounded-xl;
  background: var(--bg-primary-15);
  color: var(--color-primary-active);
}

.song-main {
  @apply min-w-0 flex-1;
}

.song-title {
  @apply block truncate text-sm font-medium;
  color: var(--color-foreground);
}

.song-meta,
.song-duration {
  @apply text-xs;
  color: var(--color-muted);
}

.song-duration {
  @apply w-14 shrink-0 text-right;
}

.song-menu-trigger {
  @apply flex h-8 w-8 shrink-0 items-center justify-center rounded-lg;
  color: var(--color-primary-active);
  transition: background 0.18s ease;
}

.song-menu-trigger:hover {
  background: var(--bg-primary-10);
}

.empty-state {
  @apply flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl;
  background: var(--bg-white-50);
  border: 1px dashed var(--border-primary-20);
}

.empty-icon {
  width: 42px;
  height: 42px;
  color: var(--color-primary-active);
}

.empty-title {
  @apply text-sm font-medium;
  color: var(--color-muted-dark);
}
</style>
