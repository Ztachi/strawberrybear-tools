<script setup lang="ts">
/** @description: 通过 Teleport 将页面上下文中的 antdv 组件放入可见音轨行。 */
import { Switch } from 'antdv-next'
import { useI18n } from 'vue-i18n'
import type {
  PianoRollTrackLabelContext,
  PianoRollTrackToggleContext,
} from '@strawberrybear/piano-roll/browser'
import type { PianoTrackHost } from '../../usePianoTrackHosts'
import PianoTrackLabel from '../PianoTrackLabel.vue'

defineProps<{
  labels: ReadonlyMap<HTMLElement, PianoTrackHost<PianoRollTrackLabelContext>>
  toggles: ReadonlyMap<HTMLElement, PianoTrackHost<PianoRollTrackToggleContext>>
}>()

const { t } = useI18n()

function toggleTrack(context: PianoRollTrackToggleContext, value: unknown): void {
  if (value !== context.checked) context.onChange()
}
</script>

<template>
  <Teleport
    v-for="[, host] in labels"
    :key="host.id"
    :to="host.container"
  >
    <PianoTrackLabel :name="host.context.track.name" />
  </Teleport>
  <Teleport
    v-for="[, host] in toggles"
    :key="host.id"
    :to="host.container"
  >
    <Switch
      size="small"
      :checked="host.context.checked"
      :aria-label="`${t(host.context.checked ? 'midi.clickToDisable' : 'midi.clickToEnable')}: ${host.context.track.name}`"
      @update:checked="toggleTrack(host.context, $event)"
    />
  </Teleport>
</template>
