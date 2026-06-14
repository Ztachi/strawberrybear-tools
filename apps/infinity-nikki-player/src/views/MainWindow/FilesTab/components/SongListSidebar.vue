<script setup lang="ts">
/**
 * @description: Files page playlist sidebar
 * @description Contains app navigation, playlist list, and playlist import/export actions.
 */
import { computed, h, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Button, Dropdown, Input, Modal, Tooltip } from 'antdv-next'
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  Edit3,
  FileArchive,
  LayoutGrid,
  ListMusic,
  Play,
  Plus,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useSongListStore } from '@/stores/songLists'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import { saveSettings } from '@/lib/settings'
import type { SongList } from '@/types'
import type { RouteLocationRaw } from 'vue-router'
import { buildCollectionContext, getSongListSongs } from '../utils'
import SongListCover from './SongListCover.vue'

type MainWindowTab = 'files' | 'templates' | 'online'
type FocusableInputRef = {
  focus?: () => void
  input?: HTMLInputElement
  $el?: Element
}

const props = defineProps<{
  requestNavigate?: CallableFunction
}>()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const songListStore = useSongListStore()

const editingSongListId = ref<string | null>(null)
const editingName = ref('')
const isCreatingSongList = ref(false)
const creatingName = ref('')
const createInputRef = ref<FocusableInputRef | null>(null)
const renameInputRef = ref<FocusableInputRef | null>(null)
const collapsed = computed(() => settingsStore.songListSidebarCollapsed)
const openSongListMenuId = ref<string | null>(null)
const deleteConfirm = ref<{
  open: boolean
  title: string
  content: string
  resolve: CallableFunction | null
}>({
  open: false,
  title: '',
  content: '',
  resolve: null,
})

let deleteConfirmPromise: Promise<boolean> | null = null

const activeSongListId = computed(() =>
  route.name === 'files-song-list-detail' || route.name === 'files-song-list-edit'
    ? String(route.params.id ?? '')
    : null
)

const isAllSongsActive = computed(() => route.name === 'files-all')
const isTemplatesActive = computed(() => route.name === 'templates')
const isOnlineActive = computed(() => route.name === 'online-library')

function getDefaultRoute(tab: MainWindowTab): RouteLocationRaw {
  if (tab === 'templates') return { name: 'templates' }
  if (tab === 'online') return { name: 'online-library' }
  return { name: 'files-all' }
}

async function navigateMain(tab: MainWindowTab, target?: RouteLocationRaw): Promise<boolean> {
  if (props.requestNavigate) {
    return (await props.requestNavigate(tab, target)) !== false
  }
  await router.push(target ?? getDefaultRoute(tab))
  return true
}

function getDefaultSongListName(): string {
  const baseName = t('songList.defaultName')
  const separator = locale.value === 'zh-CN' ? '' : ' '
  const existingNames = new Set(songListStore.songLists.map((songList) => songList.name))
  if (!existingNames.has(baseName)) return baseName

  let suffix = 1
  while (existingNames.has(`${baseName}${separator}${suffix}`)) {
    suffix += 1
  }
  return `${baseName}${separator}${suffix}`
}

function resolveInputRef(refValue: unknown): FocusableInputRef | null {
  if (Array.isArray(refValue)) return (refValue[0] as FocusableInputRef | undefined) ?? null
  return (refValue as FocusableInputRef | null) ?? null
}

function setCreateInputRef(refValue: unknown): void {
  createInputRef.value = resolveInputRef(refValue)
}

function setRenameInputRef(refValue: unknown): void {
  renameInputRef.value = resolveInputRef(refValue)
}

function findNativeInput(inputRef: FocusableInputRef | null, selector: string): HTMLInputElement | null {
  if (inputRef?.input instanceof HTMLInputElement) return inputRef.input
  if (inputRef?.$el instanceof HTMLInputElement) return inputRef.$el
  if (inputRef?.$el instanceof HTMLElement) {
    const nestedInput = inputRef.$el.querySelector<HTMLInputElement>('input')
    if (nestedInput) return nestedInput
  }
  return document.querySelector<HTMLInputElement>(selector)
}

