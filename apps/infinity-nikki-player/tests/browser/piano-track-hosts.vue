<script setup lang="ts">
/** 使用真实页面适配组件和主题，验证框架上下文不会因公共库挂载点而丢失。 */
import { computed, ref } from 'vue'
import { Button, ConfigProvider, Switch, Tooltip } from 'antdv-next'
import PianoRoll from '@strawberrybear/piano-roll/vue'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
import { usePianoTrackHosts } from '@/components/PianoWorkspace/usePianoTrackHosts'
import PianoTrackHosts from '@/components/PianoWorkspace/components/PianoTrackHosts/PianoTrackHosts.vue'

const hosts = usePianoTrackHosts()
const visible = ref(true)
const alternateTheme = ref(false)
const selected = ref('')
const document = ref<PianoRollDocument>({
  durationTicks: 9600,
  ticksPerBeat: 480,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
  timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    name: index === 0 ? 'メタルマックス「涙の7ミリ機関砲」 — 很长的音轨名称' : `音轨 ${index + 1}`,
    enabled: true,
    isPercussion: false,
    endTick: index === 0 ? 0 : 9600,
  })),
  notes: [],
})
const theme = computed(() => ({
  ...infinityNikkiConfigProviderProps.theme,
  token: {
    ...infinityNikkiConfigProviderProps.theme?.token,
    ...(alternateTheme.value ? { colorPrimary: '#8b5cf6' } : {}),
  },
}))

function toggleTrack(id: string): void {
  document.value = {
    ...document.value,
    tracks: document.value.tracks.map((track) =>
      track.id === id ? { ...track, enabled: !track.enabled } : track
    ),
  }
}
</script>

<template>
  <ConfigProvider
    v-bind="infinityNikkiConfigProviderProps"
    :theme="theme"
  >
    <main style="padding: 24px; background: white">
      <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px">
        <Switch
          data-testid="reference-switch"
          size="small"
          :checked="true"
        />
        <Tooltip
          title="Reference tooltip"
          placement="topLeft"
        >
          <span data-testid="reference-tooltip">Reference tooltip</span>
        </Tooltip>
        <Button
          data-testid="change-theme"
          @click="alternateTheme = !alternateTheme"
        >
          Change theme
        </Button>
        <Button
          data-testid="hide"
          @click="visible = !visible"
        >
          Toggle overview
        </Button>
        <span data-testid="selection">{{ selected }}</span>
      </div>
      <PianoTrackHosts
        :labels="hosts.labels"
        :toggles="hosts.toggles"
      />
      <PianoRoll
        v-if="visible"
        style="height: 350px"
        :document="document"
        :transport="{ positionSeconds: 0, isPlaying: false, playbackRate: 1 }"
        :show-toolbar-controls="false"
        :render-track-label="hosts.renderLabel"
        :render-track-toggle="hosts.renderToggle"
        @toggle-track="toggleTrack"
        @select-track="selected = $event"
      />
      <output data-testid="label-host-count">{{ hosts.labels.size }}</output>
      <output data-testid="toggle-host-count">{{ hosts.toggles.size }}</output>
    </main>
  </ConfigProvider>
</template>
