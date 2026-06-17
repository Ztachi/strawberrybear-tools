<script setup lang="ts">
/**
 * @description: Playlist edit page
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, Form, FormItem, Input, Modal, TextArea } from 'antdv-next'
import type { FormInstance } from 'antdv-next'
import { Camera, Save, X } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { useSongListStore } from '@/stores/songLists'
import type { SongList } from '@/types'
import CoverCropperModal from '../components/CoverCropperModal.vue'
import SongListCover from '../components/SongListCover.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const songListStore = useSongListStore()
const playerStore = usePlayerStore()

const formRef = ref<FormInstance | null>(null)
const cropperOpen = ref(false)
const coverData = ref<Uint8Array | null>(null)
const localCoverUrl = ref<string | null>(null)
const initialSnapshot = ref('')
const allowNextRouteLeave = ref(false)
const leaveConfirm = ref<{
  open: boolean
  resolve: CallableFunction | null
}>({
  open: false,
  resolve: null,
})
const formModel = reactive({
  name: '',
  description: '',
  cover_filename: null as string | null,
})

let leaveConfirmPromise: Promise<boolean> | null = null

const songListId = computed(() => String(route.params.id ?? ''))
const songList = computed(() => songListStore.getSongListById(songListId.value))
const coverUrl = computed(() => {
  if (localCoverUrl.value) return localCoverUrl.value
  return formModel.cover_filename ? songListStore.coverUrls[formModel.cover_filename] : null
})

const invalidNameCharacters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

function validateNameCharacters(_rule: unknown, value: string): Promise<void> {
  const hasInvalidCharacter = Array.from(value).some(
    (char) => invalidNameCharacters.has(char) || char.charCodeAt(0) < 32
  )
  return hasInvalidCharacter
    ? Promise.reject(new Error(t('songList.validation.nameInvalid')))
    : Promise.resolve()
}

const formRules = computed(() => ({
  name: [
    { required: true, message: t('songList.validation.nameRequired') },
    { max: 20, message: t('songList.validation.nameMax') },
    { validator: validateNameCharacters },
  ],
  description: [{ max: 1000, message: t('songList.validation.descriptionMax') }],
}))

const currentSnapshot = computed(() =>
  JSON.stringify({
    name: formModel.name,
    description: formModel.description,
    cover_filename: formModel.cover_filename,
    has_cover_data: Boolean(coverData.value),
  })
)

const hasPendingChanges = computed(() => currentSnapshot.value !== initialSnapshot.value)

function snapshotCurrentState(): string {
  return JSON.stringify({
    name: formModel.name,
    description: formModel.description,
    cover_filename: formModel.cover_filename,
    has_cover_data: false,
  })
}

function revokeLocalCoverUrl(): void {
  if (localCoverUrl.value) URL.revokeObjectURL(localCoverUrl.value)
  localCoverUrl.value = null
}

function resetFormFromSongList(nextSongList: SongList | null): void {
  revokeLocalCoverUrl()
  coverData.value = null
  formModel.name = nextSongList?.name ?? ''
  formModel.description = nextSongList?.description ?? ''
  formModel.cover_filename = nextSongList?.cover_filename ?? null
  initialSnapshot.value = snapshotCurrentState()
}

function confirmDiscard(): Promise<boolean> {
  if (leaveConfirmPromise) return leaveConfirmPromise

  leaveConfirmPromise = new Promise((resolve) => {
    leaveConfirm.value = {
      open: true,
      resolve,
    }
  })
  return leaveConfirmPromise
}

function resolveLeaveConfirm(value: boolean): void {
  const resolve = leaveConfirm.value.resolve
  leaveConfirm.value.open = false
  leaveConfirm.value.resolve = null
  leaveConfirmPromise = null
  if (resolve) resolve(value)
}

async function confirmLeaveIfNeeded(): Promise<boolean> {
  if (allowNextRouteLeave.value) {
    allowNextRouteLeave.value = false
    return true
  }
  if (!hasPendingChanges.value) return true
  return confirmDiscard()
}

async function handleCancel(): Promise<void> {
  if (!(await confirmLeaveIfNeeded())) return
  allowNextRouteLeave.value = true
  await router.push({ name: 'files-song-list-detail', params: { id: songListId.value } })
}

async function handleSave(): Promise<void> {
  if (!songList.value) return
  await formRef.value?.validate()
  let coverFilename = formModel.cover_filename
  if (coverData.value) {
    coverFilename = await songListStore.saveCover(songList.value.id, coverData.value)
    if (!coverFilename) return
  }

  const saved = await songListStore.saveSongList({
    ...songList.value,
    name: formModel.name.trim(),
    description: formModel.description.trim(),
    cover_filename: coverFilename,
  })
  if (!saved) return

  await playerStore.syncActivePreviewQueue()
  resetFormFromSongList(saved)
  await router.push({ name: 'files-song-list-detail', params: { id: saved.id } })
}

function handleCoverConfirm(data: Uint8Array): void {
  revokeLocalCoverUrl()
  coverData.value = data
  localCoverUrl.value = URL.createObjectURL(new Blob([data], { type: 'image/png' }))
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasPendingChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

watch(
  songList,
  (nextSongList) => {
    resetFormFromSongList(nextSongList)
  },
  { immediate: true }
)

onBeforeRouteLeave(async () => confirmLeaveIfNeeded())

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  resolveLeaveConfirm(false)
  revokeLocalCoverUrl()
})
</script>

<template>
  <section v-if="songList" class="song-list-edit-page">
    <header class="edit-header">
      <h1 class="edit-title">
        {{ t('songList.editTitle') }}
      </h1>
      <div class="edit-actions">
        <Button @click="handleCancel">
          <template #icon>
            <X class="action-icon" />
          </template>
          {{ t('actions.cancel') }}
        </Button>
        <Button type="primary" @click="handleSave">
          <template #icon>
            <Save class="action-icon" />
          </template>
          {{ t('actions.save') }}
        </Button>
      </div>
    </header>

    <div class="edit-body">
      <button class="cover-editor" @click="cropperOpen = true">
        <SongListCover :src="coverUrl" :alt="formModel.name" size="lg" />
        <span class="cover-overlay">
          <Camera class="cover-icon" />
          {{ t('songList.cover.edit') }}
        </span>
      </button>

      <Form ref="formRef" class="edit-form" layout="vertical" :model="formModel" :rules="formRules">
        <FormItem :label="t('songList.fields.name')" name="name">
          <Input v-model:value="formModel.name" :maxlength="20" allow-clear show-count />
        </FormItem>

        <FormItem :label="t('songList.fields.description')" name="description">
          <TextArea
            v-model:value="formModel.description"
            :maxlength="1000"
            allow-clear
            show-count
            class="description-textarea"
          />
        </FormItem>
      </Form>
    </div>

    <CoverCropperModal v-model:open="cropperOpen" @confirm="handleCoverConfirm" />

    <Modal
      :open="leaveConfirm.open"
      :title="t('songList.confirm.leaveTitle')"
      :footer="null"
      width="420"
      centered
      @cancel="resolveLeaveConfirm(false)"
    >
      <div class="text-sm leading-6 text-muted-foreground">
        {{ t('songList.confirm.leaveDescription') }}
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button size="small" color="primary" variant="outlined" @click="resolveLeaveConfirm(false)">
          {{ t('actions.cancel') }}
        </Button>
        <Button type="primary" size="small" danger @click="resolveLeaveConfirm(true)">
          {{ t('songList.confirm.discard') }}
        </Button>
      </div>
    </Modal>
  </section>

  <section v-else class="missing-state">
    <span>{{ t('songList.notFound') }}</span>
    <Button @click="router.push({ name: 'files-all' })">
      {{ t('songList.allSongs') }}
    </Button>
  </section>
</template>

<style scoped>
.song-list-edit-page {
  @apply flex h-full min-h-0 flex-col;
}

.edit-header {
  @apply mb-4 flex shrink-0 items-center justify-between gap-4;
}

.edit-title {
  @apply text-2xl font-semibold;
  color: var(--color-foreground);
}

.edit-actions {
  @apply flex items-center gap-2;
}

.action-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.25;
}

.edit-body {
  @apply flex min-h-0 gap-8 rounded-2xl p-5;
  background: var(--bg-white-60);
  border: 1px solid var(--border-primary-15);
}

.cover-editor {
  @apply relative h-36 w-36 shrink-0 overflow-hidden rounded-xl;
}

.cover-overlay {
  @apply absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-2 text-sm font-medium;
  background: rgba(74, 63, 63, 0.58);
  color: var(--color-white);
}

.cover-icon {
  width: 15px;
  height: 15px;
  stroke-width: 2.25;
}

.edit-form {
  @apply min-w-0 flex-1;
}

.description-textarea :deep(textarea) {
  height: 220px;
  resize: none;
  overflow-y: auto;
}

.missing-state {
  @apply flex h-full flex-col items-center justify-center gap-3 rounded-2xl;
  background: var(--bg-white-50);
  color: var(--color-muted-dark);
}
</style>
