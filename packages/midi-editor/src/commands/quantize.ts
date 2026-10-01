import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type { SnapResolution } from '../model'
import { resolutionTicks, snapTick } from '../snap'
import { clampGroupDelta, MIN_NOTE_TICKS } from './notes'

/** 量化选项；默认只量化起点。 */
export interface QuantizeOptions {
  /** 起点吸附到网格。 */
  start?: boolean
  /** 长度吸附到网格倍数（至少一格）。 */
  length?: boolean
}

/**
 * @description: 把选中音符量化到网格。
 * @param {PianoRollDocument} document 源文档
 * @param {Iterable<string>} noteIds 目标音符
 * @param {SnapResolution} resolution 网格分辨率；`off` 不做任何事
 * @param {QuantizeOptions} options 量化起点/长度
 * @return {PianoRollDocument} 无变化时返回原引用
 */
export function quantizeNotes(
  document: PianoRollDocument,
  noteIds: Iterable<string>,
  resolution: SnapResolution,
  options: QuantizeOptions = { start: true }
): PianoRollDocument {
  const ids = new Set(noteIds)
  if (ids.size === 0 || resolution === 'off') return document
  let touched = false
  const notes = document.notes.map((note) => {
    if (!ids.has(note.id)) return note
    const length = note.endTick - note.startTick
    const startTick = options.start ? snapTick(note.startTick, resolution, document) : note.startTick
    let nextLength = length
    if (options.length) {
      const step = resolutionTicks(resolution, document, startTick)
      nextLength = Math.max(step, Math.round(length / step) * step)
    }
    const endTick = startTick + Math.max(MIN_NOTE_TICKS, nextLength)
    if (startTick === note.startTick && endTick === note.endTick) return note
    touched = true
    return { ...note, startTick, endTick }
  })
  return touched ? { ...document, notes } : document
}

/**
 * @description: 移调选中音符；越界时整体截断，保持和声关系。
 * @param {PianoRollDocument} document 源文档
 * @param {Iterable<string>} noteIds 目标音符
 * @param {number} semitones 半音数，可为负
 * @return {PianoRollDocument} 无变化时返回原引用
 */
export function transposeNotes(
  document: PianoRollDocument,
  noteIds: Iterable<string>,
  semitones: number
): PianoRollDocument {
  const ids = new Set(noteIds)
  const targets = document.notes.filter((note) => ids.has(note.id))
  const { deltaPitch } = clampGroupDelta(targets, 0, semitones)
  if (targets.length === 0 || deltaPitch === 0) return document
  return {
    ...document,
    notes: document.notes.map((note) =>
      ids.has(note.id) ? { ...note, pitch: note.pitch + deltaPitch } : note
    ),
  }
}
