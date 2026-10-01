import { describe, expect, it } from 'vitest'
import type { PianoRollTrack } from '../core'
import { layoutTrackRows, visibleRows } from './renderer'

function tracks(count: number): PianoRollTrack[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `track-${index}`,
    name: `Track ${index + 1}`,
    enabled: true,
    isPercussion: false,
  }))
}

describe('adaptive overview rows', () => {
  it('fills the available height and grows or shrinks with the content viewport', () => {
    const documentTracks = tracks(3)
    const expanded = layoutTrackRows(documentTracks, 1200)
    const collapsed = layoutTrackRows(documentTracks, 300)
    const fractional = layoutTrackRows(documentTracks, 401)

    expect(expanded.map((row) => row.height)).toEqual([400, 400, 400])
    expect(collapsed.map((row) => row.height)).toEqual([100, 100, 100])
    expect(collapsed.map((row) => row.top)).toEqual([0, 100, 200])
    expect(fractional[2]!.top + fractional[2]!.height).toBeCloseTo(401)
    expect(collapsed[1]!.track).toBe(documentTracks[1])
  })

  it('overflows only after all automatic rows reach their minimum height', () => {
    const documentTracks = tracks(5)
    const exact = layoutTrackRows(documentTracks, 280)
    const overflowing = layoutTrackRows(documentTracks, 220)

    expect(exact.map((row) => row.height)).toEqual([56, 56, 56, 56, 56])
    expect(overflowing).toEqual(exact)
    expect(visibleRows(overflowing, 56, 110).map((row) => row.track.id)).toEqual([
      'track-1',
      'track-2',
    ])
  })

  it('preserves explicit row heights and divides only the remaining space', () => {
    const documentTracks = tracks(4)
    const customHeights = new Map([
      ['track-0', 120],
      ['track-2', 180],
    ])
    const expanded = layoutTrackRows(documentTracks, 800, customHeights)
    const collapsed = layoutTrackRows(documentTracks, 380, customHeights)

    expect(expanded.map((row) => row.height)).toEqual([120, 250, 180, 250])
    expect(expanded.map((row) => row.top)).toEqual([0, 120, 370, 550])
    expect(collapsed.map((row) => row.height)).toEqual([120, 56, 180, 56])
    expect(collapsed[3]!.top + collapsed[3]!.height).toBe(412)
    expect(customHeights.get('track-0')).toBe(120)
  })

  it('retains explicit height limits even when the viewport has spare room', () => {
    const rows = layoutTrackRows(
      tracks(3),
      1000,
      new Map([
        ['track-0', 1],
        ['track-1', 900],
        ['track-2', Number.NaN],
      ])
    )

    expect(rows.map((row) => row.height)).toEqual([56, 320, 56])
    expect(rows[2]!.top + rows[2]!.height).toBe(432)
  })

  it('handles no tracks and non-visible or invalid viewport measurements', () => {
    expect(layoutTrackRows([], 500)).toEqual([])
    for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(layoutTrackRows(tracks(2), height).map((row) => row.height)).toEqual([56, 56])
    }
  })

  it('keeps a large document indexed without argument spreading or viewport-wide traversal', () => {
    const count = 200_000
    const rows = layoutTrackRows(tracks(count), 400)
    const last = rows[count - 1]!

    expect(rows).toHaveLength(count)
    expect(last.top).toBe((count - 1) * 56)
    expect(last.top + last.height).toBe(count * 56)
    expect(visibleRows(rows, last.top, 400)).toEqual([last])
  })
})
