<script setup lang="ts">
/**
 * @description: 歌单详情页面
 */
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { Button, Popover } from 'antdv-next'
import { Edit3, Play } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { useSongListStore } from '@/stores/songLists'
import { freshMainPageLocation } from '@/router/mainNavigation'
import { buildCollectionContext, getSongListSongs } from '../utils'
import SongCollectionView from '../components/SongCollectionView.vue'
import SongListCover from '../components/SongListCover.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const songListStore = useSongListStore()

/**
 * 当前缓存实例所属的歌单 ID。
 *
 * `useRoute()` 始终指向全局当前路由；页面进入 KeepAlive 后若继续直接计算
 * `route.params.id`，打开 MIDI 详情时参数会暂时消失并销毁隐藏页中的列表。
 * 这里让实例持有自己的参数，只在同一详情组件被路由复用时更新。
 */
const songListId = ref(String(route.params.id ?? ''))
const songList = computed(() => songListStore.getSongListById(songListId.value))
const songs = computed(() => getSongListSongs(songList.value, playerStore.midiLibrary))
const coverUrl = computed(() =>
  songList.value?.cover_filename ? songListStore.coverUrls[songList.value.cover_filename] : null
)
const descriptionText = computed(() => songList.value?.description || t('songList.emptyDescription'))
const descriptionRef = ref<HTMLElement | null>(null)
const isDescriptionOverflowing = ref(false)
const isDescriptionPopoverOpen = ref(false)

let descriptionResizeObserver: ResizeObserver | null = null
let pageActive = false

onBeforeRouteUpdate((to) => {
  songListId.value = String(to.params.id ?? '')
})

function updateDescriptionOverflow(): void {
  const element = descriptionRef.value
  if (!element) {
    isDescriptionOverflowing.value = false
    isDescriptionPopoverOpen.value = false
    return
  }

  isDescriptionOverflowing.value = element.scrollWidth > element.clientWidth + 1
  if (!isDescriptionOverflowing.value) {
    isDescriptionPopoverOpen.value = false
  }
}

async function playSongList(): Promise<void> {
  if (!songList.value || songs.value.length === 0) return
  await playerStore.playMidiInQueue(
    songs.value[0],
    songs.value,
    buildCollectionContext(`song-list:${songList.value.id}`, songList.value.name)
  )
}

/**
 * @description: 激活缓存歌单页并恢复描述区域测量
 * @return {void}
 */
function activatePage(): void {
  if (pageActive) return
  pageActive = true
  descriptionResizeObserver = new ResizeObserver(updateDescriptionOverflow)
  if (descriptionRef.value) descriptionResizeObserver.observe(descriptionRef.value)
  void nextTick(updateDescriptionOverflow)
}

/**
 * @description: 停用缓存歌单页并释放观察器与临时浮层
 * @return {void}
 */
function deactivatePage(): void {
  if (!pageActive) return
  pageActive = false
  descriptionResizeObserver?.disconnect()
  descriptionResizeObserver = null
  isDescriptionPopoverOpen.value = false
}

onMounted(activatePage)
onActivated(activatePage)
onDeactivated(deactivatePage)

watch(
  descriptionRef,
  (element, previousElement) => {
    if (previousElement) descriptionResizeObserver?.unobserve(previousElement)
    if (element) descriptionResizeObserver?.observe(element)
    void nextTick(updateDescriptionOverflow)
  },
  { flush: 'post' }
)

watch(descriptionText, () => {
  void nextTick(updateDescriptionOverflow)
})

onBeforeUnmount(deactivatePage)
</script>

<template>
  <section v-if="songList" class="song-list-detail-page">
    <header class="detail-header">
      <SongListCover :src="coverUrl" :alt="songList.name" size="lg" />

      <div class="detail-main">
        <div class="title-row">
          <div class="min-w-0">
            <h1 data-text-selectable class="detail-title">
              {{ songList.name }}
            </h1>
            <p class="detail-count">
              {{ t('songList.totalSongs', { count: songs.length }) }}
            </p>
          </div>
        </div>

        <div class="description-row">
          <p ref="descriptionRef" data-text-selectable class="detail-description">
            {{ descriptionText }}
          </p>
          <Popover
            v-if="isDescriptionOverflowing"
            v-model:open="isDescriptionPopoverOpen"
            trigger="click"
            placement="bottom"
            overlay-class-name="song-list-description-popover"
          >
            <template #content>
              <div data-text-selectable class="description-popover-content">
                {{ descriptionText }}
              </div>
            </template>
            <button type="button" class="description-detail-link">
              {{ t('actions.detail') }}
            </button>
          </Popover>
        </div>

        <div class="detail-bottom-actions">
          <Button type="primary" :disabled="songs.length === 0" @click="playSongList">
            <template #icon>
              <Play class="action-icon" />
            </template>
            {{ t('player.play') }}
          </Button>
          <Button
            @click="
              router.push({ name: 'files-song-list-edit', params: { id: songList.id } })
            "
          >
            <template #icon>
              <Edit3 class="action-icon" />
            </template>
            {{ t('actions.edit') }}
          </Button>
        </div>
      </div>
    </header>

    <SongCollectionView
      type="songList"
      :songs="songs"
      :song-list-id="songList.id"
      :collection-title="songList.name"
    />
  </section>

  <section v-else class="missing-state">
    <span>{{ t('songList.notFound') }}</span>
    <Button
      @click="router.replace(freshMainPageLocation({ name: 'files-all' }, { replace: true }))"
    >
      {{ t('songList.allSongs') }}
    </Button>
  </section>
</template>

<style scoped>
.song-list-detail-page {
  @apply flex h-full min-h-0 flex-col;
}

.detail-header {
  @apply mb-3 flex shrink-0 gap-5 rounded-2xl p-4;
  background: var(--bg-white-60);
  border: 1px solid var(--border-primary-15);
}

.detail-main {
  @apply flex min-w-0 flex-1 flex-col gap-3;
}

.title-row {
  @apply flex min-w-0 items-start justify-between gap-4;
}

.detail-title {
  @apply truncate text-[1.5rem] font-semibold leading-tight;
  color: var(--color-foreground);
}

.detail-count,
.detail-description {
  @apply text-sm;
  color: var(--color-muted-dark);
}

.description-row {
  @apply flex min-w-0 items-center gap-1;
}

.detail-description {
  @apply min-w-0 flex-1 truncate leading-6;
  cursor: default;
}

.description-detail-link {
  @apply inline-flex h-6 shrink-0 items-center rounded px-1 text-sm font-medium transition-colors;
  color: var(--color-primary);
}

.description-detail-link:hover {
  color: var(--color-primary-hover);
  background: var(--bg-primary-10);
}

.detail-actions {
  @apply flex shrink-0 items-center gap-2;
}

.detail-bottom-actions {
  @apply flex shrink-0 items-center gap-2 pt-1;
}

.action-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.25;
}

.missing-state {
  @apply flex h-full flex-col items-center justify-center gap-3 rounded-2xl;
  background: var(--bg-white-50);
  color: var(--color-muted-dark);
}

:global(.song-list-description-popover) {
  max-width: 520px;
}

.description-popover-content {
  @apply max-h-64 max-w-[520px] overflow-auto whitespace-pre-wrap text-sm leading-6;
  color: var(--color-foreground);
}
</style>
