/**
 * @fileOverview 按键序列编排公共类型
 * @description
 * `@strawberrybear/keystroke-sequencer` 的输入是"已映射到物理键的音符区间"，
 * 输出是满足游戏识别约束（最短保持、同键最短间隔）的按下/抬起事件时间轴。
 * 本包不关心 MIDI 解析、音高到按键的映射或任何平台按键 API。
 */

/** 一个需要演奏的音符：某个物理键在音乐时间轴上的保持区间。 */
export interface KeystrokeNote {
  /** 物理按键标识（如 "Q"、"A"），由调用方定义，包内只做同键分组。 */
  key: string
  /** 音符开始时间，单位毫秒（音乐时间，未含播放速度缩放）。 */
  startMs: number
  /** 音符持续时间，单位毫秒。 */
  durationMs: number
}

/** 游戏按键识别的物理时序约束。 */
export interface KeystrokeTiming {
  /** 一次按下要被游戏轮询识别所需的最短保持时间，单位毫秒。 */
  holdMs: number
  /** 同一个物理键两次独立按下之间的最短抬起间隔，单位毫秒。 */
  gapMs: number
}

/** 编译后的按键事件类型。 */
export type KeystrokeEventType = 'down' | 'up'

/** 编译后时间轴上的单个按键事件。 */
export interface KeystrokeEvent {
  /** 事件发生时间，单位毫秒（音乐时间）。 */
  atMs: number
  /** 按下或抬起。 */
  type: KeystrokeEventType
  /** 物理按键标识。 */
  key: string
}

/** 执行器可见的运行状态。 */
export type KeystrokeSequencerStatus = 'idle' | 'playing' | 'paused' | 'ended'

/** 执行器构造配置。 */
export interface KeystrokeSequencerOptions {
  /** 全曲音符列表，构造时一次性编译为事件时间轴。 */
  notes: KeystrokeNote[]
  /** 按键时序约束（通常由游戏 FPS 推导）。 */
  timing: KeystrokeTiming
  /** 播放速度倍率，大于 0；2 表示两倍速。默认 1。 */
  speed?: number
  /** 按下物理键的回调，由调用方对接真实按键模拟。 */
  onKeyDown: (key: string) => void
  /** 抬起物理键的回调。 */
  onKeyUp: (key: string) => void
  /** 时间轴自然走完（最后一个事件已派发）时的回调。 */
  onEnded?: () => void
  /** 时钟函数，返回单调递增的毫秒时间戳；默认 performance.now，测试可注入。 */
  now?: () => number
}
