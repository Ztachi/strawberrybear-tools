<script setup lang="ts">
/** @description: Vue 薄适配层；文档、时间、事件与持久浏览器控制器的生命周期桥接。 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { createPianoRollEditor, createTracksOverview, defaultLabels, type PianoRollView, type PianoRollViewport } from './browser'
import type { PianoRollProps } from './vue-props'

const props = withDefaults(defineProps<PianoRollProps>(), {
  variant: 'overview', selectedTrackId: null, timeZoom: undefined, pitchZoom: 16,
})
const emit = defineEmits<{
  'select-track': [trackId: string]
  'open-editor': [trackId: string]
  'toggle-track': [trackId: string]
  'seek-preview': [seconds: number | null]
  seek: [seconds: number]
  'follow-change': [enabled: boolean]
  'viewport-change': [viewport: Readonly<PianoRollViewport>]
}>()
const host = ref<HTMLDivElement | null>(null)
const labels = computed(() => ({ ...defaultLabels, ...props.labels }))
const viewport = shallowRef<Readonly<PianoRollViewport>>({
  scrollLeft: 0, scrollTop: 0, timeZoom: props.timeZoom ?? (props.variant === 'overview' ? 42 : 110),
  pitchZoom: props.pitchZoom, follow: true,
})
const selectedTrack = computed(() => props.document.tracks.find((track) => track.id === props.selectedTrackId))
let view: PianoRollView | null = null

function mountView(): void {
  view?.destroy()
  if (!host.value) return
  const create = props.variant === 'overview' ? createTracksOverview : createPianoRollEditor
  view = create({
    container: host.value, document: props.document, transport: props.transport,
    selectedTrackId: props.selectedTrackId, timeZoom: viewport.value.timeZoom,
    pitchZoom: viewport.value.pitchZoom, follow: viewport.value.follow,
    labels: labels.value, plugins: props.plugins,
    onTrackSelect: (id) => emit('select-track', id),
    onTrackOpen: (id) => emit('open-editor', id),
    onTrackToggle: (id) => emit('toggle-track', id),
    onSeek: (seconds) => emit('seek', seconds),
    onSeekPreview: (seconds) => emit('seek-preview', seconds),
    onFollowChange: (enabled) => emit('follow-change', enabled),
    onViewportChange: (next) => { viewport.value = next; emit('viewport-change', next) },
  })
  viewport.value = view.getViewport()
}
function updateTimeZoom(event: Event): void {
  view?.setTimeZoom(Number((event.target as HTMLInputElement).value))
}
function updatePitchZoom(event: Event): void {
  view?.setPitchZoom(Number((event.target as HTMLInputElement).value))
}

onMounted(mountView)
onBeforeUnmount(() => { view?.destroy(); view = null })
watch(() => props.document, (document) => view?.setDocument(document))
watch(() => props.transport, (transport) => view?.setTransport(transport), { deep: true })
watch(() => props.selectedTrackId, (id) => view?.setSelectedTrack(id))
watch(() => props.variant, mountView)
watch(labels, (next) => view?.setLabels(next))
watch(() => props.timeZoom, (zoom) => { if (zoom !== undefined) view?.setTimeZoom(zoom) })
watch(() => props.pitchZoom, (zoom) => view?.setPitchZoom(zoom))
defineExpose({ getView: () => view })
</script>

<template>
  <section
    class="piano-roll"
    :aria-label="variant === 'overview' ? labels.overview : labels.editor"
  >
    <header class="piano-roll-toolbar">
      <strong
        class="piano-roll-title"
      >{{ variant === 'overview' ? labels.overview : (selectedTrack?.name || labels.editor) }}</strong>
      <slot
        name="toolbar"
        :view="view"
        :viewport="viewport"
      />
      <button
        type="button"
        :aria-pressed="viewport.follow"
        @click="view?.setFollow(!viewport.follow)"
      >
        {{ viewport.follow ? labels.following : labels.follow }}
      </button>
      <button
        type="button"
        @click="view?.fitToSong()"
      >
        {{ labels.fit }}
      </button>
      <label class="piano-roll-zoom">
        <span>{{ labels.timeZoom }}</span>
        <input
          type="range"
          :value="viewport.timeZoom"
          min="4"
          max="600"
          step="1"
          @input="updateTimeZoom"
        >
      </label>
      <label
        v-if="variant === 'editor'"
        class="piano-roll-zoom piano-roll-pitch-zoom"
      >
        <span>{{ labels.pitchZoom }}</span>
        <input
          type="range"
          :value="viewport.pitchZoom"
          min="8"
          max="36"
          step="1"
          @input="updatePitchZoom"
        >
      </label>
    </header>
    <div
      ref="host"
      class="piano-roll-host"
    />
  </section>
</template>

<style scoped>
.piano-roll {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #505157;
  border-radius: 8px;
  background: #202124;
  color: #e4e4e7;
  color-scheme: dark;
}
.piano-roll-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  min-height: 38px;
  background: #36373b;
  font: 12px system-ui, sans-serif;
}
.piano-roll-title { margin-right: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.piano-roll-toolbar button { padding: 4px 8px; border: 1px solid #666872; border-radius: 5px; background: #45464d; color: inherit; cursor: pointer; font: inherit; }
.piano-roll-toolbar button[aria-pressed=true] { background: #286daf; border-color: #6ea3dc; }
.piano-roll-toolbar button:focus-visible, .piano-roll-toolbar input:focus-visible { outline: 2px solid #91c7ff; outline-offset: 2px; }
.piano-roll-zoom { display: flex; align-items: center; gap: 6px; }
.piano-roll-zoom input { width: clamp(60px, 8vw, 110px); accent-color: #7cb9f4; }
.piano-roll-host { flex: 1; min-width: 0; min-height: 0; position: relative; }
</style>
