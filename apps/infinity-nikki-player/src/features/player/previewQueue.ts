/** 跨窗口只传队列展示字段，不传 MIDI 音符、文件事件或播放器实例。 */
export interface PreviewQueueItem {
  id: string
  title: string
  durationMs: number
  trackCount: number
  noteCount: number
}

/** 当前队列快照；当前播放歌曲由独立的 playback 状态提供。 */
export interface PreviewQueueState {
  title: string
  items: PreviewQueueItem[]
  error: string
}
