<script setup lang="ts">
/**
 * @description: 总览轨道行右侧的轨道操作菜单，经 Teleport 放入卷帘控制器提供的容器
 */
import { computed, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, ColorPicker, Dropdown, Input, Modal } from 'antdv-next'
import type { Color } from 'antdv-next'
import {
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Drum,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import { TRACK_PALETTE } from '@strawberrybear/midi-editor'
import type { EditorAction } from '@strawberrybear/midi-editor'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import type { PianoRollTrackActionsContext } from '@strawberrybear/piano-roll/browser'
import type { PianoTrackHost } from '@/components/PianoWorkspace/usePianoTrackHosts'
import { getMainWindowPopupContainer, MIDI_EDITOR_DEFAULT_TRACK_COLOR } from '@/theme/infinityNikkiTheme'
import { useTrackDragSort } from './useTrackDragSort'

const props = defineProps<{
  hosts: ReadonlyMap<HTMLElement, PianoTrackHost<PianoRollTrackActionsContext>>
  tracks: readonly PianoRollTrack[]
}>()
const emit = defineEmits<{
  dispatch: [action: EditorAction]
  'edit-track': [trackId: string]
  /** 删除需由页面确认（含音符时提示）。 */
  'remove-track': [track: PianoRollTrack]
}>()
const { t } = useI18n()

const menuIconClass = 'align-middle size-4 shrink-0 -translate-y-px'
const openTrackId = ref<string | null>(null)
const colorTrackId = ref<string | null>(null)
const rename = ref<{ open: boolean; trackId: string; name: string }>({ open: false, trackId: '', name: '' })

useTrackDragSort({
  hosts: props.hosts,
  tracks: () => props.tracks,
  reorder: (trackId, toIndex) => emit('dispatch', { type: 'reorder-track', trackId, toIndex }),
})

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
const colorPresets = computed(() => [{
  label: t('midiEditor.presetTrackColors'),
  colors: [...TRACK_PALETTE],
}])

function trackColor(track: PianoRollTrack): string {
  return track.color || MIDI_EDITOR_DEFAULT_TRACK_COLOR
}

function changeTrackColor(track: PianoRollTrack, color: Color): void {
  const next = color.toHexString()
  if (next.toLowerCase() !== trackColor(track).toLowerCase()) {
    emit('dispatch', { type: 'update-track', trackId: track.id, patch: { color: next } })
  }
}

/**
 * @description: 生成某条轨道的菜单项
 * @param {PianoRollTrack} track 轨道
 * @return {object[]} antdv 菜单项
 */
function menuItems(track: PianoRollTrack) {
  const index = trackIndex.value.get(track.id) ?? 0
  const count = props.tracks.length
  return [
    { key: 'edit', label: t('midiEditor.editTrack'), icon: icon(Pencil) },
    { type: 'divider' as const },
    { key: 'rename', label: t('midiEditor.renameTrack'), icon: icon(Pencil) },
    {
      key: 'color',
      label: t('midiEditor.trackColor'),
      icon: swatch(trackColor(track)),
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
  switch (key) {
    case 'edit':
      emit('edit-track', track.id)
      return
    case 'color':
      colorTrackId.value = track.id
      return
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
  <Teleport v-for="[, host] in hosts" :key="host.id" :to="host.container">
    <Button
      type="text"
      size="small"
      class="track-drag-handle"
      :aria-label="t('midiEditor.dragTrack', { name: host.context.track.name })"
      @click.stop
      @dblclick.stop
    >
      <template #icon>
        <GripVertical class="size-4" :stroke-width="2.2" />
      </template>
    </Button>

    <ColorPicker
      :open="colorTrackId === host.context.track.id"
      :value="trackColor(host.context.track)"
      :presets="colorPresets"
      disabled-alpha
      :get-popup-container="getMainWindowPopupContainer"
      placement="bottomRight"
      @open-change="!$event && (colorTrackId = null)"
      @change-complete="changeTrackColor(host.context.track, $event)"
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
            <MoreVertical class="size-4" :stroke-width="2.3" />
          </template>
        </Button>
      </Dropdown>
    </ColorPicker>
  </Teleport>

  <Modal
    :open="rename.open"
    :title="t('midiEditor.renameTrack')"
    :footer="null"
    width="360"
    centered
    @cancel="rename.open = false"
  >
    <Input v-model:value="rename.name" :maxlength="60" autofocus @press-enter="submitRename" />
    <div class="mt-4 flex justify-end gap-2">
      <Button size="small" color="primary" variant="outlined" @click="rename.open = false">
        {{ t('actions.cancel') }}
      </Button>
      <Button type="primary" size="small" :disabled="!rename.name.trim()" @click="submitRename">
        {{ t('actions.confirm') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.track-drag-handle {
  position: absolute;
  top: 50%;
  left: 4px;
  width: 22px;
  min-width: 22px;
  height: 28px;
  padding: 0;
  color: var(--color-muted-dark);
  cursor: grab;
  opacity: 0.7;
  transform: translateY(-50%);
  transition:
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.track-drag-handle:hover,
.track-drag-handle:focus-visible {
  color: var(--color-primary);
  opacity: 1;
}

.track-drag-handle:active {
  cursor: grabbing;
}

.track-actions-button {
  width: 22px;
  min-width: 22px;
  height: 22px;
  padding: 0;
}

@media (prefers-reduced-motion: reduce) {
  .track-drag-handle {
    transition: none;
  }
}
</style>
