import { describe, expect, it } from 'vitest'
import { createNoteIndex, createTimeline, type PianoRollDocument, type PianoRollNote } from './core'

function createDocument(): PianoRollDocument {
  return {
    durationTicks: 1920,
    ticksPerBeat: 480,
    tempoMap: [
      { tick: 0, microsecondsPerQuarter: 500000 },
      { tick: 960, microsecondsPerQuarter: 1000000 },
    ],
    timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
    tracks: [],
    notes: [],
  }
}

describe('piano roll timeline', () => {
  it('integrates tempo changes without losing the original microseconds value', () => {
    const timeline = createTimeline(createDocument())
    expect(timeline.tickToSeconds(960)).toBeCloseTo(1, 8)
    expect(timeline.tickToSeconds(1920)).toBeCloseTo(3, 8)
    expect(timeline.secondsToTick(2)).toBeCloseTo(1440, 8)
  })

  it('keeps seconds and content coordinates on one transform', () => {
    const timeline = createTimeline(createDocument())
    expect(timeline.contentXToSeconds(timeline.secondsToContentX(2, 80), 80)).toBeCloseTo(2, 8)
  })

  it('maps ticks to one-based bar and beat positions', () => {
    const timeline = createTimeline({
      ...createDocument(),
      durationTicks: 3840,
      timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
    })
    expect(timeline.tickToBarPosition(0)).toEqual({ bar: 1, beat: 1, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(480)).toEqual({ bar: 1, beat: 2, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(1920)).toEqual({ bar: 2, beat: 1, tickInBeat: 0 })
  })

  it('uses MIDI defaults for absent maps and retains leading and trailing silence', () => {
    const timeline = createTimeline({
      ...createDocument(),
      durationTicks: 4800,
      tempoMap: [],
      timeSignatureMap: [],
      notes: [note('one', 'piano', 480, 960)],
    })
    expect(timeline.tickToSeconds(480)).toBe(0.5)
    expect(timeline.durationSeconds).toBe(5)
    expect(timeline.durationTicks).toBe(4800)
    expect(timeline.tickToBarPosition(1920)).toEqual({ bar: 2, beat: 1, tickInBeat: 0 })
  })

  it('retains a non-integer BPM and round-trips many tempo segments', () => {
    const timeline = createTimeline({
      ...createDocument(),
      tempoMap: [
        { tick: 0, microsecondsPerQuarter: 600001 },
        { tick: 960, microsecondsPerQuarter: 430003 },
        { tick: 1920, microsecondsPerQuarter: 789007 },
      ],
    })
    expect(timeline.tickToSeconds(960)).toBeCloseTo(1.200002, 12)
    expect(timeline.tickToSeconds(1920)).toBeCloseTo(2.060008, 12)
    for (const tick of [0, 1, 479.25, 959.999, 960, 960.001, 1919.9, 1920, 96000]) {
      expect(timeline.secondsToTick(timeline.tickToSeconds(tick))).toBeCloseTo(tick, 8)
    }
  })

  it('lets the last valid point at a duplicate tick win', () => {
    const timeline = createTimeline({
      ...createDocument(),
      tempoMap: [
        { tick: 480, microsecondsPerQuarter: 300000 },
        { tick: 0, microsecondsPerQuarter: 600000 },
        { tick: 480, microsecondsPerQuarter: 700000 },
        { tick: 0, microsecondsPerQuarter: 500000 },
      ],
      timeSignatureMap: [
        { tick: 0, numerator: 3, denominator: 4 },
        { tick: 0, numerator: 6, denominator: 8 },
      ],
    })
    expect(timeline.tickToSeconds(960)).toBeCloseTo(1.2, 12)
    expect(timeline.tempoMap).toHaveLength(2)
    expect(timeline.tickToBarPosition(240)).toEqual({ bar: 1, beat: 2, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(1440)).toEqual({ bar: 2, beat: 1, tickInBeat: 0 })
  })

  it('normalizes invalid metadata and coordinates without NaN propagation', () => {
    const timeline = createTimeline({
      ...createDocument(),
      ticksPerBeat: Number.NaN,
      durationTicks: Number.POSITIVE_INFINITY,
      tempoMap: [
        { tick: Number.NaN, microsecondsPerQuarter: 1 },
        { tick: 0, microsecondsPerQuarter: 0 },
        { tick: 480, microsecondsPerQuarter: Number.POSITIVE_INFINITY },
      ],
      timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 3 }],
    })
    expect(timeline.ticksPerBeat).toBe(480)
    expect(timeline.durationSeconds).toBe(0)
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(timeline.tickToSeconds(invalid)).toBe(0)
      expect(timeline.secondsToTick(invalid)).toBe(0)
      expect(timeline.tickToBeat(invalid)).toBe(0)
    }
    expect(timeline.tickToSeconds(480)).toBe(0.5)
    expect(timeline.contentXToSeconds(3, Number.NaN)).toBe(3)
    expect(timeline.secondsToContentX(3, -1)).toBe(3)
  })

  it('maps a sustained note across a tempo change with the same transform as the playhead', () => {
    const timeline = createTimeline(createDocument())
    const start = timeline.tickToSeconds(480)
    const end = timeline.tickToSeconds(1440)
    expect(end - start).toBe(1.5)
    expect(timeline.secondsToContentX(end, 80) - timeline.secondsToContentX(start, 80)).toBe(120)
  })

  it('counts bars and denominator beats across meter changes, including truncated bars', () => {
    const timeline = createTimeline({
      ...createDocument(),
      timeSignatureMap: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 3, denominator: 8 },
        { tick: 3000, numerator: 5, denominator: 4 },
      ],
    })
    expect(timeline.tickToBarPosition(1920)).toEqual({ bar: 2, beat: 1, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(2160)).toEqual({ bar: 2, beat: 2, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(2640)).toEqual({ bar: 3, beat: 1, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(3000)).toEqual({ bar: 4, beat: 1, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(3530)).toEqual({ bar: 4, beat: 2, tickInBeat: 50 })
  })

  it('does not restart a bar for a redundant meter point', () => {
    const timeline = createTimeline({
      ...createDocument(),
      timeSignatureMap: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 480, numerator: 4, denominator: 4 },
      ],
    })
    expect(timeline.tickToBarPosition(480)).toEqual({ bar: 1, beat: 2, tickInBeat: 0 })
    expect(timeline.tickToBarPosition(1920)).toEqual({ bar: 2, beat: 1, tickInBeat: 0 })
  })

  it('projects visible ruler subdivisions from ticks through changing tempos', () => {
    const timeline = createTimeline(createDocument())
    const marks = timeline.getRulerMarks({
      startSeconds: 0.6,
      endSeconds: 2.1,
      pixelsPerSecond: 200,
      minSpacingPx: 1,
    })
    expect(marks.every((mark) => mark.seconds >= 0.6 && mark.seconds <= 2.1)).toBe(true)
    expect(marks.find((mark) => mark.tick === 600)).toMatchObject({
      seconds: 0.625,
      x: 125,
      kind: 'subdivision',
    })
    expect(marks.find((mark) => mark.tick === 960)).toMatchObject({
      seconds: 1,
      kind: 'beat',
      label: '1.3',
    })
    expect(marks.find((mark) => mark.tick === 1200)).toMatchObject({ seconds: 1.5, x: 300 })
    for (const mark of marks) expect(mark.seconds).toBe(timeline.tickToSeconds(mark.tick))
  })

  it('draws meter changes exactly once with new denominator beats', () => {
    const timeline = createTimeline({
      ...createDocument(),
      tempoMap: [],
      timeSignatureMap: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 3, denominator: 8 },
      ],
    })
    const marks = timeline.getRulerMarks({
      startSeconds: 1.9,
      endSeconds: 3,
      pixelsPerSecond: 200,
      minSpacingPx: 1,
    })
    expect(marks.filter((mark) => mark.tick === 1920)).toHaveLength(1)
    expect(marks.find((mark) => mark.tick === 1920)).toMatchObject({ kind: 'bar', label: '2' })
    expect(marks.find((mark) => mark.tick === 2160)).toMatchObject({ kind: 'beat', label: '2.2' })
  })

  it('bounds ruler output for huge durations and very small zoom', () => {
    const timeline = createTimeline({
      ...createDocument(),
      tempoMap: [],
      durationTicks: 1_000_000_000,
    })
    const marks = timeline.getRulerMarks({
      startSeconds: 0,
      endSeconds: 1_000_000,
      pixelsPerSecond: 0.001,
      maxMarks: 40,
    })
    expect(marks.length).toBeGreaterThan(1)
    expect(marks.length).toBeLessThanOrEqual(40)
    expect(marks.every((mark) => mark.kind === 'bar')).toBe(true)
  })
})

