<script setup lang="ts">
/** MIDI 编辑器与录制工作区共用的吸附设置；只影响编辑，不改录音时序。 */
import { computed, ref, watch, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Checkbox, Popover, Select, Switch, Tooltip } from 'antdv-next'
import { CircleAlert, Magnet } from 'lucide-vue-next'
import { SNAP_RESOLUTIONS, type EditorAction, type SnapResolution } from '@strawberrybear/midi-editor'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
const props = defineProps<{ snap: SnapResolution; disabled?: boolean }>()
const emit = defineEmits<{ dispatch: [action: EditorAction] }>()
const { t } = useI18n()
const snapSettingsOpen = ref(false)
const id = useId()
type BeatSnapResolution = Exclude<SnapResolution, 'off' | 'bar'>
const DEFAULT_BEAT_SNAP: BeatSnapResolution = '1/16'
/** 下拉框只负责节拍网格；开关和按小节吸附使用独立控件表达。 */
const beatSnapResolutions = SNAP_RESOLUTIONS.filter(
  (value): value is BeatSnapResolution => value !== 'off' && value !== 'bar'
)
const snapOptions = beatSnapResolutions.map((value) => ({ value, title: '', label: value }))
const lastBeatSnap = ref<BeatSnapResolution>(DEFAULT_BEAT_SNAP)
const snapEnabled = computed(() => props.snap !== 'off')
const snapToBar = computed(() => props.snap === 'bar')
const beatSnap = computed(() => {
  const current = props.snap
  return current !== 'off' && current !== 'bar' ? current : lastBeatSnap.value
})

watch(
  () => props.snap,
  (value) => {
    if (value !== 'off' && value !== 'bar') lastBeatSnap.value = value
  },
  { immediate: true }
)
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
</script>
<template>
  <Popover
    :open="!disabled && snapSettingsOpen"
    :trigger="['hover', 'click']"
    placement="bottomRight"
    :mouse-enter-delay="0.12"
    :mouse-leave-delay="0.14"
    :get-popup-container="getMainWindowPopupContainer"
    @update:open="snapSettingsOpen = $event"
  >
    <template #content>
      <div :id="id" class="snap-settings">
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
      :disabled="disabled"
      :aria-expanded="snapSettingsOpen"
      :aria-controls="id"
      :aria-label="t('midiEditor.toolbar.snap')"
    >
      <template #icon>
        <Magnet class="toolbar-icon" />
      </template>
    </Button>
  </Popover>
</template>
<style scoped>
.snap-settings { @apply flex flex-col gap-3; width: 224px; }
.snap-settings-options { @apply flex flex-col gap-3 border-t border-primary/10 pt-3 text-xs; color: var(--color-muted-dark); }
.settings-title { @apply m-0 text-xs font-semibold; color: var(--color-foreground); }
.settings-title-with-help { @apply flex items-center gap-1; }
.property-help-icon { @apply cursor-help; width: 13px; height: 13px; color: var(--color-muted); }
.settings-switch-row { @apply flex cursor-pointer items-center justify-between gap-6 text-xs; color: var(--color-muted-dark); }
.toolbar-field { @apply flex items-center justify-between gap-2 whitespace-nowrap; }
.toolbar-label { @apply text-xs; color: var(--color-muted-dark); }
.toolbar-icon { width: 16px; height: 16px; stroke-width: 2; }
.settings-icon-trigger { width: 30px; min-width: 30px; padding: 0; box-shadow: none; }
</style>
