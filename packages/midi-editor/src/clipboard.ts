import type { PianoRollDocument, PianoRollNote } from '@strawberrybear/piano-roll/core'
import { createNoteId } from './ids'
import type { ClipboardPayload } from './model'
import { clampInt, MAX_PITCH, MIN_NOTE_TICKS, MIN_PITCH } from './commands/notes'

/**
 * @description: 复制音符到剪贴板载荷；时间相对最早起点。
 * @param {PianoRollDocument} document 源文档
 * @param {Iterable<string>} noteIds 目标音符
 * @return {ClipboardPayload | null} 无音符时返回 null
 */
export function copyNotes(
  document: PianoRollDocument,
  noteIds: Iterable<string>
): ClipboardPayload | null {
  const ids = new Set(noteIds)
  const targets = document.notes.filter((note) => ids.has(note.id))
  if (targets.length === 0) return null
  let origin = Number.POSITIVE_INFINITY
  let minPitch = MAX_PITCH
  for (const note of targets) {
    origin = Math.min(origin, note.startTick)
    minPitch = Math.min(minPitch, note.pitch)
  }
  return {
    notes: targets
      .map(({ id: _id, ...note }) => ({
        ...note,
        startTick: note.startTick - origin,
        endTick: note.endTick - origin,
      }))
      .sort((a, b) => a.startTick - b.startTick),
    minPitch,
    ticksPerBeat: document.ticksPerBeat,
  }
}

/** 粘贴目标。 */
export interface PasteOptions {
  /** 粘贴起点 tick。 */
  atTick: number
  /** 指定后所有音符落到该轨；缺省保留原轨（原轨不存在时落到首轨）。 */
  trackId?: string
  /** 整体音高偏移。 */
  pitchOffset?: number
}

/**
 * @description: 粘贴剪贴板音符并生成新 ID。
 * @param {PianoRollDocument} document 源文档
 * @param {ClipboardPayload} payload 剪贴板内容
 * @param {PasteOptions} options 粘贴位置
 * @return {{ document: PianoRollDocument; noteIds: string[] }} 新文档与新音符 ID
 */
export function pasteNotes(
  document: PianoRollDocument,
  payload: ClipboardPayload,
  options: PasteOptions
): { document: PianoRollDocument; noteIds: string[] } {
  if (payload.notes.length === 0 || document.tracks.length === 0) return { document, noteIds: [] }
  const trackIds = new Set(document.tracks.map((track) => track.id))
  const fallbackTrack = document.tracks[0]!.id
  // 跨 PPQ 粘贴按比例换算，保证音乐时值不变。
  const scale =
    payload.ticksPerBeat > 0 && document.ticksPerBeat > 0
      ? document.ticksPerBeat / payload.ticksPerBeat
      : 1
  const at = Math.max(0, Math.round(options.atTick))
  const offset = Math.round(options.pitchOffset ?? 0)
  const existing = new Set(document.notes.map((note) => note.id))
  const noteIds: string[] = []
  const pasted: PianoRollNote[] = payload.notes.map((note) => {
    const id = createNoteId(existing)
    existing.add(id)
    noteIds.push(id)
    const startTick = at + Math.round(note.startTick * scale)
    return {
      id,
      trackId:
        options.trackId && trackIds.has(options.trackId)
          ? options.trackId
          : trackIds.has(note.trackId)
            ? note.trackId
            : fallbackTrack,
      pitch: clampInt(note.pitch + offset, MIN_PITCH, MAX_PITCH),
      velocity: note.velocity,
      startTick,
      endTick: Math.max(startTick + MIN_NOTE_TICKS, at + Math.round(note.endTick * scale)),
    }
  })
  return { document: { ...document, notes: [...document.notes, ...pasted] }, noteIds }
}
