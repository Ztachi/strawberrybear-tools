<script setup lang="ts">
/** 录制设置仅改变本地会话，受控模板选择不会写入全局设置。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Select, Checkbox, InputNumber, Popover, Tooltip } from 'antdv-next'
import { CircleAlert, KeyboardMusic, Wrench } from 'lucide-vue-next'
import { recordingRangeInBars } from '@/features/midi-recording/range'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import type { TrackRecorder } from '@/features/midi-recording/controller'
import type { KeyTemplate } from '@/types'
const props = defineProps<{ recorder: TrackRecorder; version: number; templates: readonly KeyTemplate[]; disabled: boolean }>()
const emit = defineEmits<{ change: []; mode: [value: TrackRecorder['mode']]; range: [value: { start: number; end: number }]; setting: [value: { key: 'countIn' | 'metronome' | 'accompaniment'; value: boolean }] }>()
const { t } = useI18n()
const templateOpen = ref(false)
const settingsOpen = ref(false)
/** 浮层内容单独渲染，必须读取响应式快照才能即时反映会话设置。 */
const settings = computed(() => {
  void props.version
  return {
    mode: props.recorder.mode,
    busy: props.recorder.busy,
    status: props.recorder.status,
    templateId: props.recorder.template.id,
    countIn: props.recorder.countIn,
    metronome: props.recorder.metronome,
    accompaniment: props.recorder.accompaniment,
  }
})
const modeLocked = computed(() => props.disabled || (settings.value.busy && settings.value.status !== 'paused'))
const range = computed(() => {
  void props.version
  return recordingRangeInBars(props.recorder.preview().document, props.recorder.range ?? { startTick: props.recorder.cursorTick, endTick: props.recorder.cursorTick + 1 })
})
const options = computed(() => ['append', 'overdub', 'replace'].map(value => ({ value, label: t(`recording.mode.${value}`) })))
const templateOptions = computed(() => { void props.version; return props.templates.some(template => template.id === props.recorder.template.id) ? props.templates : [...props.templates, props.recorder.template] })
function templateChanged(id: string): void {
  const template = templateOptions.value.find(item => item.id === id)
  if (template) props.recorder.selectTemplate(template)
  emit('change')
}
function modeChanged(value: unknown): void {
  emit('mode', value as TrackRecorder['mode'])
}
/** 图标或浮层持有焦点时，Escape 只关闭当前设置层，不传给背景录制页。 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || (!templateOpen.value && !settingsOpen.value)) return
  if ((event.target as HTMLElement | null)?.closest('[role="combobox"]')) return
  event.preventDefault()
  event.stopPropagation()
  templateOpen.value = false
  settingsOpen.value = false
}
</script>
<template>
  <div
    class="recorder-settings flex shrink-0 items-center gap-1.5"
    :data-version="version"
    @keydown.capture="handleKeydown"
  >
    <Popover
      v-model:open="templateOpen"
      :trigger="['hover', 'click']"
      placement="bottomRight"
      :mouse-enter-delay="0.12"
      :mouse-leave-delay="0.14"
    >
      <template #content>
        <div class="flex w-56 flex-col gap-3" @keydown.capture="handleKeydown">
          <div class="flex items-center gap-1">
            <span>{{ t('recording.template') }}</span>
            <Tooltip :title="t('recording.templateHint')" :trigger="['hover', 'focus']">
              <button
                type="button"
                class="nikki-icon-button inline-flex border-0 bg-transparent p-0"
                :aria-label="t('recording.templateHint')"
              >
                <CircleAlert class="size-3.5" />
              </button>
            </Tooltip>
          </div>
          <KeyTemplateSelect
            :templates="templateOptions"
            :model-value="settings.templateId"
            :width="224"
            :disabled="settings.busy || disabled"
            :aria-label="t('recording.template')"
            @update:model-value="templateChanged"
          />
        </div>
      </template>
      <Button
        size="small"
        color="primary"
        variant="text"
        :aria-label="t('recording.template')"
        :aria-expanded="templateOpen"
      >
        <template #icon>
          <KeyboardMusic class="size-4" :stroke-width="2" />
        </template>
      </Button>
    </Popover>
    <Popover
      v-model:open="settingsOpen"
      :trigger="['hover', 'click']"
      placement="bottomRight"
      :mouse-enter-delay="0.12"
      :mouse-leave-delay="0.14"
    >
      <template #content>
        <div
          class="flex max-h-[calc(100dvh-160px)] w-56 max-w-[calc(100vw-48px)] flex-col gap-3 overflow-y-auto"
          @keydown.capture="handleKeydown"
        >
          <div class="flex items-center gap-1">
            <span>{{ t('recording.method') }}</span>
            <Tooltip
              :title="t(`recording.modeHint.${settings.mode}`)"
              :trigger="['hover', 'focus']"
            >
              <button
                type="button"
                class="nikki-icon-button inline-flex border-0 bg-transparent p-0"
                :aria-label="t(`recording.modeHint.${settings.mode}`)"
              >
                <CircleAlert class="size-3.5" />
              </button>
            </Tooltip>
          </div>
          <Select
            :value="settings.mode"
            :options="options"
            :disabled="modeLocked"
            :aria-label="t('recording.method')"
            class="w-full"
            @update:value="modeChanged"
          />
          <div v-if="settings.mode === 'replace'" class="flex flex-col gap-2">
            <label class="flex items-center justify-between gap-3">
              <span>{{ t('recording.rangeStart') }}</span>
              <InputNumber
                :value="range.start"
                :min="1"
                :max="range.end - 1"
                :precision="0"
                :disabled="modeLocked"
                :aria-label="t('recording.rangeStart')"
                class="w-24"
                @update:value="emit('range', { start: Number($event), end: range.end })"
              />
            </label>
            <label class="flex items-center justify-between gap-3">
              <span>{{ t('recording.rangeEnd') }}</span>
              <InputNumber
                :value="range.end"
                :min="range.start + 1"
                :max="100000"
                :precision="0"
                :disabled="modeLocked"
                :aria-label="t('recording.rangeEnd')"
                class="w-24"
                @update:value="emit('range', { start: range.start, end: Number($event) })"
              />
            </label>
            <p class="m-0 max-w-72 text-xs text-[var(--color-muted-dark)]">
              {{ t('recording.rangeHelp') }}
            </p>
            <p class="m-0 max-w-72 text-xs text-[var(--color-muted-dark)]">
              {{ t('recording.replaceHint') }}
            </p>
          </div>
          <Checkbox
            :checked="settings.countIn"
            :disabled="settings.busy || disabled"
            @update:checked="emit('setting', { key: 'countIn', value: $event })"
          >
            {{ t('recording.countIn') }}
          </Checkbox>
          <Checkbox
            :checked="settings.metronome"
            :disabled="settings.busy || disabled"
            @update:checked="emit('setting', { key: 'metronome', value: $event })"
          >
            {{ t('recording.metronome') }}
          </Checkbox>
          <Tooltip :title="t('recording.accompanimentHint')">
            <Checkbox
              :checked="settings.accompaniment"
              :disabled="settings.busy || disabled"
              @update:checked="emit('setting', { key: 'accompaniment', value: $event })"
            >
              {{ t('recording.accompaniment') }}
            </Checkbox>
          </Tooltip>
        </div>
      </template>
      <Button
        size="small"
        color="primary"
        variant="text"
        :aria-label="t('recording.method')"
        :aria-expanded="settingsOpen"
      >
        <template #icon>
          <Wrench class="size-4" :stroke-width="2" />
        </template>
      </Button>
    </Popover>
  </div>
</template>
