<script setup lang="ts">
/**
 * @description: 总览轨道行右侧的轨道操作菜单，经 Teleport 放入卷帘控制器提供的容器
 */
import { computed, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Dropdown, Input, Modal } from 'antdv-next'
import {
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Drum,
  MoreVertical,
  Palette,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import { TRACK_PALETTE } from '@strawberrybear/midi-editor'
import type { EditorAction } from '@strawberrybear/midi-editor'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import type { PianoRollTrackActionsContext } from '@strawberrybear/piano-roll/browser'
import type { PianoTrackHost } from '@/components/PianoWorkspace/usePianoTrackHosts'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'

const props = defineProps<{
  hosts: ReadonlyMap<HTMLElement, PianoTrackHost<PianoRollTrackActionsContext>>
  tracks: readonly PianoRollTrack[]
}>()
const emit = defineEmits<{
  dispatch: [action: EditorAction]
  /** 删除需由页面确认（含音符时提示）。 */
  'remove-track': [track: PianoRollTrack]
}>()
const { t } = useI18n()

const menuIconClass = 'align-middle size-4 shrink-0 -translate-y-px'
const openTrackId = ref<string | null>(null)
const rename = ref<{ open: boolean; trackId: string; name: string }>({ open: false, trackId: '', name: '' })

function icon(component: unknown) {
  return h(component as never, { class: menuIconClass, strokeWidth: 2.2 })
}
function swatch(color: string) {
  return h('span', {
    class: 'inline-block size-3.5 rounded-full align-middle -translate-y-px',
    style: { background: color },
  })
}

const trackIndex = computed(() => new Map(props.tracks.map((track, index) => [track.id, index])))

/**
 * @description: 生成某条轨道的菜单项
 * @param {PianoRollTrack} track 轨道
 * @return {object[]} antdv 菜单项
 */
function menuItems(track: PianoRollTrack) {
  const index = trackIndex.value.get(track.id) ?? 0
  const count = props.tracks.length
  return [
    { key: 'rename', label: t('midiEditor.renameTrack'), icon: icon(Pencil) },
    {
      key: 'color',
      label: t('midiEditor.trackColor'),
      icon: icon(Palette),
      children: TRACK_PALETTE.map((color) => ({ key: `color:${color}`, label: color, icon: swatch(color) })),
    },
    {
      key: 'percussion',
      label: track.isPercussion ? `✓ ${t('midiEditor.percussionTrack')}` : t('midiEditor.percussionTrack'),
      icon: icon(Drum),
    },
    { key: 'duplicate', label: t('midiEditor.duplicateTrack'), icon: icon(CopyPlus) },
    { key: 'up', label: t('midiEditor.moveTrackUp'), icon: icon(ArrowUp), disabled: index === 0 },
    { key: 'down', label: t('midiEditor.moveTrackDown'), icon: icon(ArrowDown), disabled: index >= count - 1 },
    { type: 'divider' as const },
    {
      key: 'delete',
      label: t('midiEditor.deleteTrack'),
      icon: icon(Trash2),
      danger: true,
      disabled: count <= 1,
    },
  ]
}

function handleMenuClick(track: PianoRollTrack, info: { key: string | number }): void {
  const key = String(info.key)
  openTrackId.value = null
  const index = trackIndex.value.get(track.id) ?? 0
  if (key.startsWith('color:')) {
    emit('dispatch', { type: 'update-track', trackId: track.id, patch: { color: key.slice('color:'.length) } })
    return
  }
  switch (key) {
    case 'rename':
      rename.value = { open: true, trackId: track.id, name: track.name }
      return
    case 'percussion':
      emit('dispatch', { type: 'update-track', trackId: track.id, patch: { isPercussion: !track.isPercussion } })
      return
    case 'duplicate':
      emit('dispatch', { type: 'duplicate-track', trackId: track.id })
      return
    case 'up':
      emit('dispatch', { type: 'reorder-track', trackId: track.id, toIndex: index - 1 })
      return
    case 'down':
      emit('dispatch', { type: 'reorder-track', trackId: track.id, toIndex: index + 1 })
      return
    case 'delete':
      emit('remove-track', track)
      return
    default:
      return
  }
}

/**
 * @description: 组装 Dropdown 的 menu 配置
 * @param {PianoRollTrack} track 轨道
 * @return {object} menu 配置
 */
function menuFor(track: PianoRollTrack) {
  return {
    items: menuItems(track),
    onClick: (info: { key: string | number }) => handleMenuClick(track, info),
  }
}

function submitRename(): void {
  const name = rename.value.name.trim()
  if (name) emit('dispatch', { type: 'update-track', trackId: rename.value.trackId, patch: { name } })
  rename.value.open = false
}
</script>

<template>
  <Teleport
    v-for="[, host] in hosts"
    :key="host.id"
    :to="host.container"
  >
    <Dropdown
      :open="openTrackId === host.context.track.id"
      :trigger="['click']"
      placement="bottomRight"
      :get-popup-container="getMainWindowPopupContainer"
      :menu="menuFor(host.context.track)"
      @update:open="openTrackId = $event ? host.context.track.id : null"
    >
      <Button
        type="text"
        size="small"
        class="track-actions-button"
        :aria-label="`${t('midiEditor.actions')}: ${host.context.track.name}`"
        @click.stop
        @dblclick.stop
      >
        <template #icon>
          <MoreVertical
            class="size-4"
            :stroke-width="2.3"
          />
        </template>
      </Button>
    </Dropdown>
  </Teleport>

  <Modal
    :open="rename.open"
    :title="t('midiEditor.renameTrack')"
    :footer="null"
    width="360"
    centered
    @cancel="rename.open = false"
  >
    <Input
      v-model:value="rename.name"
      :maxlength="60"
      autofocus
      @press-enter="submitRename"
    />
    <div class="mt-4 flex justify-end gap-2">
      <Button
        size="small"
        color="primary"
        variant="outlined"
        @click="rename.open = false"
      >
        {{ t('actions.cancel') }}
      </Button>
      <Button
        type="primary"
        size="small"
        :disabled="!rename.name.trim()"
        @click="submitRename"
      >
        {{ t('actions.confirm') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.track-actions-button {
  width: 22px;
  min-width: 22px;
  height: 22px;
  padding: 0;
}
</style>
