/**
 * @fileOverview 前端类型定义模块
 * @description 定义与 Rust 后端共享的数据结构
 */

/** MIDI 音符事件 */
export interface NoteEvent {
  /** 音高 (0-127) */
  pitch: number
  /** 力度 (0-127) */
  velocity: number
  /** 起始 tick */
  start_tick: number
  /** 结束 tick */
  end_tick: number
  /** MIDI 通道 (0-15) */
  channel: number
  /** 音轨索引 */
  track: number
}

/**
 * @description: 音轨信息
 */
export interface TrackInfo {
  /** 显示用的递增索引 (0, 1, 2...) */
  index: number
  /** MIDI 事件中的原始 track 值，用于禁用匹配 */
  eventTrackValue: number
  /** MIDI 通道 (0-15) */
  channel: number
  /** 音轨名称（如果有） */
  name: string
  /** 该音轨的音符数量 */
  noteCount: number
  /** 是否为打击乐通道（channel 9） */
  isPercussion: boolean
  /** 是否启用（可屏蔽） */
  enabled: boolean
}

/**
 * @description: MIDI 文件基本信息
 */
export interface MidiInfo {
  /** 文件名 */
  filename: string
  /** 文件完整路径 */
  file_path: string
  /** 时长（毫秒） */
  duration_ms: number
  /** 音轨数量 */
  track_count: number
  /** 旋律音符数 */
  melody_note_count: number
  /** 每拍的 tick 数 */
  ticks_per_beat: number
  /** 速度（微秒每拍） */
  tempo: number
  /** 音符事件列表 */
  events: NoteEvent[]
}

/**
 * @description: 提取后的旋律事件
 */
export interface MelodyEvent {
  /** 音高 (0-127) */
  pitch: number
  /** 音高名称 */
  pitch_name: string
  /** 力度 (0-127) */
  velocity: number
  /** 开始时间（毫秒） */
  start_ms: number
  /** 持续时间（毫秒） */
  duration_ms: number
  /** 音轨索引 */
  track: number
}

/**
 * @description: 按键日志条目
 */
export interface KeyLogEntry {
  /** 日志 ID */
  id: number
  /** 时间戳（毫秒，Unix epoch） */
  timestamp: number
  /** 音高 (0-127) */
  pitch: number
  /** 音高名称 */
  pitch_name: string
  /** 映射的键盘按键 */
  mapped_key: string
  /** 力度 */
  velocity: number
  /** 动作类型：按下或释放 */
  action: 'press' | 'release'
}

/**
 * @description: 播放状态类型
 */
export type PlaybackStatus = 'idle' | 'playing' | 'paused'

/**
 * @description: 播放状态结构
 */
export interface PlaybackState {
  /** 当前状态 */
  status: PlaybackStatus
  /** 当前 MIDI 文件名 */
  midi_name: string | null
  /** 当前 tick 位置 */
  current_tick: number
  /** 播放速度倍率 */
  speed: number
}

/**
 * @description: 键盘模板
 */
export interface KeyTemplate {
  /** 模板 ID */
  id: string
  /** 显示名称 */
  name: string
  /** 是否为内置模板 */
  is_builtin: boolean
  /** 音高到按键的映射列表 */
  mappings: KeyMapping[]
}

/**
 * @description: 键位映射
 */
export interface KeyMapping {
  /** MIDI 音高 (0-127) */
  pitch: number
  /** 键盘按键名称 */
  key: string
}