function note(
  id: string,
  trackId: string,
  startTick: number,
  endTick: number,
  pitch = 60
): PianoRollNote {
  return { id, trackId, startTick, endTick, pitch, velocity: 100 }
}

describe('piano roll visible note index', () => {
  it('finds sustained and boundary notes without mixing sparse track IDs', () => {
    const index = createNoteIndex([
      note('long', 'track-900', 0, 10000),
      note('left', 'track-900', 10, 30),
      note('right', 'track-900', 40, 60),
      note('zero', 'track-900', 35, 35),
      note('other', 'drums', 30, 50),
    ])
    expect(index.query('track-900', 30, 40).map((item) => item.id)).toEqual([
      'long',
      'left',
      'zero',
      'right',
    ])
    expect(index.query('track-900', 9000, 9010).map((item) => item.id)).toEqual(['long'])
    expect(index.query('empty', 0, 10000)).toEqual([])
    expect(index.getPitchRange('empty')).toBeNull()
    expect(index.getTimeRange('track-900')).toEqual({ startTick: 0, endTick: 10000 })
    expect(index.getTimeRange('empty')).toBeNull()
    expect(index.trackIds).toEqual(['track-900', 'drums'])
  })

  it('keeps a precomputed time range for short and leading-offset tracks', () => {
    const index = createNoteIndex([
      note('short', 'short', 240, 360),
      note('tail', 'long', 1_000, 1_200),
    ])
    expect(index.getTimeRange('short')).toEqual({ startTick: 240, endTick: 360 })
    expect(index.getTimeRange('long')).toEqual({ startTick: 1000, endTick: 1200 })
  })

  it('normalizes notes without changing source data and preserves stable IDs', () => {
    const original = note('stable', 'piano', -20, -10, 150)
    const index = createNoteIndex([original, note('invalid', 'piano', Number.NaN, 1)])
    expect(index.size).toBe(1)
    expect(index.query('piano', 0, 0)[0]).toMatchObject({
      id: 'stable',
      startTick: 0,
      endTick: 0,
      pitch: 127,
    })
    expect(original).toMatchObject({ startTick: -20, endTick: -10, pitch: 150 })
    expect(index.getPitchRange('piano')).toEqual({ min: 127, max: 127 })
    expect(index.query('piano', Number.NaN, 100)).toEqual([])
  })

  it('handles 200000 notes and repeatedly queries late windows with an early sustained note', () => {
    const notes: PianoRollNote[] = [note('sustain', 'large', 0, 4_000_000, 0)]
    for (let index = 0; index < 199999; index += 1)
      notes.push(note(String(index), 'large', index * 20, index * 20 + 5, index % 128))
    const index = createNoteIndex(notes)
    expect(index.size).toBe(200000)
    expect(index.getPitchRange('large')).toEqual({ min: 0, max: 127 })
    for (let position = 190000; position < 191000; position += 1) {
      expect(
        index.query('large', position * 20 + 1, position * 20 + 2).map((item) => item.id)
      ).toEqual(['sustain', String(position)])
    }
  })
})
