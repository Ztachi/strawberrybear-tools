import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { MidiInfo } from '@/types'
import { usePlayerStore } from './player'

const platform = vi.hoisted(() => ({ invoke: vi.fn(), setDisabledTracks: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: platform.invoke }))
vi.mock('@/lib/feedback', () => ({ feedback: { error: vi.fn(), success: vi.fn() } }))
vi.mock('./settings', () => ({ useSettingsStore: () => ({ setLastPreviewSelection: vi.fn() }) }))
vi.mock('./songLists', () => ({ useSongListStore: () => ({ songLists: [] }) }))
vi.mock('@/lib/midiPlayer', () => ({
  getMidiSourceDurationMs: (midi: MidiInfo) => midi.duration_ms,
  setNoteFilter: vi.fn(),
  setPitchMapper: vi.fn(),
  ensureInstrument: vi.fn(),
  setOnActiveNotesChange: vi.fn(),
  setDisabledTracks: platform.setDisabledTracks,
}))

const first: MidiInfo = {
  filename: 'a.mid',
  file_path: '/a.mid',
  duration_ms: 1000,
  duration_ticks: 960,
  tempo_map: [{ tick: 0, microseconds_per_quarter: 500000 }],
  ticks_per_beat: 480,
  tempo: 500000,
  track_count: 2,
  melody_note_count: 1,
  tracks: [
    { id: 'track-0', index: 0, name: '', note_count: 0, is_percussion: false, enabled: true },
    { id: 'track-1', index: 1, name: '', note_count: 1, is_percussion: false, enabled: true },
  ],
  events: [{ pitch: 60, velocity: 100, start_tick: 0, end_tick: 480, channel: 0, track: 1 }],
}
const second = { ...first, filename: 'b.mid', file_path: '/b.mid' }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('MIDI 详情请求隔离', () => {
  it('does not let an old detail configuration overwrite a newer song or raw timeline', async () => {
    let finishFirst!: (value: unknown) => void
    let markConfigStarted!: () => void
    const configStarted = new Promise<void>((resolve) => {
      markConfigStarted = resolve
    })
    const store = usePlayerStore()
    store.midiLibrary = [{ ...first }, { ...second }]
    platform.invoke.mockImplementation((command, args) => {
      if (command === 'load_midi_config') {
        if (args.filename === first.filename)
          return new Promise((resolve) => {
            finishFirst = resolve
            markConfigStarted()
          })
        return Promise.resolve({
          disabled_tracks: [2],
          duration_ms: 99_999,
          tempo: 600_000,
          ticks_per_beat: 960,
        })
      }
      return Promise.resolve([])
    })
    const old = store.loadMidiDetailByFilename(first.filename)
    await configStarted
    await store.loadMidiDetailByFilename(second.filename)
    finishFirst({ disabled_tracks: [1], duration_ms: 20_000 })
    await old
    expect(store.detailMidi?.filename).toBe(second.filename)
    expect([...store.detailDisabledTracks]).toEqual([2])
    expect(store.detailMidi?.duration_ms).toBe(1000)
    expect(store.detailMidi?.ticks_per_beat).toBe(480)
    expect(store.isDetailLoading).toBe(false)
  })

  it('toggles an empty raw track by numeric document ID and saves the clicked song', async () => {
    const store = usePlayerStore()
    store.midiLibrary = [{ ...first }, { ...second }]
    platform.invoke.mockImplementation((command) =>
      Promise.resolve(command === 'load_midi_config' ? { disabled_tracks: [] } : [])
    )
    await store.loadMidiDetailByFilename(first.filename)
    store.toggleDetailTrackById('0')
    await store.loadMidiDetailByFilename(second.filename)
    expect(platform.invoke).toHaveBeenCalledWith(
      'save_midi_config',
      expect.objectContaining({ filename: first.filename, disabledTracks: [1] })
    )
    expect([...store.detailDisabledTracks]).toEqual([])
  })
})
