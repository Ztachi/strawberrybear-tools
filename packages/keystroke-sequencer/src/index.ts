/**
 * @fileOverview @strawberrybear/keystroke-sequencer 公共入口
 * @description
 * 把"已映射到物理键的音符区间"编译成满足游戏识别约束的按键事件时间轴，
 * 并按高精度时钟执行。MIDI 解析、音高映射和真实按键 API 都由调用方负责。
 */

export { compileKeystrokeTimeline } from './compile'
export { KeystrokeSequencer } from './KeystrokeSequencer'
export type {
  KeystrokeNote,
  KeystrokeTiming,
  KeystrokeEvent,
  KeystrokeEventType,
  KeystrokeSequencerOptions,
  KeystrokeSequencerStatus,
} from './types'
