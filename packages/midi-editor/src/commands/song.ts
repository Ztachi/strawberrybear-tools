import { createTimeline } from '@strawberrybear/piano-roll/core'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import { resolutionTicks } from '../snap'

/** BPM 合法范围。 */
export const MIN_BPM = 20
export const MAX_BPM = 400
/** 默认新文档参数。 */
export const DEFAULT_PPQ = 480
export const DEFAULT_BPM = 120
export const DEFAULT_BARS = 8

/**
 * @description: 微秒/四分音符 与 BPM 的互转。
 * @param {number} microsecondsPerQuarter 每四分音符微秒数
 * @return {number} BPM，保留两位小数
 */
export function tempoToBpm(microsecondsPerQuarter: number): number {
  if (!Number.isFinite(microsecondsPerQuarter) || microsecondsPerQuarter <= 0) return DEFAULT_BPM
  return Math.round((60_000_000 / microsecondsPerQuarter) * 100) / 100
}

/**
 * @description: BPM 转微秒/四分音符，BPM 先夹到合法范围。
 * @param {number} bpm 每分钟拍数
 * @return {number} 微秒/四分音符（整数）
 */
export function bpmToTempo(bpm: number): number {
  const safe = Math.min(MAX_BPM, Math.max(MIN_BPM, Number.isFinite(bpm) ? bpm : DEFAULT_BPM))
  return Math.round(60_000_000 / safe)
}

/**
 * @description: 用单一 BPM 替换整张速度图。
 * @param {PianoRollDocument} document 源文档
 * @param {number} bpm 新速度
 * @return {PianoRollDocument} 新文档
 */
export function setTempo(document: PianoRollDocument, bpm: number): PianoRollDocument {
  const tempo = bpmToTempo(bpm)
  const [first] = document.tempoMap
  if (document.tempoMap.length === 1 && first?.tick === 0 && first.microsecondsPerQuarter === tempo)
    return document
  return { ...document, tempoMap: [{ tick: 0, microsecondsPerQuarter: tempo }] }
}

/**
 * @description: 用单一拍号替换整张拍号图；非法分母回退 4。
 * @param {PianoRollDocument} document 源文档
 * @param {number} numerator 每小节拍数 1–32
 * @param {number} denominator 2 的幂，1–32
 * @return {PianoRollDocument} 新文档
 */
export function setTimeSignature(
  document: PianoRollDocument,
  numerator: number,
  denominator: number
): PianoRollDocument {
  const top = Math.min(32, Math.max(1, Math.round(Number.isFinite(numerator) ? numerator : 4)))
  const bottom =
    [1, 2, 4, 8, 16, 32].includes(denominator) ? denominator : 4
  const [first] = document.timeSignatureMap
  if (
    document.timeSignatureMap.length === 1 &&
    first?.tick === 0 &&
    first.numerator === top &&
    first.denominator === bottom
  )
    return document
  return { ...document, timeSignatureMap: [{ tick: 0, numerator: top, denominator: bottom }] }
}

/**
 * @description: 直接设置文档总长。
 * @param {PianoRollDocument} document 源文档
 * @param {number} durationTicks 新总长（tick）
 * @return {PianoRollDocument} 新文档
 */
export function setDurationTicks(
  document: PianoRollDocument,
  durationTicks: number
): PianoRollDocument {
  const next = Math.max(0, Math.round(Number.isFinite(durationTicks) ? durationTicks : 0))
  return next === document.durationTicks ? document : { ...document, durationTicks: next }
}

/**
 * @description: 保证总长覆盖所有音符尾端：越界时扩展到下一个整小节再多留一小节。
 * @param {PianoRollDocument} document 源文档
 * @return {PianoRollDocument} 已覆盖时返回原引用
 */
export function ensureDurationCovers(document: PianoRollDocument): PianoRollDocument {
  let lastTick = 0
  for (const note of document.notes) lastTick = Math.max(lastTick, note.endTick)
  for (const track of document.tracks) lastTick = Math.max(lastTick, track.endTick ?? 0)
  if (lastTick <= document.durationTicks) return document
  const bar = resolutionTicks('bar', document, lastTick)
  const durationTicks = (Math.floor(lastTick / bar) + 2) * bar
  return { ...document, durationTicks }
}

/**
 * @description: 创建默认空文档：4/4、120 BPM、PPQ 480、8 小节、一条空轨。
 * @param {string} trackName 首轨名称
 * @param {string} trackId 首轨 ID，缺省为 `track-1`
 * @return {PianoRollDocument} 新文档
 */
export function createEmptyDocument(trackName = 'Track 1', trackId = 'track-1'): PianoRollDocument {
  return {
    durationTicks: DEFAULT_PPQ * 4 * DEFAULT_BARS,
    ticksPerBeat: DEFAULT_PPQ,
    tempoMap: [{ tick: 0, microsecondsPerQuarter: bpmToTempo(DEFAULT_BPM) }],
    timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
    tracks: [{ id: trackId, name: trackName, color: '#e8788a', isPercussion: false, enabled: true }],
    notes: [],
  }
}

/**
 * @description: 计算文档总时长毫秒数。
 * @param {PianoRollDocument} document 文档
 * @return {number} 毫秒（整数）
 */
export function documentDurationMs(document: PianoRollDocument): number {
  return Math.round(createTimeline(document).durationSeconds * 1000)
}
