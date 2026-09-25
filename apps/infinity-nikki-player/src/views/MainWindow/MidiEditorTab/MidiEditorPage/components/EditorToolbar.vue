<script setup lang="ts">
/**
 * @description: MIDI 编辑器工具栏：速度/拍号/吸附/工具/撤销重做/试听/显示开关
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Popover, Select, Tooltip } from 'antdv-next'
import {
  CircleHelp,
  Settings2,
  ChevronDown,
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
import EditorNumberInput from './EditorNumberInput.vue'
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
const settingsOpen = ref(false)

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
const toolOptions = [
  { value: 'select', icon: MousePointer2, help: 'selectTool' },
  { value: 'draw', icon: Pencil, help: 'drawTool' },
] as const
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
</script>

<template>
  <div class="editor-toolbar">
    <div
      class="toolbar-group toolbar-edit-group"
      :aria-label="t('midiEditor.toolbar.tool')"
      role="group"
    >
      <div
        class="inline-flex items-center gap-0.5"
        role="group"
        :aria-label="t('midiEditor.toolbar.tool')"
      >
        <Tooltip v-for="tool in toolOptions" :key="tool.value" :trigger="['hover', 'focus']">
          <template #title>
            <div class="font-semibold">
              {{ t(`midiEditor.toolbar.${tool.value}`) }}
            </div>
            <div>{{ t(`midiEditor.help.${tool.help}`) }}</div>
          </template>
          <Button
            size="small"
            color="primary"
            :variant="state.tool === tool.value ? 'solid' : 'text'"
            :aria-label="t(`midiEditor.toolbar.${tool.value}`)"
            :aria-pressed="state.tool === tool.value"
            @click="emit('dispatch', { type: 'set-tool', tool: tool.value })"
          >
            <template #icon>
              <component :is="tool.icon" class="toolbar-icon" />
            </template>
          </Button>
        </Tooltip>
      </div>

      <span class="toolbar-separator" />
      <Tooltip :title="t('midiEditor.toolbar.undo')">
        <Button
          size="small"
          color="primary"
          variant="text"
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
          variant="text"
          :disabled="!state.canRedo"
          :aria-label="t('midiEditor.toolbar.redo')"
          @click="emit('dispatch', { type: 'redo' })"
        >
          <template #icon>
            <Redo2 class="toolbar-icon" />
          </template>
        </Button>
      </Tooltip>
    </div>
    <div
      class="toolbar-group toolbar-transport-group"
      :aria-label="t('midiEditor.toolbar.play')"
      role="group"
    >
      <Tooltip :title="t(isPlaying ? 'midiEditor.toolbar.pause' : 'midiEditor.toolbar.play')">
        <Button
          size="small"
          type="primary"
          shape="circle"
          :aria-label="t(isPlaying ? 'midiEditor.toolbar.pause' : 'midiEditor.toolbar.play')"
          @click="isPlaying ? emit('pause') : emit('play')"
        >
          <template #icon>
            <Pause v-if="isPlaying" class="toolbar-icon" fill="currentColor" />
            <Play v-else class="toolbar-icon ml-px" fill="currentColor" />
          </template>
        </Button>
      </Tooltip>
      <Tooltip :title="t('midiEditor.toolbar.stop')">
        <Button
          size="small"
          color="primary"
          variant="text"
          :aria-label="t('midiEditor.toolbar.stop')"
          @click="emit('stop')"
        >
          <template #icon>
            <Square class="toolbar-icon" fill="currentColor" />
          </template>
        </Button>
      </Tooltip>
      <Tooltip
        :title="t(state.project.loop ? 'midiEditor.toolbar.clearLoopTip' : 'midiEditor.toolbar.loopTip')"
        :trigger="['hover', 'focus']"
      >
        <!-- 禁用按钮无法接收指针事件，外层保留提示的悬停与键盘焦点入口。 -->
        <span class="inline-flex" :tabindex="state.project.loop ? undefined : 0">
          <Button
            size="small"
            color="primary"
            :variant="state.project.loop ? 'solid' : 'text'"
            :disabled="!state.project.loop"
            :aria-label="t('midiEditor.toolbar.loop')"
            @click="emit('dispatch', { type: 'loop-change', loop: null })"
          >
            <template #icon>
              <Repeat class="toolbar-icon" />
            </template>
          </Button>
        </span>
      </Tooltip>
    </div>
    <div class="toolbar-group toolbar-settings-group">
      <div class="toolbar-field">
        <Tooltip :title="t('midiEditor.toolbar.snapTip')">
          <span class="toolbar-label">{{ t('midiEditor.toolbar.snap') }}</span>
        </Tooltip>
        <Select
          class="toolbar-snap"
          :aria-label="t('midiEditor.toolbar.snap')"
          :style="{ width: '104px', flex: '0 0 104px' }"
          :popup-match-select-width="160"
          size="small"
          :value="state.snap"
          :options="snapOptions"
          :get-popup-container="getMainWindowPopupContainer"
          @change="handleSnap"
        />
      </div>

      <Popover
        v-model:open="settingsOpen"
        trigger="click"
        placement="bottomRight"
        :get-popup-container="getMainWindowPopupContainer"
      >
        <template #content>
          <div id="midi-song-settings" class="editor-settings">
            <h3 class="settings-title">
              {{ t('midiEditor.toolbar.songSettings') }}
            </h3>

            <label class="toolbar-field">
              <Tooltip :title="t('midiEditor.toolbar.bpmTip')">
                <span class="toolbar-label">{{ t('midiEditor.toolbar.bpm') }}</span>
              </Tooltip>
              <EditorNumberInput
                class="toolbar-bpm"
                :style="{ width: '100px' }"
                size="small"
                :min="MIN_BPM"
                :max="MAX_BPM"
                :precision="2"
                :step="1"
                :value="bpm"
                @commit="handleBpm"
              />
            </label>

            <div class="toolbar-field">
              <Tooltip :title="t('midiEditor.toolbar.timeSignatureTip')">
                <span class="toolbar-label">{{ t('midiEditor.toolbar.timeSignature') }}</span>
              </Tooltip>
              <Select
                class="toolbar-meter"
                :style="{ width: '80px', flex: '0 0 80px' }"
                :popup-match-select-width="120"
                :list-height="224"
                size="small"
                :value="meter.numerator"
                :options="numeratorOptions"
                :get-popup-container="getMainWindowPopupContainer"
                @change="handleNumerator"
              />
              <span class="toolbar-label">/</span>
              <Select
                class="toolbar-meter"
                :style="{ width: '80px', flex: '0 0 80px' }"
                :popup-match-select-width="120"
                :list-height="224"
                size="small"
                :value="meter.denominator"
                :options="denominatorOptions"
                :get-popup-container="getMainWindowPopupContainer"
                @change="handleDenominator"
              />
            </div>

            <h3 class="settings-title settings-divider">
              {{ t('midiEditor.toolbar.displaySettings') }}
            </h3>
            <div class="settings-display">
              <Tooltip :title="t('midiEditor.toolbar.velocityLaneTip')">
                <Button
                  size="small"
                  color="primary"
                  :variant="showVelocity ? 'solid' : 'text'"
                  :aria-pressed="showVelocity"
                  :aria-label="t('midiEditor.toolbar.velocityLane')"
                  @click="emit('update:showVelocity', !showVelocity)"
                >
                  <template #icon>
                    <SlidersVertical class="toolbar-icon" />
                  </template>
                  {{ t('midiEditor.toolbar.velocityLane') }}
                </Button>
              </Tooltip>
              <Tooltip :title="t('midiEditor.toolbar.playableHighlightTip')">
                <Button
                  size="small"
                  color="primary"
                  :variant="showPlayable ? 'solid' : 'text'"
                  :aria-pressed="showPlayable"
                  :aria-label="t('midiEditor.toolbar.playableHighlight')"
                  @click="emit('update:showPlayable', !showPlayable)"
                >
                  <template #icon>
                    <Gamepad2 class="toolbar-icon" />
                  </template>
                  {{ t('midiEditor.toolbar.playableHighlight') }}
                </Button>
              </Tooltip>
            </div>
          </div>
        </template>
        <Button
          size="small"
          color="primary"
          variant="text"
          class="song-settings-trigger"
          :aria-expanded="settingsOpen"
          aria-controls="midi-song-settings"
          :title="t('midiEditor.toolbar.songSettings')"
          :aria-label="t('midiEditor.toolbar.songSettings')"
        >
          <template #icon>
            <Settings2 class="toolbar-icon" />
          </template>
          <span class="song-settings-summary"
            >{{ Math.round(bpm * 100) / 100 }} BPM ·
            {{ meter.numerator }}/{{ meter.denominator }}</span
          >
          <ChevronDown class="toolbar-chevron" />
        </Button>
      </Popover>
      <Popover
        placement="bottomRight"
        trigger="click"
        :get-popup-container="getMainWindowPopupContainer"
      >
        <template #content>
          <ul class="editor-help-list">
            <li v-for="line in helpLines" :key="line">
              {{ line }}
            </li>
          </ul>
        </template>
        <Button
          size="small"
          color="primary"
          variant="text"
          :aria-label="t('midiEditor.toolbar.help')"
        >
          <template #icon>
            <CircleHelp class="toolbar-icon" />
          </template>
        </Button>
      </Popover>
    </div>
  </div>
</template>

<style scoped>
.editor-toolbar {
  @apply flex shrink-0 items-center justify-between gap-3 border-b border-primary/10 px-3 py-2;
  container-type: inline-size;
}
.toolbar-group { @apply flex shrink-0 items-center gap-1; }
.toolbar-edit-group { @apply gap-2; }
.toolbar-transport-group { @apply rounded-lg bg-primary/10 px-2 py-0.5; }
.toolbar-settings-group { @apply gap-2; }
.toolbar-field { @apply flex items-center justify-between gap-2 whitespace-nowrap; }
.toolbar-label { @apply text-xs; color: var(--color-muted-dark); }
.toolbar-icon { width: 16px; height: 16px; stroke-width: 2; }
.toolbar-chevron { width: 12px; height: 12px; }
.toolbar-group :deep(.ant-btn) { box-shadow: none; }
.toolbar-edit-group > :first-child { @apply mr-2 rounded-md bg-primary/10 p-0.5; }
.toolbar-separator { @apply mx-1 h-4 w-px bg-primary/15; }
.toolbar-settings-group :deep(.song-settings-trigger) { width: 174px; }
.song-settings-summary { @apply text-xs tabular-nums; }
.editor-settings { @apply flex flex-col gap-3; width: 244px; }
.settings-title { @apply m-0 text-xs font-semibold; color: var(--color-foreground); }
.settings-divider { @apply border-t border-primary/10 pt-3; }
.settings-display { @apply flex flex-col items-stretch gap-1; }
.settings-display :deep(.ant-btn) { @apply justify-start; }
.editor-help-list { @apply flex max-w-sm flex-col gap-1.5 text-xs leading-5; color: var(--color-muted-dark); }
@container (max-width: 650px) {
  .song-settings-summary { display: none; }
  .toolbar-settings-group :deep(.song-settings-trigger) { width: 30px; padding: 0; }
  .toolbar-chevron { display: none; }
}
</style>
