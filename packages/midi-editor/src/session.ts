import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import { copyNotes, pasteNotes } from './clipboard'
import {
  addNote,
  deleteNotes,
  moveNotes,
  resizeNotes,
  setNoteVelocity,
} from './commands/notes'
import { quantizeNotes, transposeNotes } from './commands/quantize'
import {
  createEmptyDocument,
  documentDurationMs,
  ensureDurationCovers,
  setTempo,
  setTimeSignature,
} from './commands/song'
import {
  addTrack,
  duplicateTrack,
  removeTrack,
  reorderTrack,
  updateTrack,
} from './commands/tracks'
import { createHistory } from './history'
import { createProjectId } from './ids'
import type {
  ClipboardPayload,
  EditorAction,
  EditorSessionState,
  EditorTool,
  MidiProject,
  MidiProjectLoop,
  MidiProjectMeta,
  SnapMode,
  SnapResolution,
} from './model'
import { pruneSelection } from './selection'
import { resolutionTicks, snapTick } from './snap'

/** 会话选项；文案类回调允许宿主注入本地化。 */
export interface EditorSessionOptions {
  historyLimit?: number
  /** 新轨默认名称，参数为轨序号（从 1 开始）。 */
  trackDefaultName?: (index: number) => string
  /** 复制轨命名。 */
  trackCopyName?: (name: string) => string
  /** 初始工具与吸附。 */
  tool?: EditorTool
  snap?: SnapResolution
}

/** 编辑会话：持有文档、历史、选择、剪贴板与工具状态，所有变更经 `dispatch`。 */
export interface EditorSession {
  getState(): EditorSessionState
  dispatch(action: EditorAction): void
  subscribe(listener: (state: EditorSessionState) => void): () => void
  /** 用当前吸附分辨率吸附 tick。 */
  snapTick(tick: number, mode?: SnapMode): number
  /** 当前吸附步长（tick）；`off` 时返回 0。 */
  snapStep(atTick?: number): number
  /** 当前文档的项目形态（含重新计算的摘要与 updatedAt）。 */
  toProject(): MidiProject
  /** 保存成功后调用；清除 dirty 并可写回后端返回的 id/时间戳。 */
  markSaved(patch?: Partial<Pick<MidiProject, 'id' | 'createdAt' | 'updatedAt'>>): void
  /** 载入另一份项目，重置历史与选择。 */
  replaceProject(project: MidiProject): void
}

/**
 * @description: 计算列表摘要。
 * @param {PianoRollDocument} document 文档
 * @return {MidiProjectMeta} 轨数、音符数与时长
 */
export function computeProjectMeta(document: PianoRollDocument): MidiProjectMeta {
  return {
    trackCount: document.tracks.length,
    noteCount: document.notes.length,
    durationMs: documentDurationMs(document),
  }
}

/**
 * @description: 创建新项目（空文档或给定文档）。
 * @param {Partial<Pick<MidiProject, 'name' | 'document' | 'source'>>} input 可选初值
 * @return {MidiProject} 项目
 */
export function createProject(
  input: Partial<Pick<MidiProject, 'name' | 'document' | 'source'>> = {}
): MidiProject {
  const document = input.document ?? createEmptyDocument()
  const stamp = Date.now()
  return {
    schemaVersion: 1,
    id: createProjectId(),
    name: input.name?.trim() || 'Untitled',
    createdAt: stamp,
    updatedAt: stamp,
    ...(input.source ? { source: input.source } : {}),
    meta: computeProjectMeta(document),
    loop: null,
    document,
  }
}

/**
 * @description: 创建编辑会话。
 * @param {MidiProject} project 初始项目
 * @param {EditorSessionOptions} options 会话选项
 * @return {EditorSession} 会话
 */
