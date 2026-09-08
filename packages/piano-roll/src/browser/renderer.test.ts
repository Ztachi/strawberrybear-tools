import { describe, expect, it } from 'vitest'
import { createNoteIndex, type PianoRollTrack } from '../core'
import { getTrackTimeRange } from './renderer'

function track(id: string, bounds: Partial<Pick<PianoRollTrack, 'startTick' | 'endTick'>> = {}): PianoRollTrack {
  return { id, name: id, enabled: true, isPercussion: false, ...bounds }
}

describe('overview track regions', () => {
  it('uses MIDI metadata for empty tracks without stretching to document duration', () => {
    const index = createNoteIndex([])
    expect(getTrackTimeRange(track('intro', { startTick: 0, endTick: 80 }), index, 4_000)).toEqual({
      startTick: 0,
      endTick: 80,
    })
  })

  it('uses note bounds when metadata is absent and repairs truncated metadata', () => {
    const index = createNoteIndex([
      { id: 'note', trackId: 'music', pitch: 60, velocity: 100, startTick: 240, endTick: 360 },
    ])
    expect(getTrackTimeRange(track('music'), index, 4_000)).toEqual({
      startTick: 240,
      endTick: 360,
    })
    expect(getTrackTimeRange(track('music', { startTick: 300, endTick: 320 }), index, 4_000)).toEqual({
      startTick: 240,
      endTick: 360,
    })
  })

  it('clamps bounds to the document and keeps reversed metadata as a marker', () => {
    const index = createNoteIndex([])
    expect(getTrackTimeRange(track('marker', { startTick: 9_000, endTick: 8_000 }), index, 4_000)).toEqual({
      startTick: 4_000,
      endTick: 4_000,
    })
  })
})
