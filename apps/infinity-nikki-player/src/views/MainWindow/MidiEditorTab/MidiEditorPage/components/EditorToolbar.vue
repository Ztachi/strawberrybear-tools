<script setup lang="ts">
/**
 * @description: MIDI 编辑器紧凑工具栏：速度/拍号/吸附/工具/撤销重做/试听/显示开关
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Checkbox, Popover, Select, Switch, Tooltip } from 'antdv-next'
import {
  CircleAlert,
  HelpCircle,
  KeyboardMusic,
  Magnet,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Redo2,
  Repeat,
  Settings2,
  Square,
  Undo2,
} from 'lucide-vue-next'
import { MAX_BPM, MIN_BPM, SNAP_RESOLUTIONS, tempoToBpm } from '@strawberrybear/midi-editor'
import type { EditorAction, EditorSessionState, SnapResolution } from '@strawberrybear/midi-editor'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import EditorNumberInput from './EditorNumberInput.vue'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'

const props = defineProps<{
  state: EditorSessionState
  isPlaying: boolean
  /** 试听由独立窗口接管期间，主窗口不能同时开启另一份排程。 */
  playbackDisabled?: boolean
  showVelocity: boolean
  dimUnplayable: boolean
  currentTemplateId: string | null
  templates: readonly { id: string; name: string }[]
}>()
const emit = defineEmits<{
  dispatch: [action: EditorAction]
  play: []
  pause: []
  stop: []
  'set-bpm': [bpm: number]
  'set-meter': [numerator: number, denominator: number]
  'update:showVelocity': [value: boolean]
  'update:dimUnplayable': [value: boolean]
  'select-template': [templateId: string]
}>()
const { t } = useI18n()
const snapSettingsOpen = ref(false)
const templateSettingsOpen = ref(false)
const settingsOpen = ref(false)

/** 拍号可选分子/分母；分母限定为 2 的幂以符合 SMF 规范。 */
const METER_NUMERATORS = Array.from({ length: 16 }, (_, index) => index + 1)
const METER_DENOMINATORS = [1, 2, 4, 8, 16]
// antdv-next 会把纯文本 label 自动写入原生 title；显式置空，统一由 Tooltip 提供说明。
const numeratorOptions = METER_NUMERATORS.map((value) => ({ value, label: String(value), title: '' }))
const denominatorOptions = METER_DENOMINATORS.map((value) => ({ value, label: String(value), title: '' }))

const bpm = computed(() => tempoToBpm(props.state.document.tempoMap[0]?.microsecondsPerQuarter ?? 0))
const meter = computed(() => props.state.document.timeSignatureMap[0] ?? { numerator: 4, denominator: 4 })
type BeatSnapResolution = Exclude<SnapResolution, 'off' | 'bar'>
const DEFAULT_BEAT_SNAP: BeatSnapResolution = '1/16'
/** 下拉框只负责节拍网格；开关和按小节吸附使用独立控件表达。 */
const beatSnapResolutions = SNAP_RESOLUTIONS.filter(
  (value): value is BeatSnapResolution => value !== 'off' && value !== 'bar'
)
const snapOptions = beatSnapResolutions.map((value) => ({ value, title: '', label: value }))
const lastBeatSnap = ref<BeatSnapResolution>(DEFAULT_BEAT_SNAP)
const snapEnabled = computed(() => props.state.snap !== 'off')
const snapToBar = computed(() => props.state.snap === 'bar')
const beatSnap = computed(() => {
  const current = props.state.snap
  return current !== 'off' && current !== 'bar' ? current : lastBeatSnap.value
})

watch(
  () => props.state.snap,
  (value) => {
    if (value !== 'off' && value !== 'bar') lastBeatSnap.value = value
  },
  { immediate: true }
)
const toolOptions = [
  { value: 'select', icon: MousePointer2, help: 'selectTool' },
  { value: 'draw', icon: Pencil, help: 'drawTool' },
] as const
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
function setSnap(resolution: SnapResolution): void {
  emit('dispatch', { type: 'set-snap', resolution })
}
function handleSnapEnabled(value: boolean): void {
  setSnap(value ? lastBeatSnap.value : 'off')
}
function handleSnapToBar(): void {
  setSnap(snapToBar.value ? lastBeatSnap.value : 'bar')
}
function handleBeatSnap(value: unknown): void {
  const resolution = value as BeatSnapResolution
  if (!beatSnapResolutions.includes(resolution)) return
  lastBeatSnap.value = resolution
  setSnap(resolution)
}
/**
 * @description: 更新力度条显示状态
 * @param {boolean} value - 是否显示力度条
 * @return {void}
 */
