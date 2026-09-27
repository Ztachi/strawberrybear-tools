import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '@strawberrybear/midi-editor'
import { createMidiEditorPlaybackController } from './playbackController'

afterEach(() => vi.useRealTimers())

describe('MIDI editor playback controller', () => {
  it('advances from the audio clock owned by its own window and resumes from the paused position', async () => {
    vi.useFakeTimers()
    let audioClock = 10
    const project = createProject({
      name: 'Detached playback',
      document: {
        ticksPerBeat: 480,
        durationTicks: 1920,
        tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
        timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
        tracks: [{ id: 'track', name: 'Track', enabled: true, isPercussion: false }],
        notes: [],
      },
    })
    const controller = createMidiEditorPlaybackController({
      getDocument: () => project.document,
      getLoop: () => null,
      ensureAudio: async () => {},
      getAudioClock: () => audioClock,
      scheduleNote: () => null,
    })

    await controller.play()
    audioClock += 0.75
    expect(controller.getState().positionSeconds).toBeCloseTo(0.75)

    controller.pause()
    audioClock += 3
    expect(controller.getState().positionSeconds).toBeCloseTo(0.75)

    await controller.play()
    audioClock += 0.25
    expect(controller.getState().positionSeconds).toBeCloseTo(1)
    controller.dispose()
  })
})
