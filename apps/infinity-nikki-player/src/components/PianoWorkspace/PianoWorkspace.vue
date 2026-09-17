<script setup lang="ts">
/** 总览与详情是一个可迁移的视图单元；路由、音频和系统窗口不属于本组件。 */
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Tooltip } from 'antdv-next'
import { ExternalLink, ListFilter, PanelBottom } from 'lucide-vue-next'
import PianoRoll from '@strawberrybear/piano-roll/vue'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type {
  PianoRollLabels,
  PianoRollTransport,
  PianoRollView,
  PianoRollViewport,
} from '@strawberrybear/piano-roll/browser'
import type { PianoWorkspaceState } from '@/features/piano-editor'
import PianoEditorPanel from '@/components/PianoEditorPanel/PianoEditorPanel.vue'
import PianoRollControls from '@/components/PianoRollControls.vue'
import PianoTrackLabel from '@/components/PianoTrackLabel.vue'
import PianoTrackHosts from './components/PianoTrackHosts/PianoTrackHosts.vue'
import PianoRollHelpDialog from './components/PianoRollHelpDialog.vue'
import { usePianoEditorResize } from './usePianoEditorResize'
import { usePianoEditorSelection } from './usePianoEditorSelection'
import { usePianoTrackHosts } from './usePianoTrackHosts'
import { usePianoRollZoomPersistence } from './usePianoRollZoomPersistence'

const props = defineProps<{
  filename: string
  document: PianoRollDocument
  transport: PianoRollTransport
  labels: PianoRollLabels
  restore?: PianoWorkspaceState
  detached?: boolean
  opening?: boolean
}>()
const emit = defineEmits<{
  seek: [seconds: number]
  'seek-preview': [seconds: number | null]
  'toggle-track': [trackId: string]
  'state-change': [state: PianoWorkspaceState]
  migrate: []
}>()
const { t } = useI18n()
const {
  heightPercent: editorHeightPercent,
  handleRef: editorResizeHandleRef,
  containerRef: detailBodyRef,
  begin: beginEditorResize,
  move: moveEditorResize,
  end: endEditorResize,
  onKeydown: handleEditorResizeKey,
} = usePianoEditorResize(() => closePianoEditor())
const {
  selectedTrackId,
  isOpen: isPianoEditorOpen,
  select: selectPianoTrack,
  activate: openPianoEditor,
  close: closePianoEditor,
} = usePianoEditorSelection(
  computed(() => props.document.tracks),
  () => {
    endEditorResize()
    previewPianoSeek(null)
  }
)
const hideEmptyPianoTracks = ref(props.restore?.hideEmptyTracks ?? true)
const overviewPianoRollLabels = computed(() => ({
  ...props.labels,
  empty: hideEmptyPianoTracks.value ? t('midi.pianoRoll.noTracksWithNotes') : props.labels.empty,
}))
const {
  overviewTimeZoom: pianoOverviewTimeZoom,
  editorTimeZoom: pianoEditorTimeZoom,
  editorPitchZoom: pianoEditorPitchZoom,
  persistOverview,
  persistEditor,
} = usePianoRollZoomPersistence(computed(() => props.filename))
const {
  labels: pianoTrackLabelHosts,
  toggles: pianoTrackToggleHosts,
  renderLabel: renderPianoTrackLabel,
  renderToggle: renderPianoTrackToggle,
} = usePianoTrackHosts()
const overviewPanel = ref<{ getView: () => PianoRollView | null } | null>(null)
const editorPanel = ref<{ getView: () => PianoRollView | null } | null>(null)
const overviewViewport = shallowRef(props.restore?.overview)
const editorViewport = shallowRef(props.restore?.editor)
const editorRestoreViewport = shallowRef(props.restore?.editor)
let restoring = !!props.restore

