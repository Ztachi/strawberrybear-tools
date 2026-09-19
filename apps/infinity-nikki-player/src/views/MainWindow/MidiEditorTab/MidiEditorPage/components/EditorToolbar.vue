<script setup lang="ts">
/**
 * @description: MIDI 编辑器工具栏：速度/拍号/吸附/工具/撤销重做/试听/显示开关
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, InputNumber, Popover, Segmented, Select, Tooltip } from 'antdv-next'
import {
  CircleHelp,
  Gamepad2,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Redo2,
  Repeat,
  SlidersVertical,
  Square,
  Undo2,
} from 'lucide-vue-next'
import { MAX_BPM, MIN_BPM, SNAP_RESOLUTIONS, tempoToBpm } from '@strawberrybear/midi-editor'
import type { EditorAction, EditorSessionState, SnapResolution } from '@strawberrybear/midi-editor'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'

const props = defineProps<{
  state: EditorSessionState
  isPlaying: boolean
  showVelocity: boolean
  showPlayable: boolean
}>()
const emit = defineEmits<{
  dispatch: [action: EditorAction]
  play: []
  pause: []
  stop: []
  'set-bpm': [bpm: number]
  'set-meter': [numerator: number, denominator: number]
  'update:showVelocity': [value: boolean]
  'update:showPlayable': [value: boolean]
}>()
const { t } = useI18n()

/** 拍号可选分子/分母；分母限定为 2 的幂以符合 SMF 规范。 */
const METER_NUMERATORS = Array.from({ length: 16 }, (_, index) => index + 1)
const METER_DENOMINATORS = [1, 2, 4, 8, 16]
const numeratorOptions = METER_NUMERATORS.map((value) => ({ value, label: String(value) }))
const denominatorOptions = METER_DENOMINATORS.map((value) => ({ value, label: String(value) }))

const bpm = computed(() => tempoToBpm(props.state.document.tempoMap[0]?.microsecondsPerQuarter ?? 0))
const meter = computed(() => props.state.document.timeSignatureMap[0] ?? { numerator: 4, denominator: 4 })
const snapOptions = computed(() =>
  SNAP_RESOLUTIONS.map((value) => ({
    value,
    label:
      value === 'bar'
        ? t('midiEditor.toolbar.snapBar')
        : value === 'off'
          ? t('midiEditor.toolbar.snapOff')
          : value,
  }))
)
const toolOptions = computed(() => [
  { value: 'select', label: t('midiEditor.toolbar.select') },
  { value: 'draw', label: t('midiEditor.toolbar.draw') },
])
const helpLines = computed(() =>
  (['selectTool', 'drawTool', 'loop', 'velocity', 'shortcuts', 'playback'] as const).map((key) =>
    t(`midiEditor.help.${key}`)
  )
)

function handleBpm(value: number | string | null): void {
  const next = Number(value)
  if (Number.isFinite(next) && next >= MIN_BPM && next <= MAX_BPM && next !== bpm.value) {
    emit('set-bpm', next)
  }
}
function handleNumerator(value: unknown): void {
  emit('set-meter', Number(value), meter.value.denominator)
}
function handleDenominator(value: unknown): void {
  emit('set-meter', meter.value.numerator, Number(value))
}
function handleSnap(value: unknown): void {
  emit('dispatch', { type: 'set-snap', resolution: value as SnapResolution })
}
function handleTool(value: unknown): void {
  emit('dispatch', { type: 'set-tool', tool: value === 'draw' ? 'draw' : 'select' })
}
</script>

