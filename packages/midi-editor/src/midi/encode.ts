import { writeMidi, type MidiEvent } from 'midi-file'
import type { PianoRollDocument, PianoRollTrack } from '@strawberrybear/piano-roll/core'
import { clampInt, MAX_PITCH, MAX_VELOCITY, MIN_PITCH, MIN_VELOCITY } from '../commands/notes'
import { toMidiText } from './text'

/** 导出选项。 */
export interface EncodeMidiOptions {
  /** 写入 conductor 轨的曲名。 */
  name?: string
  /** 非打击乐轨的默认 Program（0 = Acoustic Grand Piano）。 */
  program?: number
}

/** 打击乐固定通道（0-based）。 */
const PERCUSSION_CHANNEL = 9

/** 带绝对 tick 的事件，排序后再转 delta。 */
interface AbsoluteEvent {
  tick: number
  /** 同 tick 排序优先级：越小越先写。 */
  order: number
  event: MidiEvent
}

/** 把绝对事件序列转成 midi-file 的 delta 事件轨并追加 End Of Track。 */
function toDeltaTrack(events: AbsoluteEvent[], endTick: number): MidiEvent[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order)
  const track: MidiEvent[] = []
  let cursor = 0
  for (const item of events) {
    const tick = Math.max(cursor, Math.round(item.tick))
    track.push({ ...item.event, deltaTime: tick - cursor })
    cursor = tick
  }
  track.push({ type: 'endOfTrack', deltaTime: Math.max(0, Math.round(endTick) - cursor), meta: true })
  return track
}

/**
 * @description: 为每条轨道分配 MIDI 通道；显式通道优先，打击乐强制 9，其余轮询跳过 9。
 * @param {readonly PianoRollTrack[]} tracks 文档轨道
 * @return {Map<string, number>} 轨道 ID → 通道
 */
export function assignChannels(tracks: readonly PianoRollTrack[]): Map<string, number> {
  const result = new Map<string, number>()
  let next = 0
  for (const track of tracks) {
    if (track.isPercussion) {
      result.set(track.id, PERCUSSION_CHANNEL)
      continue
    }
    if (track.channel !== undefined && Number.isInteger(track.channel) && track.channel >= 0 && track.channel <= 15 && track.channel !== PERCUSSION_CHANNEL) {
      result.set(track.id, track.channel)
      continue
    }
    if (next === PERCUSSION_CHANNEL) next += 1
    result.set(track.id, next % 16 === PERCUSSION_CHANNEL ? (next + 1) % 16 : next % 16)
    next += 1
  }
  return result
}

/**
 * @description: 把卷帘文档编码为标准 MIDI 文件（SMF format 1）。
 * @param {PianoRollDocument} document 源文档
 * @param {EncodeMidiOptions} options 曲名与默认音色
 * @return {Uint8Array} 完整 .mid 字节
 */
export function encodeMidi(document: PianoRollDocument, options: EncodeMidiOptions = {}): Uint8Array {
  const ppq = Math.max(1, Math.round(document.ticksPerBeat > 0 ? document.ticksPerBeat : 480))
  let songEnd = Math.max(0, Math.round(document.durationTicks))
  for (const note of document.notes) songEnd = Math.max(songEnd, Math.round(note.endTick))

  // 轨 0：conductor，只放曲名、速度与拍号。
  const conductor: AbsoluteEvent[] = []
  if (options.name?.trim())
    conductor.push({ tick: 0, order: 0, event: { type: 'trackName', text: toMidiText(options.name.trim()), deltaTime: 0, meta: true } })
  const tempoMap = document.tempoMap.length
    ? document.tempoMap
    : [{ tick: 0, microsecondsPerQuarter: 500_000 }]
  for (const point of tempoMap) {
    if (!Number.isFinite(point.microsecondsPerQuarter) || point.microsecondsPerQuarter <= 0) continue
    conductor.push({
      tick: Math.max(0, point.tick),
      order: 1,
      event: { type: 'setTempo', microsecondsPerBeat: Math.round(point.microsecondsPerQuarter), deltaTime: 0, meta: true },
    })
  }
  const meterMap = document.timeSignatureMap.length
    ? document.timeSignatureMap
    : [{ tick: 0, numerator: 4, denominator: 4 }]
  for (const point of meterMap) {
    if (!Number.isInteger(Math.log2(point.denominator)) || point.numerator < 1) continue
    conductor.push({
      tick: Math.max(0, point.tick),
      order: 2,
      event: {
        type: 'timeSignature',
        numerator: point.numerator,
        denominator: point.denominator,
        metronome: 24,
        thirtyseconds: 8,
        deltaTime: 0,
        meta: true,
      },
    })
  }
  const tracks: MidiEvent[][] = [toDeltaTrack(conductor, songEnd)]

  const channels = assignChannels(document.tracks)
  const notesByTrack = new Map<string, AbsoluteEvent[]>()
  for (const track of document.tracks) notesByTrack.set(track.id, [])
  for (const note of document.notes) {
    const bucket = notesByTrack.get(note.trackId)
    if (!bucket) continue
    const channel = channels.get(note.trackId) ?? 0
    const pitch = clampInt(note.pitch, MIN_PITCH, MAX_PITCH)
    const start = Math.max(0, Math.round(note.startTick))
    // 零长度音符至少保留 1 tick，否则 noteOff 与 noteOn 同刻会被播放器吞掉。
    const end = Math.max(start + 1, Math.round(note.endTick))
    bucket.push({
      tick: start,
      order: 2,
      event: { type: 'noteOn', channel, noteNumber: pitch, velocity: clampInt(note.velocity, MIN_VELOCITY, MAX_VELOCITY), deltaTime: 0 },
    })
    // 同 tick 时 noteOff 排在 noteOn 之前，避免相邻同音高音符被提前截断。
    bucket.push({ tick: end, order: 1, event: { type: 'noteOff', channel, noteNumber: pitch, velocity: 0, deltaTime: 0 } })
  }
  for (const track of document.tracks) {
    const events = notesByTrack.get(track.id)!
    const channel = channels.get(track.id) ?? 0
    events.push({ tick: 0, order: 0, event: { type: 'trackName', text: toMidiText(track.name), deltaTime: 0, meta: true } })
    if (!track.isPercussion) {
      events.push({
        tick: 0,
        order: 0,
        event: { type: 'programChange', channel, programNumber: clampInt(options.program ?? 0, 0, 127), deltaTime: 0 },
      })
    }
    let trackEnd = Math.max(track.endTick ?? 0, songEnd)
    for (const item of events) trackEnd = Math.max(trackEnd, item.tick)
    tracks.push(toDeltaTrack(events, trackEnd))
  }

  return Uint8Array.from(writeMidi({ header: { format: 1, numTracks: tracks.length, ticksPerBeat: ppq }, tracks }))
}
