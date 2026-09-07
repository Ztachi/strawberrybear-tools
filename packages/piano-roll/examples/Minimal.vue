<script setup lang="ts">
/** @description: 无音频依赖的最小组合示例。实际播放器把 transport 替换成权威音频时钟即可。 */
import { computed, ref } from 'vue'
import PianoRoll from '../src/PianoRoll.vue'
import type { PianoRollDocument } from '../src/core'
import type { PianoRollTransport } from '../src/browser'

const document: PianoRollDocument = {
  ticksPerBeat: 480,
  durationTicks: 9600,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }, { tick: 3840, microsecondsPerQuarter: 625000 }],
  timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [
    { id: 'piano', name: 'Grand Piano', isPercussion: false, enabled: true },
    { id: 'bass', name: 'Bass', isPercussion: false, enabled: true },
  ],
  notes: Array.from({ length: 32 }, (_, index) => ({
    id: `note-${index}`, trackId: index % 2 ? 'piano' : 'bass',
    startTick: 480 + index * 240, endTick: 660 + index * 240,
    pitch: (index % 2 ? 60 : 36) + [0, 4, 7, 12][index % 4]!, velocity: 90,
  })),
}
const selected = ref('piano')
const open = ref(false)
const seconds = ref(0)
const preview = ref<number | null>(null)
const transport = computed<PianoRollTransport>(() => ({
  positionSeconds: preview.value ?? seconds.value, isPlaying: false, playbackRate: 1,
}))
function openTrack(id: string): void { selected.value = id; open.value = true }
function seek(value: number): void { seconds.value = value }
</script>

<template>
  <main class="demo">
    <div
      class="overview"
      :class="{ shortened: open }"
    >
      <PianoRoll
        :document="document"
        :transport="transport"
        :selected-track-id="selected"
        @select-track="selected = $event"
        @open-editor="openTrack"
        @seek="seek"
        @seek-preview="preview = $event"
      />
    </div>
    <aside
      v-if="open"
      class="floating-editor"
      aria-label="单轨详情"
    >
      <PianoRoll
        variant="editor"
        :document="document"
        :transport="transport"
        :selected-track-id="selected"
        @seek="seek"
        @seek-preview="preview = $event"
      >
        <template #toolbar>
          <button
            type="button"
            @click="open = false"
          >
            关闭
          </button>
        </template>
      </PianoRoll>
    </aside>
  </main>
</template>

<style scoped>
.demo { position: relative; height: 680px; }
.overview { height: 100%; }
.overview.shortened { height: 48%; }
.floating-editor { position: absolute; inset: auto 0 0; height: 50%; }
</style>