/** @return 两个视图及面板布局的迁移快照，不含文档或播放状态。 */
function getState(): PianoWorkspaceState {
  return {
    selectedTrackId: selectedTrackId.value,
    editorOpen: isPianoEditorOpen.value,
    hideEmptyTracks: hideEmptyPianoTracks.value,
    editorHeight: editorHeightPercent.value,
    overview: overviewPanel.value?.getView()?.getViewport() ?? overviewViewport.value,
    editor: editorPanel.value?.getView()?.getViewport() ?? editorViewport.value,
  }
}
function changed(): void {
  if (!restoring) emit('state-change', getState())
}
function persistOverviewViewport(viewport: Readonly<PianoRollViewport>): void {
  overviewViewport.value = viewport
  persistOverview(viewport)
  changed()
}
function persistEditorViewport(viewport: Readonly<PianoRollViewport>): void {
  editorViewport.value = viewport
  persistEditor(viewport)
  changed()
}
function previewPianoSeek(seconds: number | null): void {
  emit('seek-preview', seconds)
}
function seekPianoRoll(seconds: number): void {
  emit('seek', seconds)
}
function togglePianoTrack(trackId: string): void {
  emit('toggle-track', trackId)
}
function migrate(): void {
  endEditorResize()
  changed()
  emit('migrate')
}
/** 恢复时先装配详情，再恢复两个真实视口；播放帧不能重新应用迁移快照。 */
async function restoreWorkspace(): Promise<void> {
  const saved = props.restore
  if (!saved) {
    restoring = false
    return
  }
  restoring = true
  selectPianoTrack(saved.selectedTrackId ?? '')
  isPianoEditorOpen.value = saved.editorOpen && props.document.tracks.length > 0
  hideEmptyPianoTracks.value = saved.hideEmptyTracks
  editorHeightPercent.value = saved.editorHeight
  editorRestoreViewport.value = saved.editor
  await nextTick()
  if (saved.overview) overviewPanel.value?.getView()?.restoreViewport(saved.overview)
  if (saved.editor) editorPanel.value?.getView()?.restoreViewport(saved.editor)
  restoring = false
  changed()
}
/** 子窗口按本地动画帧直接更新控制器，避免整棵 Vue UI 每帧跨窗口重建。 */
function setTransport(transport: PianoRollTransport): void {
  overviewPanel.value?.getView()?.setTransport(transport)
  editorPanel.value?.getView()?.setTransport(transport)
}
onMounted(restoreWorkspace)
watch(() => props.restore, restoreWorkspace, { flush: 'post' })
watch([selectedTrackId, isPianoEditorOpen, hideEmptyPianoTracks, editorHeightPercent], changed, {
  flush: 'post',
})
defineExpose({ getState, setTransport })
</script>

