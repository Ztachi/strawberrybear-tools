import type { PianoRollDocument, PianoRollTrack } from '@strawberrybear/piano-roll/core'
import { createNoteId, createTrackId } from '../ids'
import type { TrackPatch } from '../model'
import { resolutionTicks } from '../snap'

/** 供宿主颜色选择器使用的预设色；未指定颜色的轨道沿用视图主题。 */
export const TRACK_PALETTE: readonly string[] = [
  '#e8788a',
  '#5b9bd5',
  '#6cbf84',
  '#d9a441',
  '#9b7ed9',
  '#4fb5b0',
  '#e08a4c',
  '#8a8ad4',
]

/** 新增轨道输入。 */
export interface AddTrackInput {
  name?: string
  color?: string
  channel?: number
  isPercussion?: boolean
  /** 缺省名称的生成函数，参数为新轨序号（从 1 开始）；宿主可注入本地化文案。 */
  defaultName?: (index: number) => string
}

/**
 * @description: 新增一条空轨；只保留显式指定的颜色，缺省配色由宿主主题决定。
 * @param {PianoRollDocument} document 源文档
 * @param {AddTrackInput} input 轨道参数
 * @return {{ document: PianoRollDocument; track: PianoRollTrack }} 新文档与新轨
 */
export function addTrack(
  document: PianoRollDocument,
  input: AddTrackInput = {}
): { document: PianoRollDocument; track: PianoRollTrack } {
  const index = document.tracks.length + 1
  const track: PianoRollTrack = {
    id: createTrackId(new Set(document.tracks.map((item) => item.id))),
    name: input.name?.trim() || input.defaultName?.(index) || `Track ${index}`,
    ...(input.color ? { color: input.color } : {}),
    isPercussion: input.isPercussion ?? false,
    enabled: true,
    startTick: 0,
    endTick: Math.max(1, Math.round(resolutionTicks('bar', document))),
    ...(input.channel !== undefined ? { channel: input.channel } : {}),
  }
  return { document: { ...document, tracks: [...document.tracks, track] }, track }
}

/**
 * @description: 删除轨道及其全部音符；文档至少保留一条轨道。
 * @param {PianoRollDocument} document 源文档
 * @param {string} trackId 待删除轨道
 * @return {PianoRollDocument} 不可删除时返回原引用
 */
export function removeTrack(document: PianoRollDocument, trackId: string): PianoRollDocument {
  if (document.tracks.length <= 1 || !document.tracks.some((track) => track.id === trackId))
    return document
  return {
    ...document,
    tracks: document.tracks.filter((track) => track.id !== trackId),
    notes: document.notes.filter((note) => note.trackId !== trackId),
  }
}

/**
 * @description: 更新轨道元数据。
 * @param {PianoRollDocument} document 源文档
 * @param {string} trackId 目标轨道
 * @param {TrackPatch} patch 变更字段；`name` 会 trim 且不接受空串
 * @return {PianoRollDocument} 无变化时返回原引用
 */
export function updateTrack(
  document: PianoRollDocument,
  trackId: string,
  patch: TrackPatch
): PianoRollDocument {
  const index = document.tracks.findIndex((track) => track.id === trackId)
  if (index < 0) return document
  const current = document.tracks[index]!
  const next: PianoRollTrack = { ...current }
  if (patch.name !== undefined && patch.name.trim()) next.name = patch.name.trim()
  if (patch.color !== undefined) next.color = patch.color
  if (patch.isPercussion !== undefined) next.isPercussion = patch.isPercussion
  if (patch.enabled !== undefined) next.enabled = patch.enabled
  if (patch.channel !== undefined) {
    if (patch.channel === null || !Number.isInteger(patch.channel)) delete next.channel
    else next.channel = Math.min(15, Math.max(0, patch.channel))
  }
  const unchanged =
    (Object.keys(next) as (keyof PianoRollTrack)[]).every((key) => next[key] === current[key]) &&
    Object.keys(next).length === Object.keys(current).length
  if (unchanged) return document
  const tracks = document.tracks.slice()
  tracks[index] = next
  return { ...document, tracks }
}

/**
 * @description: 复制轨道及其音符，新轨紧跟原轨之后。
 * @param {PianoRollDocument} document 源文档
 * @param {string} trackId 源轨道
 * @param {(name: string) => string} copyName 复制名生成函数，默认追加 " copy"
 * @return {{ document: PianoRollDocument; track: PianoRollTrack | null }} 新文档与新轨
 */
export function duplicateTrack(
  document: PianoRollDocument,
  trackId: string,
  copyName: (name: string) => string = (name) => `${name} copy`
): { document: PianoRollDocument; track: PianoRollTrack | null } {
  const index = document.tracks.findIndex((track) => track.id === trackId)
  if (index < 0) return { document, track: null }
  const source = document.tracks[index]!
  const track: PianoRollTrack = {
    ...source,
    id: createTrackId(new Set(document.tracks.map((item) => item.id))),
    name: copyName(source.name),
  }
  const existing = new Set(document.notes.map((note) => note.id))
  const copies = document.notes
    .filter((note) => note.trackId === trackId)
    .map((note) => {
      const id = createNoteId(existing)
      existing.add(id)
      return { ...note, id, trackId: track.id }
    })
  const tracks = document.tracks.slice()
  tracks.splice(index + 1, 0, track)
  return { document: { ...document, tracks, notes: [...document.notes, ...copies] }, track }
}

/**
 * @description: 调整轨道显示顺序。
 * @param {PianoRollDocument} document 源文档
 * @param {string} trackId 目标轨道
 * @param {number} toIndex 目标下标，越界时夹到合法范围
 * @return {PianoRollDocument} 位置不变时返回原引用
 */
export function reorderTrack(
  document: PianoRollDocument,
  trackId: string,
  toIndex: number
): PianoRollDocument {
  const from = document.tracks.findIndex((track) => track.id === trackId)
  if (from < 0) return document
  const to = Math.min(document.tracks.length - 1, Math.max(0, Math.round(toIndex)))
  if (from === to) return document
  const tracks = document.tracks.slice()
  const [track] = tracks.splice(from, 1)
  tracks.splice(to, 0, track!)
  return { ...document, tracks }
}

/**
 * @description: 调整轨道有效区域右边界；允许保留静音尾部，但不截断已有音符。
 * @param {PianoRollDocument} document 源文档
 * @param {string} trackId 目标轨道
 * @param {number} endTick 请求的右边界（tick）
 * @return {PianoRollDocument} 新文档；非法输入或边界不变时返回原引用
 */
export function resizeTrackRegion(
  document: PianoRollDocument,
  trackId: string,
  endTick: number
): PianoRollDocument {
  if (!Number.isFinite(endTick)) return document
  const track = document.tracks.find((item) => item.id === trackId)
  if (!track) return document
  let minimum = Math.max(0, track.startTick ?? 0) + 1
  for (const note of document.notes) {
    if (note.trackId === trackId && Number.isFinite(note.endTick))
      minimum = Math.max(minimum, note.endTick)
  }
  const next = Math.max(minimum, Math.round(endTick))
  if (next === track.endTick) return document
  return {
    ...document,
    tracks: document.tracks.map((item) =>
      item.id === trackId ? { ...item, endTick: next } : item
    ),
  }
}
