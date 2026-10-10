<script setup lang="ts">
/** 录制操作集中在一行，只暴露整次录入、试听与撤销，不装配精细音符工具。 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Tooltip } from 'antdv-next'
import { Circle, Pause, Play, Redo2, RotateCcw, Square, Undo2 } from 'lucide-vue-next'
import type { RecorderStatus } from '@/features/midi-recording/types'

const props = defineProps<{
  status: RecorderStatus
  busy: boolean
  locked: boolean
  editingLocked: boolean
  canStart: boolean
  canUndo: boolean
  canRedo: boolean
  hasNotes: boolean
  replaying: boolean
  position: string
  noteCount: number
}>()
defineEmits<{ record: []; stop: []; preview: []; rewind: []; undo: []; redo: [] }>()
const { t } = useI18n()
const recordText = computed(() => t(!props.busy ? 'recording.start' : props.status === 'paused' ? 'recording.resume' : 'recording.pause'))
const recordIcon = computed(() => !props.busy ? Circle : props.status === 'paused' ? Play : Pause)
const statusText = computed(() => props.replaying ? t('recording.previewing') : props.status === 'idle' ? '' : t(`recording.status.${props.status}`))
</script>

<template>
  <div
    class="recorder-transport flex min-w-0 items-center gap-1.5"
    role="group"
    :aria-label="t('recording.launch')"
  >
    <Tooltip :title="t('recording.recordShortcut')">
      <Button
        size="small"
        :type="!busy || status === 'paused' ? 'primary' : 'default'"
        :loading="status === 'preparing'"
        :disabled="locked || (!busy && !canStart)"
        @click="$emit('record')"
      >
        <template #icon>
          <component :is="recordIcon" class="size-4" :stroke-width="2" />
        </template>
        {{ recordText }}
      </Button>
    </Tooltip>
    <Tooltip :title="t('recording.stop')">
      <Button
        size="small"
        :disabled="locked || !busy"
        :aria-label="t('recording.stop')"
        @click="$emit('stop')"
      >
        <template #icon>
          <Square class="size-4" :stroke-width="2" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t(replaying ? 'recording.pausePreview' : 'recording.preview')">
      <Button
        size="small"
        :disabled="locked || busy || !hasNotes"
        :aria-label="t(replaying ? 'recording.pausePreview' : 'recording.preview')"
        @click="$emit('preview')"
      >
        <template #icon>
          <component :is="replaying ? Pause : Play" class="size-4" :stroke-width="2" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('recording.rewind')">
      <Button
        size="small"
        :disabled="locked || busy"
        :aria-label="t('recording.rewind')"
        @click="$emit('rewind')"
      >
        <template #icon>
          <RotateCcw class="size-4" :stroke-width="2" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('midiEditor.toolbar.undo')">
      <Button
        size="small"
        :disabled="editingLocked || !canUndo"
        :aria-label="t('midiEditor.toolbar.undo')"
        @click="$emit('undo')"
      >
        <template #icon>
          <Undo2 class="size-4" :stroke-width="2" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('midiEditor.toolbar.redo')">
      <Button
        size="small"
        :disabled="editingLocked || !canRedo"
        :aria-label="t('midiEditor.toolbar.redo')"
        @click="$emit('redo')"
      >
        <template #icon>
          <Redo2 class="size-4" :stroke-width="2" />
        </template>
      </Button>
    </Tooltip>
    <!-- 设置入口属于按钮组，不能被后方可伸缩的状态区域推到最右侧。 -->
    <slot name="settings" />
    <Tooltip :title="statusText">
      <span
        role="status"
        aria-live="polite"
        class="min-w-0 flex-1 truncate text-sm text-[var(--color-muted-dark)]"
        >{{ statusText }}</span
      >
    </Tooltip>
    <Tooltip :title="t('recording.position', { position })">
      <span
        class="ml-auto shrink-0 whitespace-nowrap text-xs text-[var(--color-muted-dark)]"
        :aria-label="t('recording.position', { position })"
      >
        {{ position }} · {{ t('recording.noteCount', { count: noteCount }) }}
      </span>
    </Tooltip>
  </div>
</template>
