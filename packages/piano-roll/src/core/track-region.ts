import type { PianoRollNote, PianoRollTrack } from './model'

/**
 * @description: 投影音符在轨道有效范围内的部分；右边界不包含新音符起点，不修改源音符。
 * @param {PianoRollNote} note 原始音符，包含被区域隐藏的完整尾部
 * @param {PianoRollTrack} track 区域边界；未指定边界时不限制该端
 * @return {PianoRollNote | null} 有效音符；无交集返回 null，未裁剪时复用原引用
 */
export function clipNoteToTrackRegion(
  note: PianoRollNote,
  track: PianoRollTrack
): PianoRollNote | null {
  if (!Number.isFinite(note.startTick) || !Number.isFinite(note.endTick)) return null
  const regionStart = Number.isFinite(track.startTick) ? Math.max(0, track.startTick!) : 0
  const regionEnd = Number.isFinite(track.endTick)
    ? Math.max(regionStart, track.endTick!)
    : Infinity
  const startTick = Math.max(regionStart, note.startTick, 0)
  // MIDI 导出至少保留一 tick 的合法音符，但不能越过有效区域的右边界。
  const endTick = Math.min(regionEnd, Math.max(note.startTick + 1, note.endTick))
  if (endTick <= startTick) return null
  return startTick === note.startTick && endTick === note.endTick
    ? note
    : { ...note, startTick, endTick }
}
