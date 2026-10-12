/** 独立录制组件的输入、结果及平台端口，均不依赖 Store 或 DOM。 */
import type {
  EditorSessionState,
  MidiProject,
  PianoRollNote,
  PianoRollDocument,
} from '@strawberrybear/midi-editor'
import type { KeyTemplate } from '@/types'

export interface TrackRecorderInput {
  project: MidiProject
  trackId: string
  startTick: number
  range?: { startTick: number; endTick: number }
  templates: readonly KeyTemplate[]
  templateId: string | null
  baseRevision: string
  baseContentRevision?: string
  /** 主编辑器的稳定草稿入口；不依赖新建项目的随机 ID。 */
  draftScope?: string
  fps?: number
  speed?: number
}
export interface TrackRecorderResult {
  projectId: string
  trackId: string
  baseRevision: string
  notes: PianoRollNote[]
  endTick: number
  template: KeyTemplate
  cursorTick: number
}
export interface RecorderAudio {
  prepare(): Promise<void>
  now(): number
  note(pitch: number, velocity: number): { stop(): void } | null
  startAccompaniment(
    document: PianoRollDocument,
    atTick: number,
    mutedRange?: { startTick: number; endTick: number },
    anchorClock?: number
  ): void
  stopAccompaniment(): void
  click?(accent: boolean, when: number): void
}
export interface TrackRecorderServices {
  audio: RecorderAudio
  loadDraft(key: string): Promise<MidiProject | null>
  saveDraft(key: string, project: MidiProject): Promise<void>
  deleteDraft(key: string): Promise<void>
  apply(result: TrackRecorderResult): Promise<void>
  recoverCopy(project: MidiProject): Promise<void>
}
export type RecorderStatus =
  | 'idle'
  | 'preparing'
  | 'armed'
  | 'counting'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'disposed'
export type RecorderMode = 'append' | 'overdub' | 'replace'
export type RecorderEditorState = EditorSessionState
