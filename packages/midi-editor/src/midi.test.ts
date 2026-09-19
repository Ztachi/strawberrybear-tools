import { describe, expect, it } from 'vitest'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import { assignChannels, encodeMidi } from './midi/encode'
import { decodeMidi } from './midi/decode'
import { fromMidiText, toMidiText } from './midi/text'

const document: PianoRollDocument = {
  durationTicks: 3840,
  ticksPerBeat: 480,
  tempoMap: [
    { tick: 0, microsecondsPerQuarter: 500_000 },
    { tick: 1920, microsecondsPerQuarter: 400_000 },
  ],
  timeSignatureMap: [{ tick: 0, numerator: 3, denominator: 8 }],
  tracks: [
    { id: 'lead', name: '主旋律', isPercussion: false, enabled: true, channel: 2 },
    { id: 'drum', name: 'Drums', isPercussion: true, enabled: true },
    { id: 'empty', name: 'Empty', isPercussion: false, enabled: true },
  ],
  notes: [
    { id: 'n1', trackId: 'lead', pitch: 60, velocity: 100, startTick: 0, endTick: 480 },
    { id: 'n2', trackId: 'lead', pitch: 60, velocity: 90, startTick: 480, endTick: 960 },
    { id: 'n3', trackId: 'lead', pitch: 200, velocity: 0, startTick: 1000, endTick: 1000 },
    { id: 'n4', trackId: 'drum', pitch: 36, velocity: 120, startTick: 0, endTick: 120 },
  ],
}

describe('midi text', () => {
  it('round-trips utf-8', () => {
    expect(fromMidiText(toMidiText('主旋律 Lead'))).toBe('主旋律 Lead')
    expect(toMidiText('中').length).toBe(3)
  })
})

describe('encodeMidi / decodeMidi', () => {
  it('round-trips notes, tempo, meter and names', () => {
    const bytes = encodeMidi(document, { name: '测试曲' })
    expect(bytes.slice(0, 4)).toEqual(Uint8Array.from([0x4d, 0x54, 0x68, 0x64]))
    const decoded = decodeMidi(bytes, { keepEmptyTracks: true })
    expect(decoded.ticksPerBeat).toBe(480)
    expect(decoded.tempoMap).toEqual(document.tempoMap)
    expect(decoded.timeSignatureMap).toEqual(document.timeSignatureMap)
    // conductor + 3 tracks
    expect(decoded.tracks).toHaveLength(4)
    expect(decoded.tracks[1]!.name).toBe('主旋律')
    expect(decoded.tracks[1]!.channel).toBe(2)
    expect(decoded.tracks[2]!.isPercussion).toBe(true)
    expect(decoded.durationTicks).toBe(3840)
    const lead = decoded.notes.filter((n) => n.trackId === decoded.tracks[1]!.id)
    expect(lead.map((n) => [n.pitch, n.startTick, n.endTick, n.velocity])).toEqual([
      [60, 0, 480, 100],
      [60, 480, 960, 90],
      [127, 1000, 1001, 1],
    ])
  })

  it('drops empty tracks by default', () => {
    const decoded = decodeMidi(encodeMidi(document))
    expect(decoded.tracks.map((t) => t.name)).toEqual(['主旋律', 'Drums'])
  })

  it('assigns channels skipping 9 and honoring explicit ones', () => {
    const channels = assignChannels([
      { id: 'a', name: '', isPercussion: false, enabled: true },
      { id: 'b', name: '', isPercussion: true, enabled: true },
      { id: 'c', name: '', isPercussion: false, enabled: true, channel: 9 },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: '', isPercussion: false, enabled: true })),
    ])
    expect(channels.get('a')).toBe(0)
    expect(channels.get('b')).toBe(9)
    expect(channels.get('c')).toBe(1)
    expect(Array.from(channels.values())).not.toContain(undefined)
    // 轮询在到达 9 时跳过
    expect(channels.get('x7')).toBe(10)
  })

  it('handles overlapping same-pitch notes FIFO on decode', () => {
    const doc: PianoRollDocument = {
      ...document,
      tracks: [document.tracks[0]!],
      notes: [
        { id: 'a', trackId: 'lead', pitch: 60, velocity: 100, startTick: 0, endTick: 1000 },
        { id: 'b', trackId: 'lead', pitch: 60, velocity: 100, startTick: 500, endTick: 1500 },
      ],
    }
    const decoded = decodeMidi(encodeMidi(doc))
    expect(decoded.notes.map((n) => [n.startTick, n.endTick])).toEqual([
      [0, 1000],
      [500, 1500],
    ])
  })
})
