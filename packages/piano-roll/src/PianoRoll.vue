<script setup lang="ts">
/** @description: Vue 薄适配层；文档、时间、事件与持久浏览器控制器的生命周期桥接。 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { TIME_ZOOM_CONFIG, createPianoRollEditor, createTracksOverview, defaultLabels, sliderToTimeZoom, timeZoomToSlider, type PianoRollTrackOpenContext, type PianoRollView, type PianoRollViewport } from './browser'
import { pianoRollThemeVariables, resolvePianoRollTheme } from './browser/theme'
import type { PianoRollProps } from './vue-props'

const props = withDefaults(defineProps<PianoRollProps>(), {
  variant: 'overview', selectedTrackId: null, timeZoom: undefined, pitchZoom: 16,
  hideEmptyTracks: false,
  showToolbarControls: true,
})
const emit = defineEmits<{
  'select-track': [trackId: string]
  'open-editor': [trackId: string, context: PianoRollTrackOpenContext]
  'toggle-track': [trackId: string]
  'seek-preview': [seconds: number | null]
  seek: [seconds: number]
  'follow-change': [enabled: boolean]
  'viewport-change': [viewport: Readonly<PianoRollViewport>]
}>()
const host = ref<HTMLDivElement | null>(null)
const labels = computed(() => ({ ...defaultLabels, ...props.labels }))
const themeVariables = computed(() => pianoRollThemeVariables(resolvePianoRollTheme(props.theme)))
const viewport = shallowRef<Readonly<PianoRollViewport>>({
  scrollLeft: 0, scrollTop: 0, timeZoom: props.timeZoom ?? (props.variant === 'overview' ? 42 : 110),
  minTimeZoom: 1, maxTimeZoom: TIME_ZOOM_CONFIG.maxPixelsPerSecond,
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
    hideEmptyTracks: props.hideEmptyTracks,
    labels: labels.value, theme: props.theme, plugins: props.plugins,
    onTrackSelect: (id) => emit('select-track', id),
    onTrackOpen: (id, context) => emit('open-editor', id, context),
    onTrackToggle: (id) => emit('toggle-track', id),
    renderTrackToggle: props.renderTrackToggle,
    renderTrackLabel: props.renderTrackLabel,
    onSeek: (seconds) => emit('seek', seconds),
    onSeekPreview: (seconds) => emit('seek-preview', seconds),
    onFollowChange: (enabled) => emit('follow-change', enabled),
    onViewportChange: (next) => { viewport.value = next; emit('viewport-change', next) },
  })
  viewport.value = view.getViewport()
}
function updateTimeZoom(event: Event): void {
  view?.setTimeZoom(sliderToTimeZoom(Number((event.target as HTMLInputElement).value), viewport.value.minTimeZoom, viewport.value.maxTimeZoom))
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
watch(() => props.theme, (next) => view?.setTheme(next), { deep: true })
watch(() => props.timeZoom, (zoom) => { if (zoom !== undefined) view?.setTimeZoom(zoom) })
watch(() => props.pitchZoom, (zoom) => view?.setPitchZoom(zoom))
watch(() => props.hideEmptyTracks, (enabled) => view?.setHideEmptyTracks(enabled))
defineExpose({ getView: () => view })
</script>

<template>
  <section
    class="piano-roll"
    :style="themeVariables"
    :aria-label="variant === 'overview' ? labels.overview : labels.editor"
  >
    <header class="piano-roll-toolbar">
      <slot
        name="title"
        :label="variant === 'overview' ? labels.overview : (selectedTrack?.name || labels.editor)"
      >
        <strong
          class="piano-roll-title"
          :aria-label="variant === 'overview' ? labels.overview : (selectedTrack?.name || labels.editor)"
        >{{ variant === 'overview' ? labels.overview : (selectedTrack?.name || labels.editor) }}</strong>
      </slot>
      <slot
        name="toolbar"
        :view="view"
        :viewport="viewport"
      />
      <template v-if="props.showToolbarControls">
        <button
          class="piano-roll-native-button"
          type="button"
          :aria-pressed="viewport.follow"
          @click="view?.setFollow(!viewport.follow)"
        >
          {{ viewport.follow ? labels.following : labels.follow }}
        </button>
        <button
          class="piano-roll-native-button"
          type="button"
          @click="view?.fitToSong()"
        >
          {{ labels.fit }}
        </button>
        <label class="piano-roll-zoom">
          <span>{{ labels.timeZoom }}</span>
          <input
            type="range"
            :min="0"
            :max="100"
            :value="timeZoomToSlider(viewport.timeZoom, viewport.minTimeZoom, viewport.maxTimeZoom)"
            :disabled="viewport.minTimeZoom === viewport.maxTimeZoom"
            step="any"
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
      </template>
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
  /* 标尺手柄可在首尾跨过边界；音轨、琴键及音符由各自视口负责裁剪。 */
  overflow: visible;
  /* 视图本身不是卡片；宿主决定浮层/页面边界，避免总览和详情叠加多层框线。 */
  border: 0;
  border-radius: 0;
  background: var(--pr-surface);
  color: var(--pr-text);
  color-scheme: light;
  container: piano-roll / inline-size;
}
.piano-roll-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  min-height: 36px;
  flex-shrink: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--pr-border), transparent 30%);
  font: 12px var(--pr-font-family);
}
.piano-roll-title { margin-right: auto; flex: 1 1 80px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.piano-roll-native-button { flex-shrink: 0; padding: 4px 8px; border: 1px solid var(--pr-border); border-radius: var(--pr-control-radius); background: var(--pr-surface); color: inherit; cursor: pointer; font: inherit; }
.piano-roll-native-button:hover { background: var(--pr-primary-soft); }
.piano-roll-native-button[aria-pressed=true] { background: var(--pr-primary-soft); border-color: var(--pr-primary); }
.piano-roll-toolbar button:focus-visible, .piano-roll-toolbar input:focus-visible { outline: 2px solid var(--pr-focus); outline-offset: 2px; }
.piano-roll-zoom { display: flex; align-items: center; gap: 6px; }
.piano-roll-zoom input { width: clamp(60px, 12cqi, 110px); height: 18px; margin: 0; appearance: none; background: transparent; accent-color: var(--pr-primary); cursor: pointer; }
.piano-roll-zoom input::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: var(--pr-border); }
.piano-roll-zoom input::-webkit-slider-thumb { width: 12px; height: 12px; margin-top: -4px; border: 0; border-radius: 50%; appearance: none; background: var(--pr-primary); }
.piano-roll-zoom input::-moz-range-track { height: 4px; border-radius: 999px; background: var(--pr-border); }
.piano-roll-zoom input::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: var(--pr-primary); }
.piano-roll-zoom input:disabled { opacity: .5; cursor: default; }
.piano-roll-host { flex: 1; min-width: 0; min-height: 0; position: relative; }
@container piano-roll (max-width: 540px) {
  .piano-roll-toolbar { gap: 6px; padding: 6px; }
  .piano-roll-pitch-zoom { margin-left: auto; }
}
</style>
