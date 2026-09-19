<script setup lang="ts">
/**
 * @description: 钢琴卷帘右键菜单：围绕选区的剪贴板/编辑动作，空白处可直接落音符
 */
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dropdown } from 'antdv-next'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Clipboard,
  ClipboardPaste,
  CopyPlus,
  Grid2x2,
  Music,
  Repeat,
  Scissors,
  SquareDashedMousePointer,
  Trash2,
  Volume2,
} from 'lucide-vue-next'
import type { EditorAction, EditorSessionState } from '@strawberrybear/midi-editor'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'

/** 右键落点信息，来自钢琴卷帘 `context-menu` 意图。 */
export interface NoteContextMenuTarget {
  noteId: string | null
  tick: number
  pitch: number
  clientX: number
  clientY: number
}

const props = defineProps<{
  target: NoteContextMenuTarget | null
  state: EditorSessionState
  /** 当前详情视图正在编辑的轨道，用于空白处新增与粘贴。 */
  trackId: string | null
}>()
const emit = defineEmits<{
  dispatch: [action: EditorAction]
  close: []
}>()
const { t } = useI18n()

const menuIconClass = 'align-middle size-4 shrink-0 -translate-y-px'
/** 力度快捷档位。 */
const VELOCITY_PRESETS = [32, 64, 96, 127]

function icon(component: unknown) {
  return h(component as never, { class: menuIconClass, strokeWidth: 2.2 })
}

const hasSelection = computed(() => props.state.selection.size > 0)
const menuItems = computed(() => [
  ...(props.target?.noteId === null
    ? [{ key: 'add-note', label: t('midiEditor.contextMenu.addNote'), icon: icon(Music) }]
    : []),
  { key: 'cut', label: t('midiEditor.contextMenu.cut'), icon: icon(Scissors), disabled: !hasSelection.value },
  { key: 'copy', label: t('midiEditor.contextMenu.copy'), icon: icon(Clipboard), disabled: !hasSelection.value },
  {
    key: 'paste',
    label: t('midiEditor.contextMenu.paste'),
    icon: icon(ClipboardPaste),
    disabled: !props.state.clipboardAvailable,
  },
  { key: 'duplicate', label: t('midiEditor.contextMenu.duplicate'), icon: icon(CopyPlus), disabled: !hasSelection.value },
  { key: 'select-all', label: t('midiEditor.contextMenu.selectAll'), icon: icon(SquareDashedMousePointer) },
  { type: 'divider' as const },
  { key: 'quantize', label: t('midiEditor.contextMenu.quantize'), icon: icon(Grid2x2), disabled: !hasSelection.value },
  { key: 'transpose-up', label: t('midiEditor.contextMenu.transposeUp'), icon: icon(ArrowUpToLine), disabled: !hasSelection.value },
  { key: 'transpose-down', label: t('midiEditor.contextMenu.transposeDown'), icon: icon(ArrowDownToLine), disabled: !hasSelection.value },
  {
    key: 'velocity',
    label: t('midiEditor.contextMenu.setVelocity'),
    icon: icon(Volume2),
    disabled: !hasSelection.value,
    children: VELOCITY_PRESETS.map((value) => ({ key: `velocity:${value}`, label: String(value) })),
  },
  { key: 'loop', label: t('midiEditor.contextMenu.setLoopToSelection'), icon: icon(Repeat), disabled: !hasSelection.value },
  { type: 'divider' as const },
  { key: 'delete', label: t('midiEditor.contextMenu.delete'), icon: icon(Trash2), danger: true, disabled: !hasSelection.value },
])

/** 选区时间范围，用于按选区设置循环。 */
function selectionRange(): { startTick: number; endTick: number } | null {
  let start = Number.POSITIVE_INFINITY
  let end = 0
  for (const note of props.state.document.notes) {
    if (!props.state.selection.has(note.id)) continue
    start = Math.min(start, note.startTick)
    end = Math.max(end, note.endTick)
  }
  return Number.isFinite(start) && end > start ? { startTick: start, endTick: end } : null
}

function handleMenuClick(info: { key: string | number }): void {
  const key = String(info.key)
  const target = props.target
  const selected = Array.from(props.state.selection)
  emit('close')
  if (!target) return
  if (key.startsWith('velocity:')) {
    emit('dispatch', { type: 'set-selected-velocity', velocity: Number(key.slice('velocity:'.length)) })
    return
  }
  switch (key) {
    case 'add-note':
      if (props.trackId) {
        emit('dispatch', {
          type: 'add-note',
          trackId: props.trackId,
          pitch: target.pitch,
          startTick: target.tick,
          durationTicks: props.state.document.ticksPerBeat,
        })
      }
      return
    case 'cut':
    case 'copy':
    case 'duplicate':
    case 'select-all':
    case 'quantize':
      emit('dispatch', { type: key })
      return
    case 'paste':
      emit('dispatch', { type: 'paste', atTick: target.tick, trackId: props.trackId ?? undefined })
      return
    case 'transpose-up':
      emit('dispatch', { type: 'transpose', semitones: 12 })
      return
    case 'transpose-down':
      emit('dispatch', { type: 'transpose', semitones: -12 })
      return
    case 'loop': {
      const range = selectionRange()
      if (range) emit('dispatch', { type: 'loop-change', loop: range })
      return
    }
    case 'delete':
      emit('dispatch', { type: 'delete', noteIds: selected })
      return
    default:
      return
  }
}

function handleOpenChange(open: boolean): void {
  if (!open) emit('close')
}
</script>

<template>
  <Dropdown
    :open="!!target"
    :trigger="['contextmenu']"
    placement="bottomLeft"
    :get-popup-container="getMainWindowPopupContainer"
    :menu="{ items: menuItems, onClick: handleMenuClick }"
    @update:open="handleOpenChange"
  >
    <span
      class="context-anchor"
      :style="{ left: `${target?.clientX ?? 0}px`, top: `${target?.clientY ?? 0}px` }"
    />
  </Dropdown>
</template>

<style scoped>
.context-anchor {
  @apply pointer-events-none fixed h-0 w-0;
}
</style>
