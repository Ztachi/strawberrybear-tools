import { parseMidi } from 'midi-file'
import type {
  PianoRollDocument,
  PianoRollNote,
  PianoRollTrack,
  TempoPoint,
  TimeSignaturePoint,
} from '@strawberrybear/piano-roll/core'
import { TRACK_PALETTE } from '../commands/tracks'
import { fromMidiText } from './text'

/** 解码选项。 */
export interface DecodeMidiOptions {
  /** 没有 Track Name 时的后备名称，参数为轨序号（从 1 开始）。 */
  trackName?: (index: number) => string
  /** 是否保留没有音符的轨道，默认 false（conductor 轨通常为空）。 */
  keepEmptyTracks?: boolean
}

/**
 * @description: 解析 .mid 字节为卷帘文档；只提取音符、速度、拍号与轨名。
 * @param {ArrayLike<number>} bytes 文件字节
 * @param {DecodeMidiOptions} options 命名与空轨策略
 * @return {PianoRollDocument} 文档；tempo/拍号来自所有轨的 meta 事件
 */
export function decodeMidi(bytes: ArrayLike<number>, options: DecodeMidiOptions = {}): PianoRollDocument {
  const data = parseMidi(bytes)
  const ppq = data.header.ticksPerBeat && data.header.ticksPerBeat > 0 ? data.header.ticksPerBeat : 480
  const tempoMap: TempoPoint[] = []
  const timeSignatureMap: TimeSignaturePoint[] = []
  const tracks: PianoRollTrack[] = []
  const notes: PianoRollNote[] = []
  let durationTicks = 0
  let noteCounter = 0

  data.tracks.forEach((events, trackIndex) => {
    const id = `track-${trackIndex}`
    let name = ''
    let channel: number | undefined
    let percussion = false
    let tick = 0
    const trackNotes: PianoRollNote[] = []
    // 同音高的未结束音符按先后入栈，遇到 noteOff/velocity 0 时按 FIFO 关闭。
    const open = new Map<number, PianoRollNote[]>()
    for (const event of events) {
      tick += event.deltaTime
      switch (event.type) {
        case 'trackName':
          if (!name) name = fromMidiText(event.text).trim()
          break
        case 'setTempo':
          tempoMap.push({ tick, microsecondsPerQuarter: event.microsecondsPerBeat })
          break
        case 'timeSignature':
          timeSignatureMap.push({ tick, numerator: event.numerator, denominator: event.denominator })
          break
        case 'noteOn':
        case 'noteOff': {
          const key = event.channel * 128 + event.noteNumber
          const isOn = event.type === 'noteOn' && event.velocity > 0
          if (isOn) {
            if (channel === undefined) channel = event.channel
            if (event.channel === 9) percussion = true
            const note: PianoRollNote = {
              id: `note-${trackIndex}-${noteCounter++}`,
              trackId: id,
              pitch: event.noteNumber,
              velocity: event.velocity,
              startTick: tick,
              endTick: tick,
            }
            const stack = open.get(key)
            if (stack) stack.push(note)
            else open.set(key, [note])
            trackNotes.push(note)
          } else {
            const stack = open.get(key)
            const note = stack?.shift()
            if (note) note.endTick = Math.max(note.startTick + 1, tick)
          }
          break
        }
        case 'endOfTrack':
          break
        default:
          break
      }
    }
    // 未关闭的音符延续到轨尾。
    for (const stack of open.values()) for (const note of stack) note.endTick = Math.max(note.startTick + 1, tick)
    durationTicks = Math.max(durationTicks, tick)
    if (trackNotes.length === 0 && !options.keepEmptyTracks) return
    tracks.push({
      id,
      name: name || options.trackName?.(tracks.length + 1) || `Track ${tracks.length + 1}`,
      color: TRACK_PALETTE[tracks.length % TRACK_PALETTE.length],
      isPercussion: percussion,
      enabled: true,
      startTick: 0,
      endTick: tick,
      ...(channel !== undefined ? { channel } : {}),
    })
    notes.push(...trackNotes)
  })

  return {
    durationTicks,
    ticksPerBeat: ppq,
    tempoMap: tempoMap.length ? tempoMap : [{ tick: 0, microsecondsPerQuarter: 500_000 }],
    timeSignatureMap: timeSignatureMap.length ? timeSignatureMap : [{ tick: 0, numerator: 4, denominator: 4 }],
    tracks,
    notes,
  }
}
