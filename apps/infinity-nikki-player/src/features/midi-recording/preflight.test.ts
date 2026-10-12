import { describe, expect, it } from 'vitest'
import { createProject } from '@strawberrybear/midi-editor'
import { checkRecordingPlayback } from './preflight'

describe('录制演奏检查', () => {
  it('联合检查启用轨，定位映射缺失、合并、重叠和实际倍速下过短的间隔', () => {
    const doc = createProject().document
    doc.tracks = [
      { id: 'a', name: 'A', enabled: true, isPercussion: false, endTick: 4800 },
      { id: 'b', name: 'B', enabled: true, isPercussion: false, endTick: 4800 },
    ]
    doc.notes = [
      { id: 'one', trackId: 'a', pitch: 61, velocity: 80, startTick: 0, endTick: 480 },
      { id: 'same', trackId: 'b', pitch: 61, velocity: 80, startTick: 0, endTick: 240 },
      { id: 'next', trackId: 'a', pitch: 61, velocity: 80, startTick: 60, endTick: 100 },
      { id: 'missing', trackId: 'a', pitch: 62, velocity: 80, startTick: 0, endTick: 200 },
    ]
    const result = checkRecordingPlayback(
      doc,
      { id: 't', name: 'T', is_builtin: false, mappings: [{ key: 'A', pitch: 61 }] },
      60,
      2
    )
    expect(result.issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['unmapped', 'merged', 'overlap', 'timing'])
    )
    expect(result.issues.find((i) => i.kind === 'unmapped')?.noteIds).toEqual(['missing'])
    expect(result.issues.every((i) => i.noteIds.length)).toBe(true)
    doc.tracks[1]!.enabled = false
    expect(
      checkRecordingPlayback(
        doc,
        { id: 't', name: 'T', is_builtin: false, mappings: [{ key: 'A', pitch: 61 }] },
        60,
        1
      ).issues.some((i) => i.kind === 'merged')
    ).toBe(false)
  })
})

it('长音跨越多个短音时仍定位所有重叠，映射键名忽略大小写', () => {
  const doc = createProject().document
  doc.notes = [
    { id: 'long', trackId: 'track-1', pitch: 60, velocity: 80, startTick: 0, endTick: 1000 },
    { id: 'short', trackId: 'track-1', pitch: 61, velocity: 80, startTick: 10, endTick: 20 },
    { id: 'later', trackId: 'track-1', pitch: 60, velocity: 80, startTick: 500, endTick: 600 },
  ]
  const result = checkRecordingPlayback(
    doc,
    {
      id: 't',
      name: 'T',
      is_builtin: false,
      mappings: [
        { pitch: 60, key: 'a' },
        { pitch: 61, key: 'A' },
      ],
    },
    60,
    1
  )
  expect(result.issues.filter((i) => i.kind === 'overlap').flatMap((i) => i.noteIds)).toEqual(
    expect.arrayContaining(['long', 'short', 'later'])
  )
})
