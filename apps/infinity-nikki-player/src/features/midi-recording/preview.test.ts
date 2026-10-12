import { describe, it, expect } from 'vitest'
import { createProject } from '@strawberrybear/midi-editor'
import { createTimeline } from '@strawberrybear/piano-roll/core'
import { recordingPreviewDocument } from './preview'

describe('录制试听文档', () => {
  it('以当前轨的最后有效音符结束，裁剪伴奏和跨区域音符，不修改原文档', () => {
    const document = createProject().document
    document.durationTicks = 3840
    document.tracks[0]!.enabled = false
    document.tracks[0]!.endTick = 720
    document.tracks.push({
      id: 'other',
      name: 'Other',
      isPercussion: false,
      enabled: true,
      endTick: 3840,
    })
    document.notes = [
      { id: 'last', trackId: 'track-1', pitch: 61, velocity: 80, startTick: 600, endTick: 960 },
      { id: 'hidden', trackId: 'track-1', pitch: 63, velocity: 80, startTick: 960, endTick: 1440 },
      { id: 'other', trackId: 'other', pitch: 70, velocity: 80, startTick: 0, endTick: 3840 },
    ]
    const before = structuredClone(document)
    const solo = recordingPreviewDocument(document, 'track-1', false)
    expect(solo.durationTicks).toBe(720)
    expect(solo.notes.map((note) => [note.id, note.endTick])).toEqual([['last', 720]])
    const accompanied = recordingPreviewDocument(document, 'track-1', true)
    expect(accompanied.notes.map((note) => [note.id, note.endTick])).toEqual([
      ['last', 720],
      ['other', 720],
    ])
    expect(document).toEqual(before)
  })
  it('保留速度变化和前导空拍，空轨不试听其他音轨', () => {
    const document = createProject().document
    document.tempoMap = [
      { tick: 0, microsecondsPerQuarter: 500000 },
      { tick: 480, microsecondsPerQuarter: 1000000 },
    ]
    document.notes = [
      { id: 'n', trackId: 'track-1', pitch: 61, velocity: 80, startTick: 480, endTick: 960 },
    ]
    const preview = recordingPreviewDocument(document, 'track-1', true)
    expect(createTimeline(preview).durationSeconds).toBe(1.5)
    expect(preview.notes[0]!.startTick).toBe(480)
    expect(
      recordingPreviewDocument({ ...document, notes: [] }, 'track-1', true).durationTicks
    ).toBe(0)
  })
})