export function createEditorSession(
  project: MidiProject,
  options: EditorSessionOptions = {}
): EditorSession {
  let base: MidiProject = project
  let history = createHistory(project.document, options.historyLimit ?? 200)
  let name = project.name
  let loop: MidiProjectLoop | null = project.loop ?? null
  let selection: ReadonlySet<string> = new Set()
  let clipboard: ClipboardPayload | null = null
  let tool: EditorTool = options.tool ?? 'select'
  let snap: SnapResolution = options.snap ?? '1/16'
  let lastCreated: readonly string[] = []
  let savedDocument = project.document
  let savedName = project.name
  let savedLoop = loop
  const listeners = new Set<(state: EditorSessionState) => void>()

  const document = (): PianoRollDocument => history.present

  function isDirty(): boolean {
    return (
      document() !== savedDocument ||
      name !== savedName ||
      (loop?.startTick ?? -1) !== (savedLoop?.startTick ?? -1) ||
      (loop?.endTick ?? -1) !== (savedLoop?.endTick ?? -1)
    )
  }

  function snapshot(): EditorSessionState {
    const current = document()
    return {
      project: { ...base, name, loop, document: current },
      document: current,
      selection,
      tool,
      snap,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      dirty: isDirty(),
      clipboardAvailable: clipboard !== null,
      lastCreatedNoteIds: lastCreated,
    }
  }
  function emit(): void {
    const state = snapshot()
    for (const listener of listeners) listener(state)
  }

  /** 提交文档变更；无变化时不产生历史。 */
  function commit(next: PianoRollDocument, label: string, coalesceKey?: string): boolean {
    if (next === document()) return false
    const covered = ensureDurationCovers(next)
    history.commit(covered, label, coalesceKey)
    selection = pruneSelection(selection, covered)
    return true
  }

  function selectedIds(): string[] {
    return Array.from(selection)
  }

  function selectionBounds(): { start: number; end: number } | null {
    let start = Number.POSITIVE_INFINITY
    let end = 0
    for (const note of document().notes) {
      if (!selection.has(note.id)) continue
      start = Math.min(start, note.startTick)
      end = Math.max(end, note.endTick)
    }
    return Number.isFinite(start) ? { start, end } : null
  }

  function paste(atTick: number, trackId?: string): void {
    if (!clipboard) return
    const result = pasteNotes(document(), clipboard, { atTick, trackId })
    if (result.noteIds.length === 0) return
    commit(result.document, 'paste')
    selection = new Set(result.noteIds)
    lastCreated = result.noteIds
  }

  function apply(action: EditorAction): void {
    lastCreated = []
    switch (action.type) {
      case 'select': {
        if (action.mode === 'replace') selection = new Set(action.noteIds)
        else {
          const next = new Set(selection)
          for (const id of action.noteIds) {
            if (action.mode === 'toggle' && next.has(id)) next.delete(id)
            else next.add(id)
          }
          selection = next
        }
        history.breakCoalescing()
        return
      }
      case 'select-all':
        selection = new Set(
          document()
            .notes.filter((note) => !action.trackId || note.trackId === action.trackId)
            .map((note) => note.id)
        )
        return
      case 'clear-selection':
        selection = new Set()
        return
      case 'add-note': {
        const result = addNote(document(), {
          trackId: action.trackId,
          pitch: action.pitch,
          startTick: action.startTick,
          endTick: action.startTick + Math.max(1, action.durationTicks),
          velocity: action.velocity,
        })
        commit(result.document, 'add-note')
        selection = new Set([result.note.id])
        lastCreated = [result.note.id]
        return
      }
      case 'move':
        commit(moveNotes(document(), action.noteIds, action.deltaTick, action.deltaPitch), 'move')
        return
      case 'resize':
        commit(resizeNotes(document(), action.noteIds, action.edge, action.deltaTick), 'resize')
        return
      case 'set-velocity':
        commit(setNoteVelocity(document(), action.changes), 'velocity', action.coalesceKey)
        return
      case 'delete':
        commit(deleteNotes(document(), action.noteIds), 'delete')
        return
      case 'loop-change':
        loop = action.loop && action.loop.endTick > action.loop.startTick ? { ...action.loop } : null
        return
      case 'undo': {
        const previous = history.undo()
        if (previous) selection = pruneSelection(selection, previous)
        return
      }
      case 'redo': {
        const next = history.redo()
        if (next) selection = pruneSelection(selection, next)
        return
      }
      case 'copy':
        clipboard = copyNotes(document(), selection) ?? clipboard
        return
      case 'cut': {
        const payload = copyNotes(document(), selection)
        if (!payload) return
        clipboard = payload
        commit(deleteNotes(document(), selection), 'cut')
        return
      }
      case 'paste':
        paste(action.atTick ?? selectionBounds()?.start ?? 0, action.trackId)
        return
      case 'duplicate': {
        const bounds = selectionBounds()
        const payload = copyNotes(document(), selection)
        if (!bounds || !payload) return
        // 复制到紧随选区之后的网格位置，网格关闭时紧贴选区尾部。
        const step = resolutionTicks(snap, document(), bounds.start)
        const length = bounds.end - bounds.start
        const offset = step > 0 ? Math.max(step, Math.ceil(length / step) * step) : length
        const previous = clipboard
        clipboard = payload
        paste(bounds.start + offset)
        clipboard = previous
        return
      }
      case 'nudge':
        commit(moveNotes(document(), selection, action.deltaTick, action.deltaPitch), 'nudge')
        return
      case 'quantize':
        commit(
          quantizeNotes(document(), selection, action.resolution ?? snap, {
            start: action.start ?? true,
            length: action.length ?? false,
          }),
          'quantize'
        )
        return
      case 'transpose':
        commit(transposeNotes(document(), selection, action.semitones), 'transpose')
        return
      case 'set-selected-velocity':
        commit(
          setNoteVelocity(
            document(),
            selectedIds().map((noteId) => ({ noteId, velocity: action.velocity }))
          ),
          'velocity'
        )
        return
      case 'add-track':
        commit(
          addTrack(document(), {
            name: action.name,
            color: action.color,
            isPercussion: action.isPercussion,
            defaultName: options.trackDefaultName,
          }).document,
          'add-track'
        )
        return
      case 'remove-track':
        commit(removeTrack(document(), action.trackId), 'remove-track')
        return
      case 'update-track':
        commit(updateTrack(document(), action.trackId, action.patch), 'update-track')
        return
      case 'duplicate-track':
        commit(
          duplicateTrack(document(), action.trackId, options.trackCopyName).document,
          'duplicate-track'
        )
        return
      case 'reorder-track':
        commit(reorderTrack(document(), action.trackId, action.toIndex), 'reorder-track')
        return
      case 'set-tempo':
        commit(setTempo(document(), action.bpm), 'tempo')
        return
      case 'set-time-signature':
        commit(setTimeSignature(document(), action.numerator, action.denominator), 'meter')
        return
      case 'set-snap':
        snap = action.resolution
        return
      case 'set-tool':
        tool = action.tool
        return
      case 'rename':
        if (action.name.trim()) name = action.name.trim()
        return
      default:
        return
    }
  }

  return {
    getState: snapshot,
    dispatch(action) {
      apply(action)
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapTick: (tick, mode) => snapTick(tick, snap, document(), mode),
    snapStep: (atTick = 0) => resolutionTicks(snap, document(), atTick),
    toProject() {
      const current = document()
      return {
        ...base,
        name,
        loop,
        document: current,
        meta: computeProjectMeta(current),
        updatedAt: Date.now(),
      }
    },
    markSaved(patch) {
      base = { ...base, ...patch, name, loop, meta: computeProjectMeta(document()) }
      savedDocument = document()
      savedName = name
      savedLoop = loop
      emit()
    },
    replaceProject(next) {
      base = next
      history = createHistory(next.document, options.historyLimit ?? 200)
      name = next.name
      loop = next.loop ?? null
      selection = new Set()
      lastCreated = []
      savedDocument = next.document
      savedName = next.name
      savedLoop = loop
      emit()
    },
  }
}
