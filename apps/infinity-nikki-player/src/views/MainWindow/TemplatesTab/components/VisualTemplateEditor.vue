<script setup lang="ts">
/**
 * @description: VisualTemplateEditor - Canvas 钢琴模板编辑器
 * @description 将 Canvas 绘制和按键编辑委托给 TemplatePianoEditor，组件只负责界面状态、提示和 v-model 同步。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { feedback as toast } from '@/lib/feedback'
import { QuestionCircleFilled } from '@antdv-next/icons'
import { Eraser, Maximize2, Minimize2, Redo2, Undo2 } from 'lucide-vue-next'
import { Button, Modal, Tooltip } from 'antdv-next'
import KeyboardPreview from '@/components/KeyboardPreview/index.vue'
import { playNote, stopNote } from '@/lib/midiPlayer'
import { TemplatePianoEditor, type TemplatePianoEditorState } from '@/lib/templatePianoEditor'
import type { KeyMapping } from '@/types'
import { normalizeTemplateMappings, pitchToNoteName, SUPPORTED_MAPPING_KEYS } from '@/lib/templateKeys'

/**
 * @description: 组件属性
 * @param {KeyMapping[]} mappings - 当前模板映射列表
 */
const props = defineProps<{
  mappings: KeyMapping[]
}>()

/**
 * @description: 组件事件
 * @param {KeyMapping[]} update:mappings - 映射列表变更事件
 */
const emit = defineEmits<{
  'update:mappings': [mappings: KeyMapping[]]
}>()

const { t } = useI18n()
/** Canvas 编辑器横向滚动容器引用，TemplatePianoEditor 会在其中创建 canvas。 */
const pianoContainerRef = ref<HTMLDivElement | null>(null)
/** 帮助文档弹窗是否打开。 */
const isHelpDialogOpen = ref(false)
/** TemplatePianoEditor 实例，组件卸载时必须销毁事件监听和 Canvas。 */
let pianoEditor: TemplatePianoEditor | null = null
/** 最近一次由 TemplatePianoEditor 主动 emit 的映射签名，用于区分内部同步和外部换模板。 */
let lastEditorEmittedMappingsSignature = ''

/** 编辑器状态默认值，保证 Canvas 初始化前界面仍可稳定渲染。 */
const editorState = ref<TemplatePianoEditorState>({
  mode: 'edit',
  selectedPitch: 60,
  selectedMapping: null,
  isMappingMode: false,
  canUndo: false,
  canRedo: false,
  previewActiveKeys: new Set<string>(),
  keyboardKeyCodeToPitch: new Map<string, number>(),
})

/** 当前选中音高的音名。 */
const selectedNoteName = computed(() => pitchToNoteName(editorState.value.selectedPitch))
/** 当前模板映射数量文案。 */
const mappingSummary = computed(() => t('template.mappingCount', { count: props.mappings.length }))
/** 帮助弹层展示的支持按键列表。 */
const supportedKeySummary = computed(() => SUPPORTED_MAPPING_KEYS.join(', '))

const helpSections = computed(() => [
  {
    title: t('template.helpBasicTitle'),
    items: [
      t('template.helpSelectPianoKey'),
      t('template.helpPreviewMode'),
      t('template.helpKeyboardPreview'),
    ],
  },
  {
    title: t('template.helpMappingTitle'),
    items: [
      t('template.helpEnableMapping'),
      t('template.helpWriteMapping'),
      t('template.helpClearMapping'),
      t('template.helpMappingConflict'),
    ],
  },
  {
    title: t('template.helpHistoryTitle'),
    items: [
      t('template.helpUndoRedoButtons'),
      t('template.helpUndoRedoShortcuts'),
      t('template.helpHistoryScope'),
    ],
  },
  {
    title: t('template.helpAttentionTitle'),
    items: [
      t('template.helpSaveReminder'),
      t('template.helpUnsupportedKeys'),
      t('template.helpSystemKeySilent'),
    ],
  },
])

/**
 * @description: 生成映射内容签名
 * @description Vue 父子同步可能不会保留数组引用，因此用规范化内容判断是否是编辑器自己的回传。
 * @param {KeyMapping[]} mappings - 待生成签名的映射列表
 * @return {string} 稳定映射签名
 */
function createMappingsSignature(mappings: KeyMapping[]): string {
  // 归一化会排序、去重和清理非法项，避免同一映射内容因顺序或旧数据差异导致误判。
  return JSON.stringify(normalizeTemplateMappings(mappings))
}

/**
 * @description: 接收编辑器状态并替换响应式快照
 * @param {TemplatePianoEditorState} state - 编辑器最新状态
 * @return {void}
 */
function handleEditorStateChange(state: TemplatePianoEditorState): void {
  // Set/Map 使用新实例，避免外部组件拿到编辑器内部集合后被后续原地修改影响。
  editorState.value = {
    ...state,
    previewActiveKeys: new Set(state.previewActiveKeys),
    keyboardKeyCodeToPitch: new Map(state.keyboardKeyCodeToPitch),
  }
}

