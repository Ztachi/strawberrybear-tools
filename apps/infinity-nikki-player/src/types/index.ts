/** MIDI 音符事件 */
export interface NoteEvent {
  pitch: number
  velocity: number
  start_tick: number
  end_tick: number
  channel: number
}

/** MIDI 文件基本信息 */
export interface MidiInfo {
  filename: string
  duration_ms: number
  track_count: number
  ticks_per_beat: number
  events: NoteEvent[]
}

/** 提取后的旋律事件 */
export interface MelodyEvent {
  pitch: number
  pitch_name: string
  velocity: number
  start_ms: number
  duration_ms: number
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
