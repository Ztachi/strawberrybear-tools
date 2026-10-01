/** 音轨独立窗口的业务入口；系统窗口适配由平台层注入。 */
export { PianoEditorSession } from './session'
export { PianoPresentationClock, presentationNow } from './presentation-clock'
export { EDITOR_CLIENT_PORT, EDITOR_WINDOW_PORT } from './protocol'
export type {
  EditorClientPort,
  EditorCommand,
  EditorPresentation,
  EditorRequest,
  EditorUpdate,
  EditorWindowHandle,
  EditorWindowPort,
  PianoWorkspaceState,
} from './protocol'