/**
 * @description: 接收编辑器映射变更并同步给父组件
 * @param {KeyMapping[]} mappings - 新映射列表
 * @return {void}
 */
function handleMappingsChange(mappings: KeyMapping[]): void {
  // 记录内容签名让 props watcher 识别这是本组件刚发出的变更，不重置撤销历史。
  lastEditorEmittedMappingsSignature = createMappingsSignature(mappings)
  emit('update:mappings', mappings)
}

/**
 * @description: 切换全局预览和编辑模式
 * @return {void}
 */
function toggleMode(): void {
  pianoEditor?.toggleMode()
}

/**
 * @description: 切换映射编辑状态
 * @return {void}
 */
function toggleMappingMode(): void {
  pianoEditor?.setMappingMode()
}

/**
 * @description: 清除当前选中琴键映射
 * @return {void}
 */
function clearSelectedMapping(): void {
  pianoEditor?.clearSelectedMapping()
}

/**
 * @description: 撤销最近一次映射变更
 * @return {void}
 */
function undoMapping(): void {
  pianoEditor?.undo()
}

/**
 * @description: 恢复最近一次撤销的映射变更
 * @return {void}
 */
function redoMapping(): void {
  pianoEditor?.redo()
}

/**
 * @description: 处理虚拟键盘点击
 * @param {string} code - 虚拟键盘按键 code
 * @return {void}
 */
function handleKeyboardKeyClick(code: string): void {
  pianoEditor?.handleKeyboardKeyClick(code)
}

watch(
  () => props.mappings,
  (nextMappings) => {
    if (!pianoEditor) return
    // 父组件接收内部 emit 后会把映射作为 props 传回，此时不能清空撤销栈。
    const nextSignature = createMappingsSignature(nextMappings)
    const isEditorEcho =
      !!lastEditorEmittedMappingsSignature && nextSignature === lastEditorEmittedMappingsSignature
    pianoEditor.setMappings(nextMappings, { resetHistory: !isEditorEcho })
    if (isEditorEcho) lastEditorEmittedMappingsSignature = ''
  },
  { deep: true }
)

onMounted(() => {
  if (!pianoContainerRef.value) return
  pianoEditor = new TemplatePianoEditor({
    container: pianoContainerRef.value,
    mappings: props.mappings,
    playNote,
    stopNote,
    onMappingsChange: handleMappingsChange,
    onStateChange: handleEditorStateChange,
    onUnsupportedKey: (key) => {
      toast.warning(t('template.unsupportedKey'), { description: key, richColors: true })
    },
  })
})

onUnmounted(() => {
  pianoEditor?.destroy()
  pianoEditor = null
})
</script>

<template>
  <div class="visual-template-editor">
    <div class="editor-status-row">
      <div class="editor-actions">
        <Tooltip
          :title="editorState.mode === 'edit' ? t('template.overviewMode') : t('template.exitOverview')"
        >
          <Button
            class="editor-icon-button"
            size="small"
            color="primary"
            variant="outlined"
            :aria-label="editorState.mode === 'edit' ? t('template.overviewMode') : t('template.exitOverview')"
            @click="toggleMode"
          >
            <template #icon>
              <Maximize2 v-if="editorState.mode === 'edit'" class="size-4" />
              <Minimize2 v-else class="size-4" />
            </template>
          </Button>
        </Tooltip>
        <Tooltip :title="t('template.clearMapping')">
          <Button
            class="editor-icon-button"
            size="small"
            color="primary"
            variant="outlined"
            :disabled="!editorState.isMappingMode || !editorState.selectedMapping"
            :aria-label="t('template.clearMapping')"
            @click="clearSelectedMapping"
          >
            <template #icon>
              <Eraser class="size-4" />
            </template>
          </Button>
        </Tooltip>
        <Tooltip :title="t('template.undoMapping')">
          <Button
            class="editor-icon-button"
            size="small"
            color="primary"
            variant="outlined"
            :disabled="!editorState.canUndo"
            :aria-label="t('template.undoMapping')"
            @click="undoMapping"
          >
            <template #icon>
              <Undo2 class="size-4" />
            </template>
          </Button>
        </Tooltip>
        <Tooltip :title="t('template.redoMapping')">
          <Button
            class="editor-icon-button"
            size="small"
            color="primary"
            variant="outlined"
            :disabled="!editorState.canRedo"
            :aria-label="t('template.redoMapping')"
            @click="redoMapping"
          >
            <template #icon>
              <Redo2 class="size-4" />
            </template>
          </Button>
        </Tooltip>
      </div>
      <div class="editor-status-main">
        <span class="selected-note">{{ selectedNoteName }}</span>
        <span class="selected-mapping">
          {{ editorState.selectedMapping?.key || t('template.unmapped') }}
        </span>
        <span class="mapping-summary">{{ mappingSummary }}</span>
      </div>
      <div class="editor-status-meta">
        <Button
          type="primary"
          class="mapping-mode-button"
          :class="{ active: editorState.isMappingMode }"
          @click="toggleMappingMode"
        >
          {{ editorState.isMappingMode ? t('template.exitMapping') : t('template.mapSelected') }}
        </Button>
      </div>
    </div>

    <button
      class="key-help-btn"
      :aria-label="t('template.editorHelp')"
      @click="isHelpDialogOpen = true"
    >
      <QuestionCircleFilled class="key-help-icon" />
    </button>

    <div
      ref="pianoContainerRef"
      class="piano-canvas-container min-h-0 shrink-0 rounded-lg border border-primary bg-white"
      :class="editorState.mode === 'overview' ? 'overflow-hidden' : 'overflow-x-auto overflow-y-hidden'"
    />

    <KeyboardPreview
      :active-keys="editorState.previewActiveKeys"
      :key-code-to-pitch="editorState.keyboardKeyCodeToPitch"
      class="template-keyboard-preview"
      @key-click="handleKeyboardKeyClick"
    />

    <Modal
      v-model:open="isHelpDialogOpen"
      :title="t('template.editorHelp')"
      :footer="null"
      width="640"
      class="template-help-modal"
      centered
    >
      <div class="template-help-dialog">
        <section v-for="section in helpSections" :key="section.title" class="template-help-section">
          <h3>{{ section.title }}</h3>
          <ul>
            <li v-for="item in section.items" :key="item">
              {{ item }}
            </li>
          </ul>
        </section>
        <section class="template-help-section">
          <h3>{{ t('template.supportedKeys') }}</h3>
          <p>{{ supportedKeySummary }}</p>
        </section>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.visual-template-editor {
  @apply relative flex flex-col gap-4 rounded-xl border border-primary/20 bg-white/70 p-4;
}