<template>
  <div class="editor-toolbar">
    <label class="toolbar-field">
      <span class="toolbar-label">{{ t('midiEditor.toolbar.bpm') }}</span>
      <InputNumber
        class="toolbar-bpm"
        size="small"
        :min="MIN_BPM"
        :max="MAX_BPM"
        :precision="2"
        :step="1"
        :value="bpm"
        @change="handleBpm"
      />
    </label>

    <div class="toolbar-field">
      <span class="toolbar-label">{{ t('midiEditor.toolbar.timeSignature') }}</span>
      <Select
        class="toolbar-meter"
        size="small"
        :value="meter.numerator"
        :options="numeratorOptions"
        :get-popup-container="getMainWindowPopupContainer"
        @change="handleNumerator"
      />
      <span class="toolbar-label">/</span>
      <Select
        class="toolbar-meter"
        size="small"
        :value="meter.denominator"
        :options="denominatorOptions"
        :get-popup-container="getMainWindowPopupContainer"
        @change="handleDenominator"
      />
    </div>

    <div class="toolbar-field">
      <span class="toolbar-label">{{ t('midiEditor.toolbar.snap') }}</span>
      <Select
        class="toolbar-snap"
        size="small"
        :value="state.snap"
        :options="snapOptions"
        :get-popup-container="getMainWindowPopupContainer"
        @change="handleSnap"
      />
    </div>

    <Segmented
      size="small"
      :value="state.tool"
      :options="toolOptions"
      @change="handleTool"
    >
      <template #iconRender="{ value }">
        <component
          :is="value === 'draw' ? Pencil : MousePointer2"
          class="toolbar-icon"
        />
      </template>
    </Segmented>

    <span class="toolbar-divider" />

    <Tooltip :title="t('midiEditor.toolbar.undo')">
      <Button
        size="small"
        color="primary"
        variant="link"
        :disabled="!state.canUndo"
        :aria-label="t('midiEditor.toolbar.undo')"
        @click="emit('dispatch', { type: 'undo' })"
      >
        <template #icon>
          <Undo2 class="toolbar-icon" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('midiEditor.toolbar.redo')">
      <Button
        size="small"
        color="primary"
        variant="link"
        :disabled="!state.canRedo"
        :aria-label="t('midiEditor.toolbar.redo')"
        @click="emit('dispatch', { type: 'redo' })"
      >
        <template #icon>
          <Redo2 class="toolbar-icon" />
        </template>
      </Button>
    </Tooltip>

    <span class="toolbar-divider" />

    <Tooltip :title="t(isPlaying ? 'midiEditor.toolbar.pause' : 'midiEditor.toolbar.play')">
      <Button
        size="small"
        type="primary"
        shape="circle"
        :aria-label="t(isPlaying ? 'midiEditor.toolbar.pause' : 'midiEditor.toolbar.play')"
        @click="isPlaying ? emit('pause') : emit('play')"
      >
        <template #icon>
          <Pause
            v-if="isPlaying"
            class="toolbar-icon"
            fill="currentColor"
          />
          <Play
            v-else
            class="toolbar-icon ml-px"
            fill="currentColor"
          />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('midiEditor.toolbar.stop')">
      <Button
        size="small"
        color="primary"
        variant="link"
        :aria-label="t('midiEditor.toolbar.stop')"
        @click="emit('stop')"
      >
        <template #icon>
          <Square
            class="toolbar-icon"
            fill="currentColor"
          />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t(state.project.loop ? 'midiEditor.toolbar.clearLoop' : 'midiEditor.toolbar.loop')">
      <Button
        size="small"
        color="primary"
        :variant="state.project.loop ? 'solid' : 'link'"
        :disabled="!state.project.loop"
        :aria-label="t('midiEditor.toolbar.loop')"
        @click="emit('dispatch', { type: 'loop-change', loop: null })"
      >
        <template #icon>
          <Repeat class="toolbar-icon" />
        </template>
      </Button>
    </Tooltip>

    <span class="toolbar-divider" />

    <Tooltip :title="t('midiEditor.toolbar.velocityLane')">
      <Button
        size="small"
        color="primary"
        :variant="showVelocity ? 'solid' : 'link'"
        :aria-pressed="showVelocity"
        :aria-label="t('midiEditor.toolbar.velocityLane')"
        @click="emit('update:showVelocity', !showVelocity)"
      >
        <template #icon>
          <SlidersVertical class="toolbar-icon" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('midiEditor.toolbar.playableHighlightTip')">
      <Button
        size="small"
        color="primary"
        :variant="showPlayable ? 'solid' : 'link'"
        :aria-pressed="showPlayable"
        :aria-label="t('midiEditor.toolbar.playableHighlight')"
        @click="emit('update:showPlayable', !showPlayable)"
      >
        <template #icon>
          <Gamepad2 class="toolbar-icon" />
        </template>
      </Button>
    </Tooltip>

    <Popover
      placement="bottomRight"
      trigger="click"
      :get-popup-container="getMainWindowPopupContainer"
    >
      <template #content>
        <ul class="editor-help-list">
          <li
            v-for="line in helpLines"
            :key="line"
          >
            {{ line }}
          </li>
        </ul>
      </template>
      <Button
        size="small"
        color="primary"
        variant="link"
        class="ml-auto"
        :aria-label="t('midiEditor.toolbar.help')"
      >
        <template #icon>
          <CircleHelp class="toolbar-icon" />
        </template>
      </Button>
    </Popover>
  </div>
</template>

<style scoped>
.editor-toolbar {
  @apply flex flex-wrap items-center gap-2 border-b border-primary/10 px-3 py-2;
}

.toolbar-field {
  @apply flex items-center gap-1;
}

.toolbar-label {
  @apply text-xs;
  color: var(--color-muted);
}

.toolbar-bpm {
  width: 88px;
}

.toolbar-meter {
  width: 58px;
}

.toolbar-snap {
  width: 84px;
}

.toolbar-divider {
  @apply mx-1 h-5 w-px;
  background: var(--border-primary-15);
}

.toolbar-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.2;
}

.editor-help-list {
  @apply flex max-w-sm flex-col gap-1.5 text-xs leading-5;
  color: var(--color-muted-dark);
}
</style>
