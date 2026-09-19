import type { PianoRollDocument, PianoRollNote } from '@strawberrybear/piano-roll/core'
import { createNoteId } from '../ids'
import type { NoteResizeEdge, VelocityChange } from '../model'

/** MIDI 音高/力度边界。 */
export const MIN_PITCH = 0
export const MAX_PITCH = 127
export const MIN_VELOCITY = 1
export const MAX_VELOCITY = 127
/** 音符最短长度，避免零长度音符在导出时被吞掉。 */
export const MIN_NOTE_TICKS = 1

/**
 * @description: 把数值夹在区间内并取整。
 * @param {number} value 原值
 * @param {number} min 下限
 * @param {number} max 上限
 * @return {number} 夹紧后的整数
 */
export function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(Number.isFinite(value) ? value : min)
  return Math.min(max, Math.max(min, rounded))
}

/** 新增音符的输入；`id` 缺省时自动生成。 */
export interface AddNoteInput {
  trackId: string
  pitch: number
  startTick: number
  endTick: number
  velocity?: number
  id?: string
}

/**
 * @description: 新增一颗音符；音高/力度/时长均按边界修正。
 * @param {PianoRollDocument} document 源文档
 * @param {AddNoteInput} input 音符参数
 * @return {{ document: PianoRollDocument; note: PianoRollNote }} 新文档与新音符
 */
export function addNote(
  document: PianoRollDocument,
  input: AddNoteInput
): { document: PianoRollDocument; note: PianoRollNote } {
  const existing = new Set(document.notes.map((note) => note.id))
  const startTick = Math.max(0, Math.round(input.startTick))
  const note: PianoRollNote = {
    id: input.id && !existing.has(input.id) ? input.id : createNoteId(existing),
    trackId: input.trackId,
    pitch: clampInt(input.pitch, MIN_PITCH, MAX_PITCH),
    velocity: clampInt(input.velocity ?? 100, MIN_VELOCITY, MAX_VELOCITY),
    startTick,
    endTick: Math.max(startTick + MIN_NOTE_TICKS, Math.round(input.endTick)),
  }
  return { document: { ...document, notes: [...document.notes, note] }, note }
}

/**
 * @description: 删除一组音符。
 * @param {PianoRollDocument} document 源文档
 * @param {Iterable<string>} noteIds 待删除 ID
 * @return {PianoRollDocument} 无匹配时返回原引用
 */
export function deleteNotes(
  document: PianoRollDocument,
  noteIds: Iterable<string>
): PianoRollDocument {
  const ids = new Set(noteIds)
  if (ids.size === 0) return document
  const notes = document.notes.filter((note) => !ids.has(note.id))
  return notes.length === document.notes.length ? document : { ...document, notes }
}

/**
 * @description: 计算让整组音符都不越界的实际位移；组内相对位置不变。
 * @param {readonly PianoRollNote[]} notes 待移动音符
 * @param {number} deltaTick 期望时间位移
 * @param {number} deltaPitch 期望音高位移
 * @return {{ deltaTick: number; deltaPitch: number }} 截断后的位移
 */
export function clampGroupDelta(
  notes: readonly PianoRollNote[],
  deltaTick: number,
  deltaPitch: number
): { deltaTick: number; deltaPitch: number } {
  if (notes.length === 0) return { deltaTick: 0, deltaPitch: 0 }
  let minStart = Number.POSITIVE_INFINITY
  let minPitch = MAX_PITCH
  let maxPitch = MIN_PITCH
  for (const note of notes) {
    minStart = Math.min(minStart, note.startTick)
    minPitch = Math.min(minPitch, note.pitch)
    maxPitch = Math.max(maxPitch, note.pitch)
  }
  const tick = Math.round(Number.isFinite(deltaTick) ? deltaTick : 0)
  const pitch = Math.round(Number.isFinite(deltaPitch) ? deltaPitch : 0)
  return {
    deltaTick: Math.max(-minStart, tick),
    deltaPitch: Math.min(MAX_PITCH - maxPitch, Math.max(MIN_PITCH - minPitch, pitch)),
  }
}

/**
 * @description: 平移一组音符；越界时整体截断而不是拆散。
 * @param {PianoRollDocument} document 源文档
 * @param {Iterable<string>} noteIds 待移动 ID
 * @param {number} deltaTick 时间位移
 * @param {number} deltaPitch 音高位移
 * @return {PianoRollDocument} 无实际位移时返回原引用
 */
export function moveNotes(
  document: PianoRollDocument,
  noteIds: Iterable<string>,
  deltaTick: number,
  deltaPitch: number
): PianoRollDocument {
  const ids = new Set(noteIds)
  const targets = document.notes.filter((note) => ids.has(note.id))
  const delta = clampGroupDelta(targets, deltaTick, deltaPitch)
  if (targets.length === 0 || (delta.deltaTick === 0 && delta.deltaPitch === 0)) return document
  return {
    ...document,
    notes: document.notes.map((note) =>
      ids.has(note.id)
        ? {
            ...note,
            pitch: note.pitch + delta.deltaPitch,
            startTick: note.startTick + delta.deltaTick,
            endTick: note.endTick + delta.deltaTick,
          }
        : note
    ),
  }
}

/**
 * @description: 拉伸一组音符的起点或终点；每颗音符各自保证最短长度和非负起点。
 * @param {PianoRollDocument} document 源文档
 * @param {Iterable<string>} noteIds 待拉伸 ID
 * @param {NoteResizeEdge} edge 拉伸边
 * @param {number} deltaTick 位移
 * @param {number} minTicks 最短长度，默认 1 tick
 * @return {PianoRollDocument} 新文档
 */
export function resizeNotes(
  document: PianoRollDocument,
  noteIds: Iterable<string>,
  edge: NoteResizeEdge,
  deltaTick: number,
  minTicks = MIN_NOTE_TICKS
): PianoRollDocument {
  const ids = new Set(noteIds)
  const delta = Math.round(Number.isFinite(deltaTick) ? deltaTick : 0)
  if (ids.size === 0 || delta === 0) return document
  const minimum = Math.max(MIN_NOTE_TICKS, Math.round(minTicks))
  return {
    ...document,
    notes: document.notes.map((note) => {
      if (!ids.has(note.id)) return note
      if (edge === 'end') {
        return { ...note, endTick: Math.max(note.startTick + minimum, note.endTick + delta) }
      }
      const startTick = Math.min(note.endTick - minimum, Math.max(0, note.startTick + delta))
      return { ...note, startTick }
    }),
  }
}

/**
 * @description: 批量设置力度。
 * @param {PianoRollDocument} document 源文档
 * @param {readonly VelocityChange[]} changes 变更列表
 * @return {PianoRollDocument} 新文档
 */
export function setNoteVelocity(
  document: PianoRollDocument,
  changes: readonly VelocityChange[]
): PianoRollDocument {
  if (changes.length === 0) return document
  const byId = new Map(changes.map((change) => [change.noteId, change.velocity]))
  let touched = false
  const notes = document.notes.map((note) => {
    const next = byId.get(note.id)
    if (next === undefined) return note
    const velocity = clampInt(next, MIN_VELOCITY, MAX_VELOCITY)
    if (velocity === note.velocity) return note
    touched = true
    return { ...note, velocity }
  })
  return touched ? { ...document, notes } : document
}
