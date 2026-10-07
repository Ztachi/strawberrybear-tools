<script setup lang="ts">
/** 录制设置仅改变本地会话，受控模板选择不会写入全局设置。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Select, Checkbox, Tooltip } from 'antdv-next'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import type { TrackRecorder } from '@/features/midi-recording/controller'
import type { KeyTemplate } from '@/types'
const props = defineProps<{ recorder: TrackRecorder; version: number; templates: readonly KeyTemplate[]; position: string; disabled: boolean }>()
const emit = defineEmits<{ change: []; mode: [value: TrackRecorder['mode']]; setting: [value: { key: 'countIn' | 'metronome' | 'accompaniment'; value: boolean }] }>()
const { t } = useI18n()
const expanded = ref(false)
const options = computed(() => ['append', 'overdub', 'replace'].map(value => ({ value, label: t(`recording.mode.${value}`) })))
const templateOptions = computed(() => props.templates.some(template => template.id === props.recorder.template.id) ? props.templates : [...props.templates, props.recorder.template])
function templateChanged(id: string): void {
  const template = templateOptions.value.find(item => item.id === id)
  if (template) props.recorder.selectTemplate(template)
  emit('change')
}
function modeChanged(value: unknown): void {
  emit('mode', value as TrackRecorder['mode'])
}
</script>
<template>
  <div class="flex flex-wrap items-center gap-3" :data-version="version">
    <label class="flex items-center gap-2"
      ><span>{{ t('recording.template') }}</span>
      <KeyTemplateSelect
        :templates="templateOptions"
        :model-value="recorder.template.id"
        :width="210"
        :disabled="recorder.busy || disabled"
        @update:model-value="templateChanged"
      />
    </label>
    <Select
      :value="recorder.mode"
      :options="options"
      :disabled="recorder.busy || disabled"
      :aria-label="t('recording.method')"
      style="width: 160px"
      @update:value="modeChanged"
    />
    <span class="text-sm text-muted-foreground">{{ t('recording.position', { position }) }}</span>
    <Button size="small" @click="expanded = !expanded">
      {{ t('recording.more') }}
    </Button>
  </div>
  <div v-if="expanded" class="mt-3 flex flex-wrap items-center gap-4">
    <Checkbox
      :checked="recorder.countIn"
      :disabled="recorder.busy || disabled"
      @update:checked="emit('setting', { key: 'countIn', value: $event })"
    >
      {{ t('recording.countIn') }}
    </Checkbox>
    <Checkbox
      :checked="recorder.metronome"
      :disabled="recorder.busy || disabled"
      @update:checked="emit('setting', { key: 'metronome', value: $event })"
    >
      {{ t('recording.metronome') }}
    </Checkbox>
    <Tooltip :title="t('recording.accompanimentHint')">
      <Checkbox
        :checked="recorder.accompaniment"
        :disabled="recorder.busy || disabled"
        @update:checked="emit('setting', { key: 'accompaniment', value: $event })"
      >
        {{ t('recording.accompaniment') }}
      </Checkbox>
    </Tooltip>
  </div>
</template>
