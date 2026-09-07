import type { PianoRollNote } from './model'

/** 单轨有效音符覆盖的 MIDI 音域。 */
export interface PianoRollPitchRange {
  /** 最低音高。 */
  min: number
  /** 最高音高。 */
  max: number
}

/** 不依赖渲染器的每轨静态音符区间索引。 */
export interface PianoRollNoteIndex {
  /** 索引内有效音符总数。 */
  readonly size: number
  /** 含有效音符的轨道标识，保持各轨在输入中的首次出现顺序。 */
  readonly trackIds: readonly string[]
  /**
   * 查询与闭区间 [startTick, endTick] 相交的单轨音符，按开始 tick 排序。
   * 音符在窗口前开始但仍未结束时也会返回；空轨或非有限边界返回空数组。
   */
  query(trackId: string, startTick: number, endTick: number): PianoRollNote[]
  /** 返回单轨音域的副本；没有有效音符时返回 null。 */
  getPitchRange(trackId: string): PianoRollPitchRange | null
}

interface TrackIndex {
  notes: PianoRollNote[]
  maxEnd: Float64Array
  leafCount: number
  pitchRange: PianoRollPitchRange
}

/** 对单轨开始时间有序的音符建立最大结束时间区间树。 */
function buildTrackIndex(notes: PianoRollNote[]): TrackIndex {
  notes.sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick)
  let leafCount = 1
  while (leafCount < notes.length) leafCount *= 2
  const maxEnd = new Float64Array(leafCount * 2)
  maxEnd.fill(Number.NEGATIVE_INFINITY)
  const pitchRange = { min: 127, max: 0 }
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]!
    maxEnd[leafCount + index] = note.endTick
    pitchRange.min = Math.min(pitchRange.min, note.pitch)
    pitchRange.max = Math.max(pitchRange.max, note.pitch)
  }
  for (let node = leafCount - 1; node > 0; node -= 1) {
    maxEnd[node] = Math.max(maxEnd[node * 2]!, maxEnd[node * 2 + 1]!)
  }
  return { notes, maxEnd, leafCount, pitchRange }
}

/**
 * 按稳定轨道 ID 创建只读音符索引，用于视口裁剪和后续命中测试。
 *
 * @param notes 无须排序的音符列表；不修改输入数组或输入音符。
 * @returns 单轨查询索引。预处理 O(N log N)、内存 O(N)；查询按区间树剪枝，避免每帧遍历全曲。
 * @remarks 非有限 tick/音高的音符被忽略；负 tick 归零，结束时间至少等于开始时间，音高/力度归一化到 MIDI 范围。
 * 查询采用闭区间，因此零时长音符和恰好位于视口边缘的音符仍可绘制。
 */
export function createNoteIndex(notes: readonly PianoRollNote[]): PianoRollNoteIndex {
  const grouped = new Map<string, PianoRollNote[]>()
  let size = 0
  for (const note of notes) {
    if (
      !Number.isFinite(note.startTick) ||
      !Number.isFinite(note.endTick) ||
      !Number.isFinite(note.pitch)
    )
      continue
    const startTick = Math.max(0, note.startTick)
    const normalized: PianoRollNote = {
      ...note,
      startTick,
      endTick: Math.max(startTick, note.endTick),
      pitch: Math.min(127, Math.max(0, Math.round(note.pitch))),
      velocity: Number.isFinite(note.velocity)
        ? Math.min(127, Math.max(0, Math.round(note.velocity)))
        : 0,
    }
    const track = grouped.get(note.trackId)
    if (track) track.push(normalized)
    else grouped.set(note.trackId, [normalized])
    size += 1
  }
  const tracks = new Map<string, TrackIndex>()
  for (const [trackId, trackNotes] of grouped) tracks.set(trackId, buildTrackIndex(trackNotes))

  function query(trackId: string, startTick: number, endTick: number): PianoRollNote[] {
    const track = tracks.get(trackId)
    if (!track || !Number.isFinite(startTick) || !Number.isFinite(endTick)) return []
    const from = Math.max(0, Math.min(startTick, endTick))
    const to = Math.max(0, Math.max(startTick, endTick))
    // 先二分裁掉尚未开始的全部音符，再用 maxEnd 剪掉已经结束的整个子树。
    let left = 0
    let right = track.notes.length
    while (left < right) {
      const middle = Math.floor((left + right) / 2)
      if (track.notes[middle]!.startTick <= to) left = middle + 1
      else right = middle
    }
    const endIndex = left
    const result: PianoRollNote[] = []
    function visit(node: number, nodeStart: number, nodeEnd: number): void {
      if (nodeStart >= endIndex || track!.maxEnd[node]! < from) return
      if (nodeEnd - nodeStart === 1) {
        result.push(track!.notes[nodeStart]!)
        return
      }
      const middle = (nodeStart + nodeEnd) / 2
      visit(node * 2, nodeStart, middle)
      visit(node * 2 + 1, middle, nodeEnd)
    }
    visit(1, 0, track.leafCount)
    return result
  }

  return {
    size,
    trackIds: Array.from(tracks.keys()),
    query,
    getPitchRange(trackId) {
      const range = tracks.get(trackId)?.pitchRange
      return range ? { ...range } : null
    },
  }
}
