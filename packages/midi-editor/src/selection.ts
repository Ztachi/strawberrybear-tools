import {
  clipNoteToTrackRegion,
  type PianoRollDocument,
  type PianoRollNoteIndex,
} from '@strawberrybear/piano-roll/core'

/**
 * @description: 框选：返回与矩形相交的音符（时间区间相交、音高在范围内）。
 * @param {PianoRollNoteIndex} index 音符索引
 * @param {string} trackId 目标轨道
 * @param {[number, number]} tickRange 时间范围 [start, end]
 * @param {[number, number]} pitchRange 音高范围 [low, high]，含端点
 * @return {string[]} 命中的音符 ID
 */
export function notesInBox(
  index: PianoRollNoteIndex,
  trackId: string,
  tickRange: readonly [number, number],
  pitchRange: readonly [number, number]
): string[] {
  const [startTick, endTick] = [Math.min(...tickRange), Math.max(...tickRange)]
  const [low, high] = [Math.min(...pitchRange), Math.max(...pitchRange)]
  return index
    .query(trackId, startTick, endTick)
    .filter((note) => note.pitch >= low && note.pitch <= high)
    .map((note) => note.id)
}

/**
 * @description: 移除文档中已不存在或被有效区域完全隐藏的选中 ID。
 * @param {ReadonlySet<string>} selection 当前选择
 * @param {PianoRollDocument} document 文档
 * @return {Set<string>} 仍然有效的选择；无变化时返回同内容的新集合
 */
export function pruneSelection(
  selection: ReadonlySet<string>,
  document: PianoRollDocument
): Set<string> {
  if (selection.size === 0) return new Set()
  const tracks = new Map(document.tracks.map((track) => [track.id, track]))
  const existing = new Set(
    document.notes
      .filter((note) => {
        const track = tracks.get(note.trackId)
        return track && clipNoteToTrackRegion(note, track)
      })
      .map((note) => note.id)
  )
  const next = new Set<string>()
  for (const id of selection) if (existing.has(id)) next.add(id)
  return next
}
