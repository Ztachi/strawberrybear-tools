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
    { id: 'lead', name: '主旋律', isPercussion: false, enabled: true, channel: 2, endTick: 3840 },
    { id: 'drum', name: 'Drums', isPercussion: true, enabled: true, endTick: 3840 },
    { id: 'empty', name: 'Empty', isPercussion: false, enabled: true, endTick: 3840 },
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
    // 全局元数据不创建额外空轨，用户显式保留的空轨仍保留。
    expect(decoded.tracks).toHaveLength(3)
    // MIDI 不携带编辑器配色，不应在导入时自动给每轨分配不同颜色。
    expect(decoded.tracks.every((track) => track.color === undefined)).toBe(true)
    expect(decoded.tracks[0]!.name).toBe('主旋律')
    expect(decoded.tracks[0]!.channel).toBe(2)
    expect(decoded.tracks[1]!.isPercussion).toBe(true)
    expect(decoded.durationTicks).toBe(3840)
    const lead = decoded.notes.filter((n) => n.trackId === decoded.tracks[0]!.id)
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
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `x${i}`,
        name: '',
        isPercussion: false,
        enabled: true,
      })),
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

describe('有效区域导出', () => {
  it('单轨多次导出再导入不增加空轨，曲名不覆盖音轨名', () => {
    let current: PianoRollDocument = {
      ...document,
      tracks: [document.tracks[0]!],
      notes: document.notes.filter((note) => note.trackId === 'lead'),
    }
    for (let i = 0; i < 3; i++) {
      current = decodeMidi(encodeMidi(current, { name: '文件名称' }), { keepEmptyTracks: true })
      expect(current.tracks.map((track) => track.name)).toEqual(['主旋律'])
      expect(current.tempoMap).toEqual(document.tempoMap)
      expect(current.timeSignatureMap).toEqual(document.timeSignatureMap)
    }
  })
  it('后段速度变化跟随最长音轨，不延长第一条短轨', () => {
    const source = {
      ...document,
      tracks: [{ ...document.tracks[0]!, endTick: 960 }, document.tracks[1]!],
    }
    const result = decodeMidi(encodeMidi(source), { keepEmptyTracks: true })
    expect(result.tracks.map((track) => [track.name, track.endTick])).toEqual([
      ['主旋律', 960],
      ['Drums', 3840],
    ])
    expect(result.tempoMap).toEqual(document.tempoMap)
  })
  it('裁剪跨边界音符，边界上及范围外音符不导出，拉长后恢复', () => {
    const original: PianoRollDocument = {
      ...document,
      durationTicks: 1920,
      tracks: [
        {
          id: 'lead',
          name: 'Lead',
          enabled: true,
          isPercussion: false,
          startTick: 120,
          endTick: 720,
        },
      ],
      notes: [
        { id: 'before', trackId: 'lead', pitch: 60, velocity: 100, startTick: 0, endTick: 240 },
        { id: 'cross', trackId: 'lead', pitch: 62, velocity: 100, startTick: 480, endTick: 960 },
        { id: 'edge', trackId: 'lead', pitch: 64, velocity: 100, startTick: 720, endTick: 840 },
        { id: 'hidden', trackId: 'lead', pitch: 65, velocity: 100, startTick: 960, endTick: 1200 },
      ],
    }
    const before = JSON.stringify(original)
    const clipped = decodeMidi(encodeMidi(original))
    expect(clipped.durationTicks).toBe(720)
    expect(clipped.notes.map((n) => [n.pitch, n.startTick, n.endTick])).toEqual([
      [60, 120, 240],
      [62, 480, 720],
    ])
    expect(clipped.tempoMap).toHaveLength(1)
    const expanded = decodeMidi(
      encodeMidi({ ...original, tracks: [{ ...original.tracks[0]!, endTick: 1200 }] })
    )
    expect(expanded.notes.map((n) => [n.pitch, n.endTick])).toEqual([
      [60, 240],
      [62, 960],
      [64, 840],
      [65, 1200],
    ])
    expect(JSON.stringify(original)).toBe(before)
  })
  it('只导出启用轨道，保留每轨边界且曲尾之后的速度/拍号不延长文件', () => {
    const doc: PianoRollDocument = {
      ...document,
      durationTicks: 9600,
      tempoMap: [
        { tick: 0, microsecondsPerQuarter: 500000 },
        { tick: 50000, microsecondsPerQuarter: 400000 },
      ],
      timeSignatureMap: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 50000, numerator: 3, denominator: 4 },
      ],
      tracks: [
        { id: 'short', name: 'Short', isPercussion: false, enabled: true, endTick: 9600 },
        { id: 'tiny', name: 'Tiny', isPercussion: false, enabled: true, endTick: 1920 },
        { id: 'long', name: 'Long', isPercussion: false, enabled: false, endTick: 57600 },
      ],
      notes: [
        { id: 's', trackId: 'short', pitch: 60, velocity: 100, startTick: 0, endTick: 9600 },
        { id: 't', trackId: 'tiny', pitch: 62, velocity: 100, startTick: 0, endTick: 480 },
        { id: 'l', trackId: 'long', pitch: 64, velocity: 100, startTick: 0, endTick: 57600 },
      ],
    }
    const decoded = decodeMidi(encodeMidi(doc))
    expect(decoded.durationTicks).toBe(9600)
    expect(decoded.tracks.map((track) => [track.name, track.endTick])).toEqual([
      ['Short', 9600],
      ['Tiny', 1920],
    ])
    expect(decoded.notes.map((note) => note.pitch)).toEqual([60, 62])
    expect(decoded.tempoMap).toHaveLength(1)
    expect(decoded.timeSignatureMap).toHaveLength(1)
  })
})
