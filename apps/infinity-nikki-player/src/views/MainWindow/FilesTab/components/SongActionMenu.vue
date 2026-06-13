<script setup lang="ts">
/**
 * @description: Song action menu
 * @description Shared by row action button and row context menu.
 */
import { computed, h, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Dropdown, Modal } from 'antdv-next'
import { ListMinus, Plus, Trash2 } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { useSongListStore } from '@/stores/songLists'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import type { MidiInfo } from '@/types'

const props = defineProps<{
  midi: MidiInfo
  sourceType: 'all' | 'songList'
  sourceSongListId?: string
  trigger?: 'click' | 'contextmenu'
}>()

const emit = defineEmits<{
  removed: [filename: string]
  deleted: [filename: string]
  added: [songListId: string]
}>()

const { t } = useI18n()
const playerStore = usePlayerStore()
const songListStore = useSongListStore()
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

let confirmPromise: Promise<boolean> | null = null

const addableSongLists = computed(() =>
  songListStore.songLists.filter((songList) => !songList.song_filenames.includes(props.midi.filename))
)

const menuItems = computed(() => {
  const items = []
  if (props.sourceType === 'songList') {
    items.push({
      key: 'remove-from-song-list',
      label: t('songList.actions.removeFromSongList'),
      icon: h(ListMinus, { class: 'h-4 w-4', strokeWidth: 2.2 }),
    })
  }
  items.push({
    key: 'delete-file',
    label: t('songList.actions.deleteFile'),
    icon: h(Trash2, { class: 'h-4 w-4', strokeWidth: 2.2 }),
    danger: true,
  })
  items.push({
    key: 'add-to',
    label: t('songList.actions.addTo'),
    icon: h(Plus, { class: 'h-4 w-4', strokeWidth: 2.2 }),
    disabled: addableSongLists.value.length === 0,
    children: addableSongLists.value.map((songList) => ({
      key: `add-to:${songList.id}`,
      label: songList.name,
    })),
  })
  return items
})

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

async function removeFromSongList(): Promise<void> {
  if (!props.sourceSongListId) return
  const confirmed = await confirmAction(
    t('songList.confirm.removeSongTitle'),
    t('songList.confirm.removeSongDescription'),
    t('songList.actions.removeFromSongList')
  )
  if (!confirmed) return
  const songList = await songListStore.removeSongs(props.sourceSongListId, [props.midi.filename])
  if (songList) emit('removed', props.midi.filename)
}

async function deleteFile(): Promise<void> {
  const confirmed = await confirmAction(
    t('songList.confirm.deleteFileTitle'),
    t('songList.confirm.deleteFileDescription'),
    t('songList.actions.deleteFile')
  )
  if (!confirmed) return
  const deleted = await playerStore.deleteMidi(props.midi.filename)
  if (deleted) emit('deleted', props.midi.filename)
}

async function addToSongList(songListId: string): Promise<void> {
  const songList = await songListStore.addSongs(songListId, [props.midi.filename])
  if (songList) emit('added', songListId)
}

function handleMenuClick(info: { key: string | number }): void {
  const key = String(info.key)
  if (key === 'remove-from-song-list') {
    void removeFromSongList()
    return
  }
  if (key === 'delete-file') {
    void deleteFile()
    return
  }
  if (key.startsWith('add-to:')) {
    void addToSongList(key.slice('add-to:'.length))
  }
}

onBeforeUnmount(() => {
  resolveConfirmDialog(false)
})
</script>

<template>
  <Dropdown
    :trigger="[trigger ?? 'click']"
    placement="bottomRight"
    :get-popup-container="getMainWindowPopupContainer"
    :menu="{ items: menuItems, onClick: handleMenuClick }"
  >
    <slot />
  </Dropdown>

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
      <Button size="small" color="primary" variant="outlined" @click="resolveConfirmDialog(false)">
        {{ t('actions.cancel') }}
      </Button>
      <Button type="primary" size="small" danger @click="resolveConfirmDialog(true)">
        {{ confirmDialog.okText }}
      </Button>
    </div>
  </Modal>
</template>