<template>
  <div
    ref="detailBodyRef"
    class="detail-body piano-workspace"
    :style="{ '--piano-editor-height': `${editorHeightPercent}%` }"
  >
    <PianoTrackHosts
      :labels="pianoTrackLabelHosts"
      :toggles="pianoTrackToggleHosts"
    />
    <div
      class="piano-overview-host"
      :class="{ 'piano-overview-host--with-editor': isPianoEditorOpen }"
    >
      <PianoRoll
        ref="overviewPanel"
        :key="filename"
        class="detail-piano-roll"
        variant="overview"
        :document="document"
        :transport="transport"
        :labels="overviewPianoRollLabels"
        :selected-track-id="selectedTrackId"
        :time-zoom="pianoOverviewTimeZoom"
        :show-toolbar-controls="false"
        :hide-empty-tracks="hideEmptyPianoTracks"
        :render-track-label="renderPianoTrackLabel"
        :render-track-toggle="renderPianoTrackToggle"
        @select-track="selectPianoTrack"
        @open-editor="openPianoEditor"
        @toggle-track="togglePianoTrack"
        @seek="seekPianoRoll"
        @seek-preview="previewPianoSeek"
        @viewport-change="persistOverviewViewport"
      >
        <template #title="{ label }">
          <strong class="piano-roll-slot-title"><PianoTrackLabel :name="label" /></strong>
        </template>
        <template #toolbar="{ view, viewport }">
          <div class="piano-roll-app-toolbar">
            <PianoRollControls
              :view="view"
              :viewport="viewport"
              :labels="labels"
            />
            <Tooltip :title="t(detached ? 'midi.pianoRoll.dock' : 'midi.pianoRoll.detach')">
              <Button
                class="piano-roll-trailing-action"
                size="small"
                type="primary"
                :loading="opening"
                :aria-label="t(detached ? 'midi.pianoRoll.dock' : 'midi.pianoRoll.detach')"
                @click="migrate"
              >
                <template #icon>
                  <component
                    :is="detached ? PanelBottom : ExternalLink"
                    class="size-4"
                    :stroke-width="2"
                  />
                </template>
              </Button>
            </Tooltip>
            <Tooltip :title="t('midi.pianoRoll.hideEmptyTracks')">
              <Button
                size="small"
                :type="hideEmptyPianoTracks ? 'primary' : 'default'"
                :aria-pressed="hideEmptyPianoTracks"
                :aria-label="t('midi.pianoRoll.hideEmptyTracks')"
                @click="hideEmptyPianoTracks = !hideEmptyPianoTracks"
              >
                <template #icon>
                  <ListFilter
                    class="size-4"
                    :stroke-width="2"
                  />
                </template>
              </Button>
            </Tooltip>
            <PianoRollHelpDialog />
          </div>
        </template>
      </PianoRoll>
    </div>
    <section
      v-if="isPianoEditorOpen"
      class="piano-editor-overlay"
      :aria-label="t('midi.pianoRoll.editor')"
      @keydown.esc.stop="closePianoEditor"
    >
      <div
        ref="editorResizeHandleRef"
        class="piano-editor-resize-handle"
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
        :aria-label="t('midi.pianoRoll.resize')"
        :aria-valuenow="Math.round(editorHeightPercent)"
        :aria-valuemin="25"
        :aria-valuemax="82"
        :aria-valuetext="t('midi.pianoRoll.heightPercent', { value: Math.round(editorHeightPercent) })"
        @pointerdown="beginEditorResize"
        @pointermove="moveEditorResize"
        @pointerup="endEditorResize"
        @pointercancel="endEditorResize"
        @lostpointercapture="endEditorResize"
        @keydown="handleEditorResizeKey"
      >
        <span aria-hidden="true" />
      </div>
      <PianoEditorPanel
        ref="editorPanel"
        :document="document"
        :transport="transport"
        :labels="labels"
        :selected-track-id="selectedTrackId"
        :time-zoom="pianoEditorTimeZoom"
        :pitch-zoom="pianoEditorPitchZoom"
        :restore="editorRestoreViewport"
        @seek="seekPianoRoll"
        @seek-preview="previewPianoSeek"
        @viewport-change="persistEditorViewport"
        @close="closePianoEditor"
      />
    </section>
  </div>
</template>
<style scoped>
.detail-body {
  @apply relative flex min-h-0 flex-1 flex-col bg-white;
  /* 给总览工具栏、标尺和至少一行轨道留出空间；更小的宿主中浮层自动收缩。 */
  --piano-editor-size: max(0px, min(var(--piano-editor-height), calc(100% - 9rem)));
  border: 1px solid var(--border-primary-15);
}

.piano-overview-host {
  @apply min-h-0 shrink-0;
  height: 100%;
}

.piano-overview-host--with-editor {
  /* 浮层按需出现时保留总览滚动条的可见区域，实例、缩放与滚动策略保持独立。 */
  height: calc(100% - var(--piano-editor-size));
}

.detail-piano-roll {
  @apply h-full w-full min-h-0;
  border: 0;
  border-radius: 0;
}

.piano-roll-slot-title {
  @apply mr-4 min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap;
  max-width: 30%;
}

.piano-roll-app-toolbar {
  @apply flex min-w-0 flex-1 items-center gap-2;
}

.piano-roll-trailing-action {
  @apply ml-auto shrink-0;
}

.detail-piano-roll :deep(.pr-gutter) {
  border-right-color: var(--border-primary-10);
}

.detail-piano-roll :deep(.pr-track) {
  border-bottom-color: var(--border-primary-10);
}

.piano-editor-overlay {
  @apply absolute inset-x-0 bottom-0 z-20 flex min-h-0 flex-col;
  height: var(--piano-editor-size);
  background: var(--bg-white-95);
  border-top: 1px solid var(--border-primary-30);
}

.piano-editor-resize-handle {
  /* 触控命中区仍保持 12px，但视觉上只保留一条轻量分隔线。 */
  @apply relative flex h-3 shrink-0 touch-none cursor-ns-resize items-center justify-center;
  background: transparent;
}

.piano-editor-resize-handle span {
  @apply h-0.5 w-12 rounded-full;
  background: var(--border-primary);
}

.piano-editor-resize-handle:focus-visible {
  @apply outline-none;
  box-shadow: inset 0 0 0 2px var(--color-primary-active);
}


</style>