function handleVelocityLane(value: boolean): void {
  emit('update:showVelocity', value)
}
/**
 * @description: 更新按模板试听状态，同时置灰模板外音符
 * @param {boolean} value - 是否仅试听当前模板内音高
 * @return {void}
 */
function handleDimUnplayable(value: boolean): void {
  emit('update:dimUnplayable', value)
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
          class="toolbar-history-button"
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
          class="toolbar-history-button"
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
    <span class="toolbar-separator" />
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
          :disabled="playbackDisabled"
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
          :disabled="playbackDisabled"
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
    <span class="toolbar-separator" />
    <div class="toolbar-group toolbar-settings-group">
      <Popover
        v-model:open="templateSettingsOpen"
        :trigger="['hover', 'click']"
        placement="bottomRight"
        :mouse-enter-delay="0.12"
        :mouse-leave-delay="0.14"
        :get-popup-container="getMainWindowPopupContainer"
      >
        <template #content>
          <div id="midi-template-settings" class="template-settings">
            <div class="settings-switch-row">
              <span class="settings-title toolbar-label-with-help">
                {{ t('midiEditor.toolbar.templatePreview') }}
                <Tooltip
                  :title="t('midiEditor.toolbar.templatePreviewTip')"
                  :trigger="['hover', 'focus']"
                >
                  <button
                    type="button"
                    class="property-help-icon inline-flex shrink-0 items-center justify-center border-0 bg-transparent p-0"
                    :aria-label="t('midiEditor.toolbar.templatePreviewHelp')"
                  >
                    <HelpCircle class="h-full w-full" />
                  </button>
                </Tooltip>
              </span>
              <Switch
                size="small"
                :checked="dimUnplayable"
                :aria-label="t('midiEditor.toolbar.templatePreview')"
                @change="handleDimUnplayable"
              />
            </div>
            <KeyTemplateSelect
              class="editor-template-select"
              width="224px"
              size="small"
              :disabled="!dimUnplayable"
              :aria-label="t('player.template')"
              :model-value="currentTemplateId"
              :templates="templates"
              :list-height="224"
              :popup-match-select-width="260"
              :get-popup-container="getMainWindowPopupContainer"
              @update:model-value="emit('select-template', $event)"
            />
          </div>
        </template>
        <Button
          size="small"
          color="primary"
          variant="text"
          class="settings-icon-trigger"
          :aria-expanded="templateSettingsOpen"
          aria-controls="midi-template-settings"
          :aria-label="t('player.template')"
        >
          <template #icon>
            <KeyboardMusic class="toolbar-icon" />
          </template>
        </Button>
      </Popover>

      <Popover
        v-model:open="snapSettingsOpen"
        :trigger="['hover', 'click']"
        placement="bottomRight"
        :mouse-enter-delay="0.12"
        :mouse-leave-delay="0.14"
        :get-popup-container="getMainWindowPopupContainer"
      >
        <template #content>
          <div id="midi-snap-settings" class="snap-settings">
            <h3 class="settings-title settings-title-with-help">
              {{ t('midiEditor.toolbar.snap') }}
              <Tooltip :title="t('midiEditor.toolbar.snapTip')" :trigger="['hover', 'focus']">
                <CircleAlert
                  class="property-help-icon"
                  tabindex="0"
                  role="img"
                  :aria-label="t('midiEditor.toolbar.snapTip')"
                />
              </Tooltip>
            </h3>

            <label class="settings-switch-row">
              <span>{{ t('midiEditor.toolbar.snapEnabled') }}</span>
              <Switch
                size="small"
                :checked="snapEnabled"
                :aria-label="t('midiEditor.toolbar.snapEnabled')"
                @change="handleSnapEnabled"
              />
            </label>

            <div v-if="snapEnabled" class="snap-settings-options">
              <Checkbox :checked="snapToBar" @change="handleSnapToBar">
                {{ t('midiEditor.toolbar.snapToBar') }}
              </Checkbox>
              <label class="toolbar-field">
                <span class="toolbar-label">{{ t('midiEditor.toolbar.snapResolution') }}</span>
                <Select
                  class="toolbar-snap"
                  :aria-label="t('midiEditor.toolbar.snapResolution')"
                  :style="{ width: '100px', flex: '0 0 100px' }"
                  :popup-match-select-width="148"
                  size="small"
                  :disabled="snapToBar"
                  :value="beatSnap"
                  :options="snapOptions"
                  :get-popup-container="getMainWindowPopupContainer"
                  @change="handleBeatSnap"
                />
              </label>
            </div>
          </div>
        </template>
        <Button
          size="small"
          color="primary"
          variant="text"
          class="settings-icon-trigger"
          :aria-expanded="snapSettingsOpen"
          aria-controls="midi-snap-settings"
          :aria-label="t('midiEditor.toolbar.snap')"
        >
          <template #icon>
            <Magnet class="toolbar-icon" />
          </template>
        </Button>
      </Popover>

      <Popover
        v-model:open="settingsOpen"
        :trigger="['hover', 'click']"
        placement="bottomRight"
        :mouse-enter-delay="0.12"
        :mouse-leave-delay="0.14"
        :get-popup-container="getMainWindowPopupContainer"
      >
        <template #content>
          <div id="midi-song-settings" class="editor-settings">
            <h3 class="settings-title settings-title-with-help">
              {{ t('midiEditor.toolbar.songSettings') }}
              <Tooltip
                :title="t('midiEditor.toolbar.songSettingsTip')"
                :trigger="['hover', 'focus']"
              >
                <CircleAlert
                  class="property-help-icon"
                  tabindex="0"
                  role="img"
                  :aria-label="t('midiEditor.toolbar.songSettingsTip')"
                />
              </Tooltip>
            </h3>

            <label class="toolbar-field">
              <span class="toolbar-label">{{ t('midiEditor.toolbar.bpm') }}</span>
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
              <span class="toolbar-label">{{ t('midiEditor.toolbar.timeSignature') }}</span>
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

            <h3 class="settings-title settings-title-with-help settings-divider">
              {{ t('midiEditor.toolbar.displaySettings') }}
              <Tooltip
                :title="t('midiEditor.toolbar.displaySettingsTip')"
                :trigger="['hover', 'focus']"
              >
                <CircleAlert
                  class="property-help-icon"
                  tabindex="0"
                  role="img"
                  :aria-label="t('midiEditor.toolbar.displaySettingsTip')"
                />
              </Tooltip>
            </h3>
            <div class="settings-display">
              <label class="settings-switch-row">
                <span>{{ t('midiEditor.toolbar.velocityLane') }}</span>
                <Switch
                  size="small"
                  :checked="showVelocity"
                  :aria-label="t('midiEditor.toolbar.velocityLane')"
                  @change="handleVelocityLane"
                />
              </label>
            </div>
          </div>
        </template>
        <Button
          size="small"
          color="primary"
          variant="text"
          class="settings-icon-trigger song-settings-trigger"
          :aria-expanded="settingsOpen"
          aria-controls="midi-song-settings"
          :aria-label="t('midiEditor.toolbar.songSettings')"
        >
          <template #icon>
            <Settings2 class="toolbar-icon" />
          </template>
        </Button>
      </Popover>
    </div>
  </div>
</template>

<style scoped>
.editor-toolbar :deep(.toolbar-history-button:disabled) {
  color: var(--color-muted);
  background: var(--color-primary-disabled-bg);
  opacity: 0.45;
}
.editor-toolbar {
  @apply flex min-w-0 shrink-0 items-center gap-1.5;
  -webkit-app-region: no-drag;
}
.toolbar-group { @apply flex shrink-0 items-center gap-1; }
.toolbar-edit-group { @apply gap-1; }
.toolbar-transport-group { @apply rounded-lg bg-primary/10 px-2 py-0.5; }
.toolbar-settings-group { @apply gap-1.5; }
.toolbar-field { @apply flex items-center justify-between gap-2 whitespace-nowrap; }
.toolbar-label { @apply text-xs; color: var(--color-muted-dark); }
.toolbar-label-with-help, .settings-title-with-help { @apply flex items-center gap-1; }
.property-help-icon { @apply cursor-help; width: 13px; height: 13px; color: var(--color-muted); }
.toolbar-icon { width: 16px; height: 16px; stroke-width: 2; }
.toolbar-group :deep(.ant-btn) { box-shadow: none; }
.toolbar-edit-group > :first-child { @apply mr-2 rounded-md bg-primary/10 p-0.5; }
.toolbar-separator { @apply mx-0.5 h-4 w-px shrink-0 bg-primary/15; }
.toolbar-settings-group :deep(.settings-icon-trigger) { width: 30px; min-width: 30px; padding: 0; }
.snap-settings { @apply flex flex-col gap-3; width: 224px; }
.template-settings { @apply flex flex-col gap-3; width: 224px; }
.snap-settings-options { @apply flex flex-col gap-3 border-t border-primary/10 pt-3 text-xs; color: var(--color-muted-dark); }
.editor-settings { @apply flex flex-col gap-3; width: 244px; }
.settings-title { @apply m-0 text-xs font-semibold; color: var(--color-foreground); }
.settings-divider { @apply border-t border-primary/10 pt-3; }
.settings-display { @apply flex flex-col gap-2; }
.settings-switch-row { @apply flex cursor-pointer items-center justify-between gap-6 text-xs; color: var(--color-muted-dark); }
</style>
