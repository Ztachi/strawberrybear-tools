import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MidiPlayer from 'midi-player-js'
import type { MidiInfo } from '@/types'
import type * as MidiRuntime from './midiPlayer'

const sound = vi.hoisted(() => ({ instrument: vi.fn(), play: vi.fn(), stop: vi.fn() }))
vi.mock('soundfont-player', () => ({ default: { instrument: sound.instrument } }))

/** 音频时间由测试显式推进，墙钟和计时器不会改变它。 */
class TestAudioContext {
  currentTime = 10
  state = 'running'
  destination = {}
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  createGain = () => ({ gain: { setTargetAtTime: vi.fn() }, connect: vi.fn() })
  createDynamicsCompressor = () => ({
    threshold: {},
    knee: {},
    ratio: {},
    attack: {},
    release: {},
    connect: vi.fn(),
  })
}

/** 两段非整数 BPM；前一拍静音、最后一拍静音，长音跨越 tempo 点。 */
const midi: MidiInfo = {
  filename: 'tempo.mid',
  file_path: '/tempo.mid',
  ticks_per_beat: 480,
  tempo: 500001,
  duration_ms: 1666,
  duration_ticks: 1920,
  tempo_map: [
    { tick: 0, microseconds_per_quarter: 500001 },
    { tick: 960, microseconds_per_quarter: 333333 },
  ],
  time_signature_map: [],
  track_count: 1,
  melody_note_count: 1,
  events: [
    {
      id: 'note-0-0-0',
      pitch: 60,
      velocity: 100,
      start_tick: 480,
      end_tick: 1440,
      track: 0,
      channel: 0,
    },
  ],
}

/** 编码与 Rust fixture 对应的真实 SMF，游戏事件表仍由原 midi-player-js 编译。 */
function midiBuffer(): ArrayBuffer {
  const track = [
    0, 255, 81, 3, 7, 161, 33, 131, 96, 144, 60, 100, 131, 96, 255, 81, 3, 5, 22, 21, 131, 96, 128,
    60, 0, 131, 96, 255, 47, 0,
  ]
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    1,
    0,
    1,
    1,
    224,
    77,
    84,
    114,
    107,
    0,
    0,
    0,
    track.length,
    ...track,
  ]).buffer
}

let runtime: typeof MidiRuntime
let context: TestAudioContext

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('AudioContext', TestAudioContext)
  sound.play.mockReset().mockImplementation(() => ({ stop: sound.stop }))
  sound.instrument.mockReset().mockResolvedValue({ play: sound.play })
  runtime = await import('./midiPlayer')
})
afterEach(() => {
  runtime.stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('试听权威时间轴', () => {
  it('uses raw microseconds, complete end tick and cross-tempo note duration', async () => {
    await runtime.playMidi(midiBuffer(), 1, { midi })
    expect(sound.play).toHaveBeenCalledWith(
      'C4',
      10.500001,
      expect.objectContaining({ duration: 0.833334 })
    )
    expect(runtime.getTotalDuration()).toBeCloseTo(1666.668, 6)
    expect(runtime.getCurrentTime()).toBe(0)
  })

  it.each([0.5, 1, 2])(
    'advances only with AudioContext at %sx and preserves keyboard input',
    async (speed) => {
      const legacy = new MidiPlayer.Player()
      legacy.loadArrayBuffer(midiBuffer())
      ;(legacy as MidiPlayer.Player & { setTempo(tempo: number): void }).setTempo(
        legacy.tempo * speed
      )
      await runtime.playMidi(midiBuffer(), speed, { midi })
      context = runtime.getAudioContext() as unknown as TestAudioContext
      vi.advanceTimersByTime(10_000)
      expect(runtime.getCurrentTime()).toBe(0)
      context.currentTime += 0.2
      expect(runtime.getCurrentTime()).toBeCloseTo(200 * speed)
      expect(runtime.getKeyboardNoteSchedule()).toEqual([
        {
          targetPitch: 60,
          startMs: legacy.ticksToSeconds(0, 480) * 1000,
          durationMs: (legacy.ticksToSeconds(0, 1440) - legacy.ticksToSeconds(0, 480)) * 1000,
        },
      ])
    }
  )

  it('reanchors speed and resumes a paused seek without playing from zero', async () => {
    await runtime.playMidi(midiBuffer(), 1, { midi })
    context = runtime.getAudioContext() as unknown as TestAudioContext
    context.currentTime += 0.2
    runtime.setPreviewSpeed(2)
    expect(runtime.getCurrentTime()).toBeCloseTo(200)
    context.currentTime += 0.2
    expect(runtime.getCurrentTime()).toBeCloseTo(600)
    runtime.pause()
    sound.play.mockClear()
    runtime.seekTo(800, { autoPlay: false })
    expect(sound.play).not.toHaveBeenCalled()
    context.currentTime += 10
    expect(runtime.getCurrentTime()).toBe(800)
    await runtime.resume()
    expect(sound.play).toHaveBeenCalledWith(
      'C4',
      context.currentTime,
      expect.objectContaining({ duration: 0.2666675 })
    )
    context.currentTime += 0.1
    expect(runtime.getCurrentTime()).toBeCloseTo(1000)
  })

  it('prepares an initial paused seek silently and honors disabled raw track indices', async () => {
    await runtime.playMidi(midiBuffer(), 1, { midi, positionMs: 700, autoPlay: false })
    expect(sound.play).not.toHaveBeenCalled()
    expect(runtime.getCurrentTime()).toBe(700)
    runtime.setDisabledTracks(new Set([1]))
    await runtime.resume()
    expect(sound.play).not.toHaveBeenCalled()
  })

  it('uses the complete source track for preview muting beyond 255 tracks', async () => {
    runtime.setDisabledTracks(new Set([1]))
    await runtime.playMidi(midiBuffer(), 1, {
      midi: { ...midi, events: midi.events.map((note) => ({ ...note, source_track: 256 })) },
    })
    expect(sound.play).toHaveBeenCalledTimes(1)
    sound.play.mockClear()
    runtime.setDisabledTracks(new Set([257]))
    expect(sound.play).not.toHaveBeenCalled()
  })

  it('cancels a pending AudioContext resume when the user pauses again', async () => {
    await runtime.playMidi(midiBuffer(), 1, { midi, positionMs: 700, autoPlay: false })
    context = runtime.getAudioContext() as unknown as TestAudioContext
    context.state = 'suspended'
    let finish!: () => void
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const pending = runtime.resume()
    runtime.pause()
    finish()
    await pending
    expect(sound.play).not.toHaveBeenCalled()
    context.currentTime += 1
    expect(runtime.getCurrentTime()).toBe(700)
  })

  it('invalidates pending audio initialization on stop and newer song requests', async () => {
    let finish!: (value: { play: typeof sound.play }) => void
    sound.instrument.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const first = runtime.playMidi(midiBuffer(), 1, { midi })
    runtime.stop()
    const second = runtime.playMidi(midiBuffer(), 1, {
      midi: { ...midi, events: [] },
      positionMs: 600,
      autoPlay: false,
    })
    finish({ play: sound.play })
    await Promise.all([first, second])
    expect(sound.instrument).toHaveBeenCalledTimes(1)
    expect(sound.play).not.toHaveBeenCalled()
    expect(runtime.getCurrentTime()).toBe(600)
  })
})
