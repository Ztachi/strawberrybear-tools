import type { PreviewControlCommand, PreviewControlState } from '@/features/player/previewControls'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type {
  PianoRollLabels,
  PianoRollTransport,
  PianoRollViewport,
} from '@strawberrybear/piano-roll/browser'

/** 独立窗口只消费视图数据；协议中不包含音频实例、队列或游戏按键命令。 */
export interface EditorPresentation {
  filename: string
  title: string
  document: PianoRollDocument
  labels: PianoRollLabels
  locale: string
  error: string
  /** 切歌的中间态不能被当作已加载的空曲目，也不能接受旧画面的操作。 */
  loading: boolean
}

/** 整个音轨工作区的迁移快照；两个视图的缩放和滚动仍各自独立。 */
export interface PianoWorkspaceState {
  selectedTrackId: string | null
  editorOpen: boolean
  hideEmptyTracks: boolean
  editorHeight: number
  overview?: PianoRollViewport
  editor?: PianoRollViewport
}

export type EditorCommand =
  | { kind: 'ready' | 'shown' | 'dock' | 'ping' }
  | { kind: 'seek'; seconds: number }
  | { kind: 'preview'; seconds: number | null }
  | { kind: 'viewport'; viewport: PianoWorkspaceState }
  | { kind: 'toggle-track'; trackId: string }
  | { kind: 'playback'; mediaId: string | null; command: PreviewControlCommand }

/** 每次打开一个 session，每次切换数据一个 revision；旧窗口与旧曲目的回包均失效。 */
export type EditorRequest = EditorCommand & { session: string; revision: number; sequence: number }
export type EditorUpdate = {
  session: string
  revision: number
  sequence: number
} & (
  | {
      kind: 'state'
      state: Omit<EditorPresentation, 'document'> & { document?: PianoRollDocument }
      viewport?: PianoWorkspaceState
    }
  | { kind: 'transport'; transport: PianoRollTransport; sampledAt: number }
  | { kind: 'playback'; playback: PreviewControlState }
)

export interface EditorWindowHandle {
  destroy(): Promise<void>
  focus(): Promise<void>
  onDestroyed(callback: () => void): Promise<() => void>
}

/** Tauri 是应用平台端口，状态同步与测试不直接依赖系统窗口。 */
export interface EditorWindowPort {
  open(session: string): Promise<EditorWindowHandle>
  listen(callback: (request: EditorRequest) => void): Promise<() => void>
  send(update: EditorUpdate): Promise<void>
}

/** 子窗口平台端口；便于使用真实浏览器独立页面验证完整 UI，测试不运行游戏输入。 */
export interface EditorClientPort {
  listen(callback: (update: EditorUpdate) => void): Promise<() => void>
  send(request: EditorRequest): Promise<void>
  setTitle(title: string): Promise<void>
  show(): Promise<void>
  destroy(): Promise<void>
  onCloseRequested(callback: () => void): Promise<() => void>
}

export const EDITOR_WINDOW_PORT = 'piano-editor-window-port'
export const EDITOR_CLIENT_PORT = 'piano-editor-client-port'

/** 校验来自视图的数字，不能让损坏的 IPC 值污染主窗口状态。 */
export function validViewport(value: PianoRollViewport): boolean {
  return (
    !!value &&
    [value.scrollLeft, value.scrollTop, value.timeZoom, value.pitchZoom].every(Number.isFinite) &&
    value.scrollLeft >= 0 &&
    value.scrollTop >= 0 &&
    value.timeZoom > 0 &&
    value.pitchZoom >= 8 &&
    value.pitchZoom <= 36 &&
    typeof value.follow === 'boolean'
  )
}

/** 校验窗口迁移状态；每个视口和尺寸都有独立边界，非法消息不能污染下一次还原。 */
export function validWorkspace(value: PianoWorkspaceState): boolean {
  return (
    !!value &&
    (value.selectedTrackId === null || typeof value.selectedTrackId === 'string') &&
    typeof value.editorOpen === 'boolean' &&
    typeof value.hideEmptyTracks === 'boolean' &&
    Number.isFinite(value.editorHeight) &&
    value.editorHeight >= 25 &&
    value.editorHeight <= 82 &&
    (value.overview === undefined || validViewport(value.overview)) &&
    (value.editor === undefined || validViewport(value.editor))
  )
}
