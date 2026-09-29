import type {
  EditorAction,
  EditorSessionState,
  MidiProject,
  SnapResolution,
} from '@strawberrybear/midi-editor'
import type { PianoRollLabels, PianoRollTransport } from '@strawberrybear/piano-roll/browser'
import type { PianoWorkspaceState } from '@/features/piano-editor'

/** 可安全通过 Tauri JSON 事件发送的编辑器快照。 */
export interface MidiProjectEditorState extends Omit<
  EditorSessionState,
  'project' | 'document' | 'selection' | 'snap'
> {
  project: MidiProject
  selection: string[]
  snap: SnapResolution
}

/** 独立窗口渲染一次完整编辑界面所需的数据。 */
export interface MidiProjectEditorPresentation {
  state: MidiProjectEditorState
  labels: PianoRollLabels
  locale: string
  transport: PianoRollTransport
  showVelocity: boolean
  dimUnplayable: boolean
  playablePitches: number[]
  currentTemplateId: string | null
  templates: { id: string; name: string }[]
  saving: boolean
  hasChanges: boolean
}

export type MidiProjectEditorCommand =
  | { kind: 'ready' | 'shown' | 'ping' | 'dock' }
  | { kind: 'prepare-playback' }
  | { kind: 'dispatch'; action: EditorAction }
  | { kind: 'playback-position'; seconds: number }
  | { kind: 'viewport'; viewport: PianoWorkspaceState }
  | { kind: 'view-option'; option: 'showVelocity' | 'dimUnplayable'; value: boolean }
  | { kind: 'select-template'; templateId: string }
  | { kind: 'save' | 'export' }
  | { kind: 'exit'; mode: 'save' | 'discard' }

export type MidiProjectEditorRequest = MidiProjectEditorCommand & {
  session: string
  sequence: number
}

export type MidiProjectEditorUpdate =
  | {
      kind: 'state'
      session: string
      sequence: number
      presentation: MidiProjectEditorPresentation
      viewport?: PianoWorkspaceState
    }
  | {
      kind: 'dock'
      session: string
      sequence: number
    }
  | {
      kind: 'pong'
      session: string
      sequence: number
    }
  | {
      kind: 'notice'
      session: string
      sequence: number
      level: 'success' | 'error' | 'warning'
      title: string
      description?: string
    }

export interface MidiProjectEditorWindowHandle {
  destroy(): Promise<void>
  focus(): Promise<void>
  onDestroyed(callback: () => void): Promise<() => void>
}

export interface MidiProjectEditorWindowPort {
  open(session: string): Promise<MidiProjectEditorWindowHandle>
  listen(callback: (request: MidiProjectEditorRequest) => void): Promise<() => void>
  send(update: MidiProjectEditorUpdate): Promise<void>
}

export interface MidiProjectEditorClientPort {
  listen(callback: (update: MidiProjectEditorUpdate) => void): Promise<() => void>
  send(request: MidiProjectEditorRequest): Promise<void>
  setTitle(title: string): Promise<void>
  show(): Promise<void>
  destroy(): Promise<void>
  onCloseRequested(callback: () => void): Promise<() => void>
}

export const MIDI_PROJECT_EDITOR_WINDOW_PORT = 'midi-project-editor-window-port'
export const MIDI_PROJECT_EDITOR_CLIENT_PORT = 'midi-project-editor-client-port'

/**
 * @description: 把编辑会话快照转换为可跨窗口发送的普通数据
 * @param {EditorSessionState} state 编辑会话快照
 * @return {MidiProjectEditorState} JSON 安全的编辑器状态
 */
export function serializeMidiProjectEditorState(state: EditorSessionState): MidiProjectEditorState {
  return {
    project: state.project,
    selection: Array.from(state.selection),
    tool: state.tool,
    snap: state.snap,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    dirty: state.dirty,
    clipboardAvailable: state.clipboardAvailable,
    lastCreatedNoteIds: state.lastCreatedNoteIds,
  }
}

/**
 * @description: 在独立窗口中恢复组件需要的编辑会话形态
 * @param {MidiProjectEditorState} state 跨窗口状态
 * @return {EditorSessionState} 组件可直接消费的状态
 */
export function deserializeMidiProjectEditorState(
  state: MidiProjectEditorState
): EditorSessionState {
  return {
    ...state,
    document: state.project.document,
    selection: new Set(state.selection),
  }
}
