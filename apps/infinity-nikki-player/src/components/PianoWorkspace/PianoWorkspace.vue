<script setup lang="ts">
/** 总览与详情是一个可迁移的视图单元；路由、音频和系统窗口不属于本组件。 */
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Tooltip } from 'antdv-next'
import { ExportOutlined, FilterOutlined, ImportOutlined } from '@antdv-next/icons'
import { Pencil } from 'lucide-vue-next'
import PianoRoll from '@strawberrybear/piano-roll/vue'
import type { PianoRollProps } from '@strawberrybear/piano-roll/vue'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type {
  PianoRollEditIntent,
  PianoRollLabels,
  PianoRollTransport,
  PianoRollView,
  PianoRollViewport,
} from '@strawberrybear/piano-roll/browser'
import type { PianoWorkspaceState } from '@/features/piano-editor'
import PianoEditorPanel from '@/components/PianoEditorPanel/PianoEditorPanel.vue'
import PianoRollFollowButton from '@/components/PianoRollFollowButton.vue'
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
  /** 编辑层配置；传入后总览与详情都进入编辑模式，意图经 `edit-intent` 发出。 */
  editing?: PianoRollProps['editing']
  /** 总览轨道行右侧操作位渲染器（编辑模式下的轨道菜单）。 */
  renderTrackActions?: PianoRollProps['renderTrackActions']
  /** 隐藏“独立窗口”按钮；编辑器不支持跨窗口编辑。 */
  hideDetach?: boolean
  /** 显示“编辑此 MIDI”入口；仅主窗口详情页可用。 */
  showEdit?: boolean
}>()
const emit = defineEmits<{
  seek: [seconds: number]
  'seek-preview': [seconds: number | null]
  'toggle-track': [trackId: string]
  'state-change': [state: PianoWorkspaceState]
  'edit-intent': [intent: PianoRollEditIntent]
  migrate: []
  edit: []
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
} = usePianoEditorResize(() => closePianoEditor(), props.editing ? 70 : 55)
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
// 编辑模式默认显示空轨，否则新建的空音轨会立刻从总览消失。
const hideEmptyPianoTracks = ref(props.restore?.hideEmptyTracks ?? !props.editing)
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
/**
 * @description: 选中并打开某条音轨的详情浮层（编辑器新建项目/新增轨道后聚焦）。
 * @param {string} trackId 轨道 ID
 * @return {void}
 */
function openTrack(trackId: string): void {
  selectPianoTrack(trackId)
  if (props.document.tracks.some((track) => track.id === trackId)) isPianoEditorOpen.value = true
}
function forwardEditIntent(intent: PianoRollEditIntent): void {
  emit('edit-intent', intent)
}
onMounted(restoreWorkspace)
watch(() => props.restore, restoreWorkspace, { flush: 'post' })
watch([selectedTrackId, isPianoEditorOpen, hideEmptyPianoTracks, editorHeightPercent], changed, {
  flush: 'post',
})
defineExpose({ getState, setTransport, openTrack })
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
        :render-track-actions="renderTrackActions"
        :editing="editing"
        @select-track="selectPianoTrack"
        @open-editor="openPianoEditor"
        @toggle-track="togglePianoTrack"
        @seek="seekPianoRoll"
        @seek-preview="previewPianoSeek"
        @viewport-change="persistOverviewViewport"
        @edit-intent="forwardEditIntent"
      >
        <template #title="{ label }">
          <strong class="piano-roll-slot-title"><PianoTrackLabel :name="label" /></strong>
        </template>
        <template #corner="{ view, viewport }">
          <PianoRollFollowButton
            :view="view"
            :viewport="viewport"
            :labels="labels"
          />
          <Tooltip :title="t('midi.pianoRoll.hideEmptyTracks')">
            <Button
              class="piano-filter-button"
              size="small"
              color="primary"
              :variant="hideEmptyPianoTracks ? 'solid' : 'link'"
              :aria-pressed="hideEmptyPianoTracks"
              :aria-label="t('midi.pianoRoll.hideEmptyTracks')"
              @click="hideEmptyPianoTracks = !hideEmptyPianoTracks"
            >
              <template #icon>
                <FilterOutlined />
              </template>
            </Button>
          </Tooltip>
          <slot name="corner-actions" />
        </template>
        <template #toolbar="{ view, viewport }">
          <div class="piano-roll-app-toolbar">
            <PianoRollControls
              :view="view"
              :viewport="viewport"
              :labels="labels"
            />
            <div class="piano-roll-trailing-actions">
              <slot name="toolbar-actions" />
              <Tooltip
                v-if="showEdit"
                :title="t('midiEditor.editThisMidi')"
              >
                <Button
                  color="primary"
                  variant="link"
                  :aria-label="t('midiEditor.editThisMidi')"
                  @click="emit('edit')"
                >
                  <template #icon>
                    <Pencil
                      class="size-[18px]"
                      :stroke-width="2.2"
                    />
                  </template>
                </Button>
              </Tooltip>
              <Tooltip
                v-if="!hideDetach"
                :title="t(detached ? 'midi.pianoRoll.dock' : 'midi.pianoRoll.detach')"
              >
                <Button
                  color="primary"
                  variant="link"
                  :loading="opening"
                  :aria-label="t(detached ? 'midi.pianoRoll.dock' : 'midi.pianoRoll.detach')"
                  @click="migrate"
                >
                  <template #icon>
                    <component
                      :is="detached ? ImportOutlined : ExportOutlined"
                      :style="{ fontSize: '20px' }"
                      class="piano-window-action-icon"
                    />
                  </template>
                </Button>
              </Tooltip>
              <PianoRollHelpDialog />
            </div>
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
        :editing="editing"
        @seek="seekPianoRoll"
        @seek-preview="previewPianoSeek"
        @viewport-change="persistEditorViewport"
        @edit-intent="forwardEditIntent"
        @close="closePianoEditor"
      />
    </section>
  </div>
</template>
<style scoped>
/* 保持打开/还原的箭头语义，沿原始路径轻微加粗，不改变图标尺寸和位置。 */
.piano-window-action-icon :deep(svg) { stroke: currentColor; stroke-width: 24; stroke-linejoin: round; }
.piano-filter-button.ant-btn { width: 20px; min-width: 20px; height: 20px; padding: 0; font-size: 14px; }
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

.piano-roll-trailing-actions {
  @apply ml-auto flex shrink-0 items-center;
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
