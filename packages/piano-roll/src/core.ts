/**
 * 钢琴卷帘的纯 TypeScript 公共入口。
 * 文档模型、精确时间轴、音乐标尺和音符区间索引均不依赖 Vue、DOM、Tauri 或音频播放器。
 */
export * from './core/model'
export { createTimeline } from './core/timeline'
export { createNoteIndex } from './core/note-index'
export type { PianoRollNoteIndex, PianoRollPitchRange } from './core/note-index'