function waitForCurrentEventLoop(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

async function focusInput(inputRef: FocusableInputRef | null, selector: string): Promise<void> {
  await nextTick()
  await waitForAnimationFrame()
  const inputElement = findNativeInput(inputRef, selector)
  if (!inputElement) {
    inputRef?.focus?.()
    return
  }
  inputElement.focus({ preventScroll: true })
  inputElement?.select()
}

async function setSidebarCollapsed(nextCollapsed: boolean): Promise<void> {
  if (typeof settingsStore.setSongListSidebarCollapsed === 'function') {
    await settingsStore.setSongListSidebarCollapsed(nextCollapsed)
    return
  }
  settingsStore.songListSidebarCollapsed = nextCollapsed
  await saveSettings({
    locale: settingsStore.locale,
    current_template_id: settingsStore.currentTemplateId,
    play_mode: settingsStore.playMode,
    enable_keyboard_sim: settingsStore.enableKeyboardSim,
    auto_fps_enabled: settingsStore.autoFpsEnabled,
    manual_fps: settingsStore.manualFps,
    last_detected_fps: settingsStore.lastDetectedFps,
    playlist_playback_mode: settingsStore.playlistPlaybackMode,
    song_list_sidebar_collapsed: nextCollapsed,
  })
}

async function createSongList(): Promise<void> {
  if (collapsed.value) await setSidebarCollapsed(false)
  editingSongListId.value = null
  editingName.value = ''
  creatingName.value = getDefaultSongListName()
  isCreatingSongList.value = true
  await focusInput(createInputRef.value, 'input.create-input, .create-input input')
}

async function commitCreateSongList(): Promise<void> {
  if (!isCreatingSongList.value) return
  const nextName = creatingName.value.trim() || getDefaultSongListName()
  isCreatingSongList.value = false
  creatingName.value = ''
  const songList = await songListStore.createSongList(nextName)
  if (!songList) return
}

function cancelCreateSongList(): void {
  isCreatingSongList.value = false
  creatingName.value = ''
}

async function startRename(songList: SongList): Promise<void> {
  isCreatingSongList.value = false
  creatingName.value = ''
  editingSongListId.value = songList.id
  editingName.value = songList.name
  await focusInput(renameInputRef.value, 'input.rename-input, .rename-input input')
}

async function startRenameAfterMenuClose(songList: SongList): Promise<void> {
  openSongListMenuId.value = null
  await waitForCurrentEventLoop()
  await startRename(songList)
}

function handleSongListMenuOpenChange(songList: SongList, open: boolean): void {
  if (open) {
    openSongListMenuId.value = songList.id
    return
  }
  if (openSongListMenuId.value === songList.id) {
    openSongListMenuId.value = null
  }
}

async function commitRename(songList: SongList): Promise<void> {
  const nextName = editingName.value.trim()
  if (!nextName || nextName === songList.name) {
    editingSongListId.value = null
    editingName.value = ''
    return
  }
  const renamed = await songListStore.renameSongList(songList.id, nextName)
  if (renamed) {
    editingSongListId.value = null
    editingName.value = ''
  }
}

function cancelRename(): void {
  editingSongListId.value = null
  editingName.value = ''
}

function getPlaylistMenuItems(songList: SongList) {
  const songs = getSongListSongs(songList, playerStore.midiLibrary)
  return [
    {
      key: 'play',
      label: t('player.play'),
      icon: Play,
      disabled: songs.length === 0,
    },
    {
      key: 'delete',
      label: t('actions.delete'),
      icon: Trash2,
      danger: true,
    },
    {
      key: 'rename',
      label: t('songList.actions.rename'),
      icon: Edit3,
    },
    {
      key: 'export',
      label: t('songList.actions.export'),
      icon: Download,
    },
  ].map((item) => ({
    ...item,
    icon: item.icon
      ? hIcon(item.icon)
      : undefined,
  }))
}

function hIcon(Icon: typeof Play) {
  // Dropdown menu item icons accept VNode; render function keeps lucide sizing consistent.
  return h(Icon, { class: 'h-4 w-4', strokeWidth: 2.2 })
}

function ensureZipPath(path: string): string {
  return path.toLowerCase().endsWith('.zip') ? path : `${path}.zip`
}

async function playSongList(songList: SongList): Promise<void> {
  const songs = getSongListSongs(songList, playerStore.midiLibrary)
  if (songs.length === 0) return
  await playerStore.playMidiInQueue(songs[0], songs, buildCollectionContext(`song-list:${songList.id}`, songList.name))
}

function confirmDelete(songList: SongList): Promise<boolean> {
  if (deleteConfirmPromise) return deleteConfirmPromise

  deleteConfirmPromise = new Promise((resolve) => {
    deleteConfirm.value = {
      open: true,
      title: t('songList.confirm.deleteTitle'),
      content: t('songList.confirm.deleteDescription', { name: songList.name }),
      resolve,
    }
  })
  return deleteConfirmPromise
}

function resolveDeleteConfirm(value: boolean): void {
  const resolve = deleteConfirm.value.resolve
  deleteConfirm.value.open = false
  deleteConfirm.value.resolve = null
  deleteConfirmPromise = null
  if (resolve) resolve(value)
}

async function deleteSongList(songList: SongList): Promise<void> {
  const confirmed = await confirmDelete(songList)
  if (!confirmed) return
  const deleted = await songListStore.deleteSongList(songList.id)
  if (deleted && activeSongListId.value === songList.id) {
    await navigateMain('files', { name: 'files-all' })
  }
}

async function exportSongLists(songListIds: string[]): Promise<void> {
  const targetPath = await save({
    defaultPath: songListIds.length === 1 ? 'song-list.zip' : 'song-lists.zip',
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  if (!targetPath) return
  await songListStore.exportArchive(songListIds, ensureZipPath(targetPath))
}

async function importSongLists(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  if (!selected || Array.isArray(selected)) return
  const imported = await songListStore.importArchive(selected)
  await playerStore.loadMidiLibrary()
  if (imported[0]) {
    await navigateMain('files', { name: 'files-song-list-detail', params: { id: imported[0].id } })
  }
}

async function handlePlaylistMenu(songList: SongList, info: { key: string | number }): Promise<void> {
  const key = String(info.key)
  if (key === 'play') {
    await playSongList(songList)
    return
  }
  if (key === 'delete') {
    await deleteSongList(songList)
    return
  }
  if (key === 'rename') {
    await startRenameAfterMenuClose(songList)
    return
  }
  if (key === 'export') {
    await exportSongLists([songList.id])
  }
}

onBeforeUnmount(() => {
  resolveDeleteConfirm(false)
})
</script>

<template>
  <aside class="song-list-sidebar" :class="{ 'song-list-sidebar-collapsed': collapsed }">
    <div class="sidebar-nav">
      <Tooltip :title="collapsed ? t('songList.allSongs') : ''" placement="right">
        <button
          class="sidebar-nav-item"
          :class="{ 'sidebar-entry-active': isAllSongsActive }"
          @click="navigateMain('files', { name: 'files-all' })"
        >
          <div class="sidebar-nav-icon">
            <ListMusic :size="18" />
          </div>
          <span
            v-if="!collapsed"
            class="min-w-0 flex-1 truncate"
            >{{ t('songList.allSongs') }}</span
          >
          <span v-if="!collapsed" class="song-count">{{ playerStore.midiLibrary.length }}</span>
        </button>
      </Tooltip>

      <Tooltip :title="collapsed ? t('tabs.templates') : ''" placement="right">
        <button
          class="sidebar-nav-item"
          :class="{ 'sidebar-entry-active': isTemplatesActive }"
          @click="navigateMain('templates')"
        >
          <div class="sidebar-nav-icon">
            <LayoutGrid :size="18" />
          </div>
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ t('tabs.templates') }}</span>
        </button>
      </Tooltip>

      <Tooltip :title="collapsed ? t('tabs.onlineLibrary') : ''" placement="right">
        <button
          class="sidebar-nav-item"
          :class="{ 'sidebar-entry-active': isOnlineActive }"
          @click="navigateMain('online')"
        >
          <div class="sidebar-nav-icon">
            <Cloud :size="18" />
          </div>
          <span
            v-if="!collapsed"
            class="min-w-0 flex-1 truncate"
            >{{ t('tabs.onlineLibrary') }}</span
          >
        </button>
      </Tooltip>
    </div>

    <div v-if="!collapsed" class="sidebar-section-header">
      <span>{{ t('songList.title') }}</span>
      <div class="header-actions">
        <Tooltip :title="t('songList.actions.import')">
          <Button type="text" size="small" class="header-action-btn" @click="importSongLists">
            <template #icon>
              <Upload class="header-action-icon" />
            </template>
          </Button>
        </Tooltip>
        <Tooltip :title="t('songList.actions.exportAll')">
          <Button
            type="text"
            size="small"
            class="header-action-btn"
            :disabled="songListStore.songLists.length === 0"
            @click="exportSongLists(songListStore.songLists.map((songList) => songList.id))"
          >
            <template #icon>
              <FileArchive class="header-action-icon" />
            </template>
          </Button>
        </Tooltip>
        <Tooltip :title="t('actions.add')">
          <Button
            type="primary"
            size="small"
            class="header-action-btn header-action-create-btn"
            @click="createSongList"
          >
            <template #icon>
              <Plus class="header-action-icon" />
            </template>
          </Button>
        </Tooltip>
      </div>
    </div>

    <div class="playlist-list">
      <div
        v-if="isCreatingSongList && !collapsed"
        class="playlist-entry playlist-entry-editing"
        @focusout="commitCreateSongList"
      >
        <SongListCover :src="null" :alt="creatingName" size="sm" />
        <Input
          :ref="setCreateInputRef"
          v-model:value="creatingName"
          autofocus
          size="small"
          :maxlength="20"
          allow-clear
          class="create-input"
          @click.stop
          @keydown.enter.prevent="commitCreateSongList"
          @keydown.esc.prevent="cancelCreateSongList"
        />
      </div>

      <template v-for="songList in songListStore.songLists" :key="songList.id">
        <div
          v-if="editingSongListId === songList.id && !collapsed"
          class="playlist-entry playlist-entry-editing"
        >
          <SongListCover
            :src="songList.cover_filename ? songListStore.coverUrls[songList.cover_filename] : null"
            :alt="songList.name"
            size="sm"
          />
          <Input
            :ref="setRenameInputRef"
            v-model:value="editingName"
            autofocus
            size="small"
            :maxlength="20"
            allow-clear
            class="rename-input"
            @click.stop
            @keydown.enter.prevent="commitRename(songList)"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename(songList)"
          />
          <span class="song-count">{{ songList.song_filenames.length }}</span>
        </div>

        <Dropdown
          v-else
          :trigger="['contextmenu']"
          :open="openSongListMenuId === songList.id"
          placement="bottomLeft"
          :get-popup-container="getMainWindowPopupContainer"
          :menu="{ items: getPlaylistMenuItems(songList) }"
          @open-change="(open) => handleSongListMenuOpenChange(songList, open)"
          @menu-click="(info) => handlePlaylistMenu(songList, info)"
        >
          <Tooltip :title="songList.name" placement="right">
            <div
              class="playlist-entry"
              :class="{ 'sidebar-entry-active': activeSongListId === songList.id }"
              role="button"
              tabindex="0"
              @click="navigateMain('files', { name: 'files-song-list-detail', params: { id: songList.id } })"
              @keydown.enter="navigateMain('files', { name: 'files-song-list-detail', params: { id: songList.id } })"
              @keydown.space.prevent="navigateMain('files', { name: 'files-song-list-detail', params: { id: songList.id } })"
            >
              <SongListCover
                :src="songList.cover_filename ? songListStore.coverUrls[songList.cover_filename] : null"
                :alt="songList.name"
                size="sm"
              />
              <span v-if="!collapsed" class="playlist-name">{{ songList.name }}</span>
              <span v-if="!collapsed" class="song-count">{{ songList.song_filenames.length }}</span>
            </div>
          </Tooltip>
        </Dropdown>
      </template>
    </div>

    <div class="sidebar-footer">
      <Tooltip
        :title="collapsed ? t('songList.actions.expandSidebar') : t('songList.actions.collapseSidebar')"
        placement="right"
      >
        <Button
          color="primary"
          variant="outlined"
          size="small"
          class="collapse-btn"
          :aria-label="collapsed ? t('songList.actions.expandSidebar') : t('songList.actions.collapseSidebar')"
          @click="setSidebarCollapsed(!collapsed)"
        >
          <template #icon>
            <ChevronRight v-if="collapsed" class="header-action-icon" />
            <ChevronLeft v-else class="header-action-icon" />
          </template>
        </Button>
      </Tooltip>
    </div>

    <Modal
      :open="deleteConfirm.open"
      :title="deleteConfirm.title"
      :footer="null"
      width="420"
      centered
      @cancel="resolveDeleteConfirm(false)"
    >
      <div class="text-sm leading-6 text-muted-foreground">
        {{ deleteConfirm.content }}
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button
          size="small"
          color="primary"
          variant="outlined"
          @click="resolveDeleteConfirm(false)"
        >
          {{ t('actions.cancel') }}
        </Button>
        <Button type="primary" size="small" danger @click="resolveDeleteConfirm(true)">
          {{ t('actions.delete') }}
        </Button>
      </div>
    </Modal>
  </aside>
</template>

<style scoped>
.song-list-sidebar {
  @apply flex h-full w-[220px] shrink-0 flex-col gap-3 rounded-2xl p-3;
  background: var(--bg-white-50);
  border: 1px solid var(--border-primary-15);
  transition: width 0.2s ease;
}

.song-list-sidebar-collapsed {
  @apply w-[64px] items-center px-2;
}

.sidebar-nav {
  @apply flex shrink-0 flex-col gap-1;
}

.sidebar-nav-item,
.playlist-entry {
  @apply flex w-full items-center gap-3 rounded-xl px-2.5 text-left;
  min-height: 48px;
  color: var(--color-foreground);
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.sidebar-nav-item,
.playlist-entry {
  border: 1px solid transparent;
}

.sidebar-nav-item:hover,
.playlist-entry:hover,
.sidebar-entry-active {
  background: var(--bg-white-90);
  border-color: var(--border-primary-30);
}

.song-list-sidebar-collapsed .sidebar-nav-item,
.song-list-sidebar-collapsed .playlist-entry {
  @apply justify-center px-0;
  width: 44px;
}

.sidebar-nav-icon {
  @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-lg;
  background: var(--bg-primary-15);
  color: var(--color-primary-active);
}

.collapse-btn {
  @apply h-9 w-9 rounded-xl;
  background: var(--bg-white-70);
  border-color: var(--border-primary-30);
  color: var(--color-primary-active);
  box-shadow: 0 8px 24px rgba(201, 67, 127, 0.1);
}

.song-count {
  @apply shrink-0 text-xs;
  color: var(--color-muted);
}

.sidebar-section-header {
  @apply flex shrink-0 items-center justify-between gap-2 px-1 text-sm font-semibold;
  color: var(--color-muted-dark);
}

.song-list-sidebar-collapsed .sidebar-section-header {
  @apply flex-col px-0;
}

.header-actions {
  @apply flex items-center gap-0.5;
}

.song-list-sidebar-collapsed .header-actions {
  @apply flex-col;
}

.header-action-btn {
  @apply h-7 w-7 rounded-lg;
}

.header-action-create-btn {
  @apply ml-1.5 text-white;
}

.header-action-icon {
  width: 15px;
  height: 15px;
  stroke-width: 2.25;
}

.playlist-list {
  @apply min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1;
}

.song-list-sidebar-collapsed .playlist-list {
  @apply w-full overflow-x-hidden pr-0;
}

.playlist-name {
  @apply min-w-0 flex-1 truncate text-sm font-medium;
}

.playlist-entry-editing {
  background: var(--bg-white-90);
  border-color: var(--border-primary-30);
}

.rename-input,
.create-input {
  @apply min-w-0 flex-1;
}

.sidebar-footer {
  @apply flex shrink-0 justify-start pt-1;
}

.song-list-sidebar-collapsed .sidebar-footer {
  @apply justify-start;
}
</style>