.editor-status-row {
  @apply grid min-w-0 shrink-0 items-center gap-3;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
}

.editor-status-main {
  @apply flex flex-wrap items-center justify-center gap-4 text-center;
}

.selected-note {
  @apply text-4xl font-semibold leading-none text-foreground;
}

.selected-mapping {
  @apply rounded-full bg-primary/15 px-4 py-1.5 text-base font-medium text-muted-foreground;
}

.mapping-summary {
  @apply rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary;
}

.editor-status-meta {
  @apply flex items-center justify-end;
}

.editor-icon-button {
  @apply flex h-7 w-7 items-center justify-center p-0;
}

.key-help-btn {
  @apply absolute flex h-7 w-7 items-center justify-center rounded-full transition-colors;
  top: -40px;
  right: 0;
  color: var(--color-primary);
  background: var(--bg-white-95);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--color-primary) 16%, transparent);
}

.key-help-btn:hover {
  background: var(--bg-primary-10);
}

.key-help-icon {
  font-size: 20px;
}

.editor-actions {
  @apply flex min-w-0 flex-wrap items-center justify-start gap-2;
}

.mapping-mode-button {
  min-width: 132px;
  height: 34px;
  padding-inline: 18px;
  border-radius: 999px;
  border-color: color-mix(in srgb, var(--color-primary) 76%, transparent);
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--color-primary) 28%, transparent);
}

.mapping-mode-button:hover,
.mapping-mode-button:focus-visible {
  border-color: color-mix(in srgb, var(--color-primary) 86%, black);
  background: color-mix(in srgb, var(--color-primary) 88%, black);
  color: var(--color-white);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--color-primary) 34%, transparent);
}

.mapping-mode-button.active {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-white);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--color-danger) 16%, transparent),
    0 10px 24px color-mix(in srgb, var(--color-danger) 34%, transparent);
}

.mapping-mode-button.active:hover,
.mapping-mode-button.active:focus-visible {
  border-color: color-mix(in srgb, var(--color-danger) 86%, black);
  background: color-mix(in srgb, var(--color-danger) 88%, black);
  color: var(--color-white);
}

.piano-canvas-container {
  touch-action: none;
}

:deep(.template-piano-editor-canvas) {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.template-keyboard-preview {
  @apply min-h-[196px] min-w-0 flex-1;
}

.template-help-dialog {
  @apply space-y-5 overflow-y-auto pr-2 text-sm leading-6 text-muted-foreground;
  max-height: min(58vh, 520px);
}

.template-help-section h3 {
  @apply mb-2 text-sm font-semibold text-foreground;
}

.template-help-section ul {
  @apply list-disc space-y-1 pl-5;
}

:deep(.template-help-modal .ant-modal-body) {
  padding-top: 12px;
}

@media (max-width: 960px) {
  .editor-status-row {
    grid-template-columns: 1fr;
  }

  .editor-actions,
  .editor-status-meta {
    @apply justify-center;
  }
}
</style>
