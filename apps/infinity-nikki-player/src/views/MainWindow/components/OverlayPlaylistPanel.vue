<script setup lang="ts">
/** 悬浮列表的浏览条件独立于播放队列；只有点击歌曲才提交完整集合。 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConfigProvider, Input, Select, Tooltip } from 'antdv-next'
import { Crosshair, Search } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { useSongListStore } from '@/stores/songLists'
import type { MidiInfo } from '@/types'
import type { MidiPreviewQueueContext } from '@/features/player/midiPreview'
import { getMidiDisplayName } from '@/lib/midiDisplay'
import PlaylistSongTitle from '@/components/PlaylistSongTitle/index.vue'
import { buildCollectionContext, formatDuration, getSongListSongs } from '../FilesTab/utils'

const props = defineProps<{ expanded: boolean }>()
const emit = defineEmits<{
  play: [midi: MidiInfo, items: MidiInfo[], context: MidiPreviewQueueContext]
}>()
const { t } = useI18n()
const player = usePlayerStore()
const songLists = useSongListStore()
const query = ref('')
const selectOpen = ref(false)
const playlist = ref<HTMLElement | null>(null)
const options = computed(() => [
  { value: 'all', label: t('overlay.allSongs') },
  ...songLists.songLists.map((list) => ({ value: `song-list:${list.id}`, label: list.name })),
])
function availableCollection(id: string | undefined): string {
  return typeof id === 'string' && options.value.some((option) => option.value === id) ? id : 'all'
}
const collectionId = ref(availableCollection(player.previewQueueContext?.id))
const selectedSongList = computed(() => songLists.getSongListById(collectionId.value.slice('song-list:'.length)))
const collectionSongs = computed(() => collectionId.value === 'all'
  ? player.midiLibrary
  : getSongListSongs(selectedSongList.value, player.midiLibrary))
const filteredSongs = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return term ? collectionSongs.value.filter((song) => getMidiDisplayName(song).toLocaleLowerCase().includes(term)) : collectionSongs.value
})
const emptyText = computed(() => collectionSongs.value.length
  ? t('songList.noSearchResults')
  : t(collectionId.value === 'all' ? 'midi.libraryEmpty' : 'songList.noSongs'))
function isCurrentSong(song: MidiInfo): boolean {
  return player.isMidiSelectedInQueue(song.filename, collectionId.value)
}
const canLocate = computed(() =>
  options.value.some(option => option.value === player.previewQueueContext?.id) &&
  player.midiLibrary.some((song) => song.filename === player.currentMidi?.filename)
)

watch(options, () => { collectionId.value = availableCollection(collectionId.value) })
watch(() => props.expanded, (expanded) => { if (!expanded) selectOpen.value = false })
// DOM 更新后重置浏览位置；定位的 nextTick 则在这次重置之后执行。
watch([query, collectionId], () => {
  playlist.value?.scrollTo({ top: 0 })
}, { flush: 'post' })
function selectCollection(value: unknown): void {
  if (typeof value === 'string') collectionId.value = availableCollection(value)
}
function play(song: MidiInfo): void {
  const title = collectionId.value === 'all' ? t('overlay.allSongs') : selectedSongList.value!.name
  emit('play', song, [...collectionSongs.value], buildCollectionContext(collectionId.value, title))
}
/** 定位可恢复可见的当前歌曲，但不会更换播放域或启动播放。 */
async function locateCurrent(): Promise<void> {
  if (!canLocate.value) return
  query.value = ''
  // 当前浏览歌单也可能包含同一歌曲，定位必须回到实际播放来源。
  collectionId.value = availableCollection(player.previewQueueContext?.id)
  await nextTick()
  playlist.value?.querySelector('.playlist-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <div v-show="expanded" class="expand-panel">
    <ConfigProvider
      :theme="{
        token: { controlHeightSM: 24, fontSize: 12, borderRadius: 6 },
        components: { Select: { optionHeight: 24, optionFontSize: 12, optionPadding: '2px 8px' } },
      }"
    >
      <div class="overlay-playlist-toolbar">
        <Input
          v-model:value="query"
          size="small"
          allow-clear
          :placeholder="t('songList.searchPlaceholder')"
          :aria-label="t('songList.searchPlaceholder')"
          class="min-w-0 flex-1"
        >
          <template #prefix>
            <Search :size="13" :stroke-width="2" aria-hidden="true" />
          </template>
        </Input>
        <label
          for="overlay-playlist-collection"
          class="sr-only"
          >{{ t('overlay.selectPlaylist') }}</label
        >
        <Select
          id="overlay-playlist-collection"
          :open="selectOpen"
          :value="collectionId"
          :options="options"
          :aria-label="t('overlay.selectPlaylist')"
          size="small"
          show-search
          option-filter-prop="label"
          :list-height="96"
          :list-item-height="24"
          :classes="{ popup: { root: 'overlay-playlist-select-popup' } }"
          class="w-[132px] shrink-0"
          @open-change="selectOpen = $event"
          @update:value="selectCollection"
        />
      </div>
    </ConfigProvider>
    <div ref="playlist" class="playlist" :aria-label="t('overlay.playlist')">
      <button
        v-for="song in filteredSongs"
        :key="song.filename"
        type="button"
        class="playlist-item"
        :class="{ active: isCurrentSong(song) }"
        @click="play(song)"
      >
        <Tooltip :title="getMidiDisplayName(song)">
          <PlaylistSongTitle
            class="playlist-name"
            :text="getMidiDisplayName(song)"
            :selected="isCurrentSong(song)"
          />
        </Tooltip>
        <span class="playlist-duration">{{ formatDuration(song.duration_ms) }}</span>
      </button>
      <div v-if="!filteredSongs.length" class="playlist-empty">
        {{ emptyText }}
      </div>
    </div>
    <Tooltip :title="t('overlay.locateCurrent')" placement="left">
      <button
        type="button"
        class="locate-current-btn nikki-icon-button"
        :aria-label="t('overlay.locateCurrent')"
        :disabled="!canLocate"
        @click="locateCurrent"
      >
        <Crosshair :size="16" :stroke-width="2.25" aria-hidden="true" />
      </button>
    </Tooltip>
  </div>
</template>

<style scoped>
.expand-panel {
  @apply absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden;
  top: 156px;
  background: rgba(255, 255, 255, 0.92);
}
.overlay-playlist-toolbar {
  @apply flex shrink-0 items-center gap-1.5 border-b border-primary/15 px-2 py-1.5;
}
.playlist {
  @apply min-h-0 flex-1 overflow-y-auto p-1.5;
}
.playlist-item {
  @apply flex w-full cursor-pointer items-center justify-between rounded-md border-0 bg-transparent px-2 py-1.5 text-left;
}
.playlist-item:hover {
  background: rgba(247, 192, 193, 0.1);
}
.playlist-item.active {
  background: rgba(247, 192, 193, 0.2);
}
.playlist-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.playlist-name {
  @apply mr-3 min-w-0 flex-1 truncate text-xs;
  color: var(--color-foreground);
}
.playlist-duration {
  @apply font-mono text-xs;
  color: var(--color-muted-dark);
}
.playlist-empty {
  @apply px-2 py-5 text-center text-xs;
  color: var(--color-muted-dark);
}
.locate-current-btn {
  @apply absolute bottom-2 right-2 flex size-5 cursor-pointer items-center justify-center rounded disabled:cursor-default disabled:opacity-40;
  --control-hover-bg: transparent;
  --control-active-bg: transparent;
  background: transparent;
}
</style>
