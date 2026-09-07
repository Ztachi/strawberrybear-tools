import { describe, expect, it } from 'vitest'
import type { MidiInfo, NoteEvent } from '@/types'
import { adaptMidiToPianoRoll, applyPianoTrackEnabled } from './pianoRollAdapter'

const note: NoteEvent = {
  id: 'source-note',
  track: 2,
  channel: 0,
  pitch: 60,
  velocity: 100,
  start_tick: 120,
  end_tick: 480,
}
const midi: MidiInfo = {
  filename: 'example.mid',
  file_path: '/example.mid',
  duration_ms: 4000,
  duration_ticks: 3000,
  ticks_per_beat: 480,
  tempo: 625001,
  tempo_map: [{ tick: 0, microseconds_per_quarter: 625001 }],
  time_signature_map: [{ tick: 0, numerator: 7, denominator: 8 }],
  track_count: 3,
  melody_note_count: 1,
  events: [note],
  tracks: [
    {
      id: 'track-2',
      index: 2,
      name: 'Original Piano',
      channel: 0,
      is_percussion: false,
      note_count: 1,
      enabled: true,
    },
  ],
}
const trackName = (index: number): string => `Track ${index}`

describe('MIDI detail document adapter', () => {
  it('keeps empty tracks, raw IDs, exact tempo and full tail duration', () => {
    const document = adaptMidiToPianoRoll(midi, trackName)
    expect(document.tracks.map((track) => [track.id, track.name])).toEqual([
      ['0', 'Track 1'],
      ['1', 'Track 2'],
      ['2', 'Original Piano'],
    ])
    expect(document.durationTicks).toBe(3000)
    expect(document.tempoMap[0]?.microsecondsPerQuarter).toBe(625001)
    expect(document.timeSignatureMap).toEqual([{ tick: 0, numerator: 7, denominator: 8 }])
    expect(document.notes[0]).toMatchObject({ id: 'source-note', trackId: '2', startTick: 120 })
  })

  it('produces repeatable unique legacy IDs and preserves stored silence', () => {
    const legacy: MidiInfo = {
      ...midi,
      tempo: 500000,
      tempo_map: undefined,
      duration_ticks: undefined,
      duration_ms: 2000,
      tracks: undefined,
      events: [
        { ...note, id: '' },
        { ...note, id: '' },
      ],
    }
    const first = adaptMidiToPianoRoll(legacy, trackName)
    const second = adaptMidiToPianoRoll(legacy, trackName)
    expect(first.notes.map((item) => item.id)).toEqual(second.notes.map((item) => item.id))
    expect(new Set(first.notes.map((item) => item.id)).size).toBe(2)
    expect(first.durationTicks).toBe(1920)
  })

  it('maps 1-based disabled tracks without rebuilding notes or changing ticks', () => {
    const source = adaptMidiToPianoRoll(midi, trackName)
    const filtered = applyPianoTrackEnabled(source, new Set([1, 3]))
    expect(filtered.tracks.map((track) => track.enabled)).toEqual([false, true, false])
    expect(filtered.notes).toBe(source.notes)
    expect(filtered.tempoMap).toBe(source.tempoMap)
    expect(source.tracks.every((track) => track.enabled)).toBe(true)
  })

  it('uses source_track beyond 255 without aliasing the legacy keystroke track', () => {
    const document = adaptMidiToPianoRoll(
      {
        ...midi,
        track_count: 259,
        tracks: [],
        events: [{ ...note, id: undefined, source_track: 258, track: 2 }],
      },
      trackName
    )
    expect(document.notes[0]?.trackId).toBe('258')
    expect(document.notes[0]?.id).toMatch(/^note-258-/)
    expect(document.tracks).toHaveLength(259)
  })

  it('converts 200,000 notes without argument-spread limits', () => {
    const events = Array.from({ length: 200_000 }, (_, index) => ({
      ...note,
      id: `note-${index}`,
      start_tick: index,
      end_tick: index + 1,
    }))
    const document = adaptMidiToPianoRoll({ ...midi, duration_ticks: 220_000, events }, trackName)
    expect(document.notes).toHaveLength(200_000)
    expect(document.durationTicks).toBe(220_000)
    expect(document.notes[199_999]?.id).toBe('note-199999')
  })
})
