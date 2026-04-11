/** MIDI 音符事件 */
export interface NoteEvent {
  pitch: number
  velocity: number
  start_tick: number
  end_tick: number
  channel: number
  track: number // 音轨索引
}

/** 音轨信息 */
export interface TrackInfo {
  index: number // 显示用的递增索引 (0, 1, 2...)
  eventTrackValue: number // MIDI 事件中的原始 track 值，用于禁用匹配
  channel: number // MIDI 通道 (0-15)
  name: string // 音轨名称（如果有）
  noteCount: number // 音符数量
  isPercussion: boolean // 是否是打击乐通道
  enabled: boolean // 是否启用（可屏蔽）
}

/** MIDI 文件基本信息 */
export interface MidiInfo {
  filename: string
  file_path: string
  duration_ms: number
  track_count: number
  melody_note_count: number
  ticks_per_beat: number
  tempo: number // 微秒每拍
  events: NoteEvent[]
}

/** 提取后的旋律事件 */
export interface MelodyEvent {
  pitch: number
  pitch_name: string
  velocity: number
  start_ms: number
  duration_ms: number
  track: number // 音轨索引
}

/** 按键日志条目 */
export interface KeyLogEntry {
  id: number
  timestamp: number
  pitch: number
  pitch_name: string
  mapped_key: string
  velocity: number
  action: 'press' | 'release'
}

/** 播放状态 */
export type PlaybackStatus = 'idle' | 'playing' | 'paused'

/** 播放状态 */
export interface PlaybackState {
  status: PlaybackStatus
  midi_name: string | null
  current_tick: number
  speed: number
}

/** 映射模板 */
export interface KeyTemplate {
  id: string
  name: string
  is_builtin: boolean
  mappings: KeyMapping[]
}

/** 键位映射 */
export interface KeyMapping {
  pitch: number
  key: string
}
