import type {
  PianoRollDocument,
  PianoRollNote,
  PianoRollTrack,
} from '@strawberrybear/piano-roll/core'

export type { PianoRollDocument, PianoRollNote, PianoRollTrack }

/** 列表页展示用的只读摘要；保存项目时由前端根据文档重新计算。 */
export interface MidiProjectMeta {
  /** 轨道数量（含空轨）。 */
  trackCount: number
  /** 音符总数。 */
  noteCount: number
  /** 完整时长，单位毫秒；按 tempo 图积分得到。 */
  durationMs: number
}

/** 循环试听区间，单位 tick；`endTick` 必须大于 `startTick`。 */
export interface MidiProjectLoop {
  startTick: number
  endTick: number
}

/** 编辑器项目文件的持久化形态；`document` 与钢琴卷帘文档完全一致，可无损往返。 */
export interface MidiProject {
  /** 文件格式版本；升级时用于迁移。 */
  schemaVersion: 1
  /** 文件名安全的唯一标识。 */
  id: string
  /** 用户可见名称，同时作为导出 .mid 的默认文件名。 */
  name: string
  /** 创建时间（毫秒时间戳）。 */
  createdAt: number
  /** 最近保存时间（毫秒时间戳）。 */
  updatedAt: number
  /** 若由曲库文件创建，记录来源文件名。 */
  source?: { filename?: string }
  /** 列表摘要。 */
  meta: MidiProjectMeta
  /** 可选循环区间。 */
  loop?: MidiProjectLoop | null
  /** 完整音符/轨道/速度/拍号文档。 */
  document: PianoRollDocument
}

/** 吸附网格分辨率；`bar` 随当前拍号变化，`off` 表示不吸附。 */
export type SnapResolution =
  | 'off'
  | 'bar'
  | '1/1'
  | '1/2'
  | '1/4'
  | '1/8'
  | '1/16'
  | '1/32'
  | '1/4t'
  | '1/8t'
  | '1/16t'

/** 支持的吸附分辨率，顺序即 UI 下拉顺序。 */
export const SNAP_RESOLUTIONS: readonly SnapResolution[] = [
  'bar',
  '1/1',
  '1/2',
  '1/4',
  '1/8',
  '1/16',
  '1/32',
  '1/4t',
  '1/8t',
  '1/16t',
  'off',
]

/** 编辑器指针工具。 */
export type EditorTool = 'select' | 'draw'

/** 吸附方向：nearest 用于移动/量化，floor 用于点击落点。 */
export type SnapMode = 'nearest' | 'floor'

/** 音符拉伸的边。 */
export type NoteResizeEdge = 'start' | 'end'

/** 力度变更条目。 */
export interface VelocityChange {
  noteId: string
  velocity: number
}

/** 轨道可编辑的元数据字段。 */
export type TrackPatch = Partial<
  Pick<PianoRollTrack, 'name' | 'color' | 'channel' | 'isPercussion' | 'enabled'>
>

/** 剪贴板内容；音符时间相对最早起点、音高保持绝对值。 */
export interface ClipboardPayload {
  /** 相对起点（tick）的音符列表，`trackId` 为复制时所属轨道。 */
  notes: readonly (Omit<PianoRollNote, 'id'> & { trackId: string })[]
  /** 最低音高，供相对粘贴时对齐。 */
  minPitch: number
  /** 复制时的 PPQ；粘贴到不同 PPQ 文档时按比例换算。 */
  ticksPerBeat: number
}

/**
 * 编辑会话接受的全部动作。前八种与钢琴卷帘的 `PianoRollEditIntent` 结构一致，
 * 宿主可直接透传；其余为工具栏、快捷键和菜单触发的编辑器级动作。
 */
export type EditorAction =
  | { type: 'select'; noteIds: readonly string[]; mode: 'replace' | 'toggle' | 'add' }
  | {
      type: 'add-note'
      trackId: string
      pitch: number
      startTick: number
      durationTicks: number
      velocity?: number
    }
  | { type: 'move'; noteIds: readonly string[]; deltaTick: number; deltaPitch: number }
  | { type: 'resize'; noteIds: readonly string[]; edge: NoteResizeEdge; deltaTick: number }
  | { type: 'set-velocity'; changes: readonly VelocityChange[]; coalesceKey?: string }
  | { type: 'delete'; noteIds: readonly string[] }
  | { type: 'loop-change'; loop: MidiProjectLoop | null }
  | { type: 'select-all'; trackId?: string }
  | { type: 'clear-selection' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste'; atTick?: number; trackId?: string }
  | { type: 'duplicate' }
  | { type: 'nudge'; deltaTick: number; deltaPitch: number }
  | { type: 'quantize'; resolution?: SnapResolution; start?: boolean; length?: boolean }
  | { type: 'transpose'; semitones: number }
  | { type: 'set-selected-velocity'; velocity: number }
  | { type: 'add-track'; name?: string; color?: string; isPercussion?: boolean }
  | { type: 'remove-track'; trackId: string }
  | { type: 'update-track'; trackId: string; patch: TrackPatch }
  | { type: 'duplicate-track'; trackId: string }
  | { type: 'reorder-track'; trackId: string; toIndex: number }
  | { type: 'set-tempo'; bpm: number }
  | { type: 'set-time-signature'; numerator: number; denominator: number }
  | { type: 'set-snap'; resolution: SnapResolution }
  | { type: 'set-tool'; tool: EditorTool }
  | { type: 'rename'; name: string }

/** 会话对外的不可变快照。 */
export interface EditorSessionState {
  /** 当前项目（文档、名称、循环区间均已同步）。 */
  project: MidiProject
  /** 当前文档；与 `project.document` 同一引用，方便直接传给视图。 */
  document: PianoRollDocument
  /** 选中音符 ID。 */
  selection: ReadonlySet<string>
  /** 当前工具。 */
  tool: EditorTool
  /** 当前吸附分辨率。 */
  snap: SnapResolution
  /** 是否可撤销/重做。 */
  canUndo: boolean
  canRedo: boolean
  /** 自上次 `markSaved` 以来是否有改动。 */
  dirty: boolean
  /** 剪贴板是否有内容。 */
  clipboardAvailable: boolean
  /** 最近一次编辑产生的新音符 ID（如粘贴、新增），供视图聚焦。 */
  lastCreatedNoteIds: readonly string[]
}
