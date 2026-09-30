<script setup lang="ts">
/** 首次进入编辑器时展示关键操作；完成或跳过后记住偏好。 */
import { computed, nextTick, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { Tour } from 'antdv-next'
import type { TourStepItem } from 'antdv-next'

const props = defineProps<{
  root: HTMLElement | null
  ready: boolean
}>()
const { t } = useI18n()
const seen = useStorage('nikki:midi-editor-tour-seen', false)
const open = ref(false)
const steps = computed<TourStepItem[]>(() => [
  {
    title: t('midiEditor.tour.tracks.title'),
    description: t('midiEditor.tour.tracks.description'),
    target: () => props.root?.querySelector<HTMLElement>('.detail-piano-roll') ?? null,
    placement: 'center',
  },
  {
    title: t('midiEditor.tour.edit.title'),
    description: t('midiEditor.tour.edit.description'),
    target: () => props.root?.querySelector<HTMLElement>('.pr-track-select') ?? null,
    placement: 'right',
  },
  {
    title: t('midiEditor.tour.sort.title'),
    description: t('midiEditor.tour.sort.description'),
    target: () => props.root?.querySelector<HTMLElement>('.track-drag-handle') ?? null,
    placement: 'right',
  },
  {
    title: t('midiEditor.tour.tools.title'),
    description: t('midiEditor.tour.tools.description'),
    target: () => props.root?.closest('main, .midi-editor-page')?.querySelector<HTMLElement>('.editor-toolbar') ?? null,
    placement: 'bottom',
  },
])

watch(() => props.ready && !!props.root, async ready => {
  if (!ready || seen.value) return
  await nextTick()
  if (!props.ready || !props.root || seen.value) return
  seen.value = true
  open.value = true
}, { immediate: true, flush: 'post' })

function close(): void {
  open.value = false
}
</script>

<template>
  <Tour
    v-if="open"
    :open="open"
    :steps="steps"
    :scroll-into-view-options="false"
    disabled-interaction
    @close="close"
    @finish="close"
  />
</template>
