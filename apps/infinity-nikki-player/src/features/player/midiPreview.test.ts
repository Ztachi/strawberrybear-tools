import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Player } from '@strawberrybear/player'
import type { MidiInfo } from '@/types'
import { MidiPreviewPlaybackFeature } from './midiPreview'

const platform = vi.hoisted(() => ({
  invoke: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  seek: vi.fn(),
  stop: vi.fn(),
  position: 0,
  duration: 10_000,
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: platform.invoke }))
vi.mock('@/lib/midiPlayer', () => ({
  getTotalDuration: () => platform.duration,
  getMidiSourceDurationMs: (midi: MidiInfo) => midi.duration_ms,
  getCurrentTime: () => platform.position,
  playMidi: platform.play,
  pausePreview: platform.pause,
  resumePreview: platform.resume,
  seekTo: platform.seek,
  stopPreview: platform.stop,
  setPreviewSpeed: vi.fn(),
  setDisabledTracks: vi.fn(),
  setVolume: vi.fn(),
}))

const midi: MidiInfo = {
  filename: 'a.mid',
  file_path: '/a.mid',
  duration_ms: 10_000,
  duration_ticks: 9600,
  ticks_per_beat: 480,
  tempo: 500000,
  tempo_map: [{ tick: 0, microseconds_per_quarter: 500000 }],
  track_count: 1,
  melody_note_count: 0,
  events: [],
}
let feature: MidiPreviewPlaybackFeature
let player: Player
let document: EventTarget & { visibilityState: string }
let frames: Map<number, (time: number) => void>

/** 用实际显示帧边界驱动采样；推进墙钟本身不会偷偷生成可见页面帧。 */
function renderFrame(): void {
  const callbacks = [...frames.values()]
  frames.clear()
  for (const callback of callbacks) callback(performance.now())
}

function setVisibility(state: 'visible' | 'hidden'): void {
  document.visibilityState = state
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', document)
  frames = new Map()
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.clearAllMocks()
  platform.position = 0
  platform.duration = 10_000
  platform.invoke.mockResolvedValue([1, 2, 3])
  platform.play.mockImplementation(async (_data, _speed, options) => {
    platform.position = options.positionMs ?? 0
  })
  platform.seek.mockImplementation((position) => {
    platform.position = position
  })
  platform.stop.mockImplementation(() => {
    platform.position = 0
  })
  platform.resume.mockResolvedValue(undefined)
  feature = new MidiPreviewPlaybackFeature()
  player = new Player({ audio: feature })
  feature.bindPlayer(player)
  feature.syncMidiQueue([midi], midi)
})
afterEach(() => {
  feature.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MIDI 试听平台适配', () => {
  it('reads the audio clock rather than advancing a wall-clock progress timer', async () => {
    await player.play()
    vi.advanceTimersByTime(2000)
    expect(player.getState().positionSeconds).toBe(0)
    platform.position = 1250
    vi.advanceTimersByTime(16)
    expect(player.getState().positionSeconds).toBe(0)
    renderFrame()
    expect(player.getState().positionSeconds).toBe(1.25)
    vi.advanceTimersByTime(1000)
    renderFrame()
    expect(player.getState().positionSeconds).toBe(1.25)
  })

  it('publishes one fresh audio sample per display frame at different refresh rates', async () => {
    await player.play()
    const progress = vi.spyOn(player, 'updateProgress')
    for (const frameDuration of [8, 9, 16, 33]) {
      vi.advanceTimersByTime(frameDuration)
      platform.position += frameDuration
      renderFrame()
      expect(player.getState().positionSeconds).toBe(platform.position / 1000)
      expect(frames.size).toBe(1)
    }
    expect(progress).toHaveBeenCalledTimes(4)
  })

  it('preserves local drag previews and samples the audio clock again after release', async () => {
    await player.play()
    feature.setDragging(true)
    feature.setPreviewTime(3200)
    platform.position = 1500
    renderFrame()
    expect(player.getState().positionSeconds).toBe(3.2)
    feature.setDragging(false)
    renderFrame()
    expect(player.getState().positionSeconds).toBe(1.5)
  })

  it('switches between display frames and background samples without reviving stale callbacks', async () => {
    await player.play()
    const staleFrame = [...frames.values()][0]!
    const progress = vi.spyOn(player, 'updateProgress')
    const backgroundTimer = vi.spyOn(window, 'setTimeout')
    setVisibility('hidden')
    expect(frames.size).toBe(0)
    platform.position = 1500
    staleFrame(0)
    expect(progress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(249)
    expect(progress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(progress).toHaveBeenCalledTimes(1)
    expect(player.getState().positionSeconds).toBe(1.5)
    const staleBackgroundTick = backgroundTimer.mock.calls.at(-1)![0] as () => void
    setVisibility('visible')
    platform.position = 2200
    staleBackgroundTick()
    vi.advanceTimersByTime(250)
    expect(progress).toHaveBeenCalledTimes(1)
    renderFrame()
    expect(progress).toHaveBeenCalledTimes(2)
    expect(player.getState().positionSeconds).toBe(2.2)
    expect(frames.size).toBe(1)
  })

  it('continues automatic next-song playback while the document is hidden', async () => {
    const next = { ...midi, filename: 'b.mid', file_path: '/b.mid' }
    feature.syncMidiQueue([midi, next], midi)
    setVisibility('hidden')
    await player.play()
    const ended = vi.spyOn(player, 'handleEnded')
    platform.position = platform.duration
    vi.advanceTimersByTime(250)
    expect(ended).toHaveBeenCalledTimes(1)
    await ended.mock.results[0]!.value
    expect(player.getState().current?.id).toBe('b.mid')
    expect(platform.play).toHaveBeenCalledTimes(2)
    expect(frames.size).toBe(0)
  })

  it('ignores a queued frame after pause and creates just one sampler on resume', async () => {
    await player.play()
    const staleFrame = [...frames.values()][0]!
    platform.position = 2000
    await player.pause()
    const progress = vi.spyOn(player, 'updateProgress')
    platform.position = 3000
    staleFrame(0)
    expect(progress).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    expect(player.getState().positionSeconds).toBe(2)
    await player.resume()
    expect(frames.size).toBe(1)
    renderFrame()
    expect(progress).toHaveBeenCalledTimes(1)
    expect(player.getState().positionSeconds).toBe(3)
  })

  it('invalidates pre-seek frames and reads only the new audio position', async () => {
    await player.play()
    const staleFrame = [...frames.values()][0]!
    await feature.seekMs(6000)
    const progress = vi.spyOn(player, 'updateProgress')
    staleFrame(0)
    expect(progress).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    platform.position = 6100
    renderFrame()
    expect(progress).toHaveBeenCalledTimes(1)
    expect(player.getState().positionSeconds).toBe(6.1)
  })

  it('invalidates old-song frames when a new source starts', async () => {
    await player.play()
    const staleFrame = [...frames.values()][0]!
    const next = { ...midi, filename: 'b.mid', file_path: '/b.mid' }
    await feature.start(next, [midi, next])
    const progress = vi.spyOn(player, 'updateProgress')
    platform.position = 500
    staleFrame(0)
    expect(progress).not.toHaveBeenCalled()
    renderFrame()
    expect(progress).toHaveBeenCalledTimes(1)
    expect(player.getState().current?.id).toBe('b.mid')
    expect(player.getState().positionSeconds).toBe(0.5)
  })

  it.each(['visible', 'hidden'] as const)(
    'cleans up %s sampling and visibility listeners on dispose',
    async (visibility) => {
      setVisibility(visibility)
      await player.play()
      const staleFrame = [...frames.values()][0]
      feature.dispose()
      const progress = vi.spyOn(player, 'updateProgress')
      setVisibility(visibility === 'visible' ? 'hidden' : 'visible')
      staleFrame?.(0)
      vi.advanceTimersByTime(1000)
      renderFrame()
      expect(progress).not.toHaveBeenCalled()
      expect(frames.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('seeks while paused and resumes the prepared audio session without reloading', async () => {
    await player.play()
    platform.position = 2000
    await player.pause()
    await feature.seekMs(4500)
    expect(platform.seek).toHaveBeenLastCalledWith(4500, { autoPlay: false })
    expect(player.getState().status).toBe('paused')
    await player.resume()
    expect(platform.resume).toHaveBeenCalledTimes(1)
    expect(platform.play).toHaveBeenCalledTimes(1)
    expect(player.getState().positionSeconds).toBe(4.5)
  })

  it('prepares a first seek silently, then resumes that exact position', async () => {
    await feature.seekMs(3000)
    expect(platform.play).toHaveBeenCalledWith(expect.any(ArrayBuffer), 1, {
      midi,
      positionMs: 3000,
      autoPlay: false,
    })
    expect(player.getState().status).toBe('paused')
    await player.resume()
    expect(platform.resume).toHaveBeenCalledTimes(1)
    expect(platform.play).toHaveBeenCalledTimes(1)
  })

  it('ignores an older same-song read that resolves after a newer seek', async () => {
    const reads: Array<(value: number[]) => void> = []
    platform.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          reads.push(resolve)
        })
    )
    const first = feature.seekMs(1000)
    await Promise.resolve()
    const second = feature.seekMs(7000)
    await Promise.resolve()
    reads[1]!([2])
    await second
    reads[0]!([1])
    await first
    expect(platform.play).toHaveBeenCalledTimes(1)
    expect(platform.position).toBe(7000)
    expect(player.getState().positionSeconds).toBe(7)
  })

  it('replaces a stale loaded source when only the public queue selection changed', async () => {
    await player.play()
    const next = { ...midi, filename: 'b.mid', file_path: '/b.mid' }
    feature.syncMidiQueue([midi, next], next)
    await feature.seekMs(4000)
    expect(platform.invoke).toHaveBeenLastCalledWith('read_midi_data', { filename: '/b.mid' })
    expect(platform.play).toHaveBeenLastCalledWith(
      expect.any(ArrayBuffer),
      1,
      expect.objectContaining({ midi: next, positionMs: 4000 })
    )
    expect(player.getState().current?.id).toBe('b.mid')
  })

  it('cancels pending source reads on stop', async () => {
    let finish!: (value: number[]) => void
    platform.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const pending = feature.seekMs(2000)
    await Promise.resolve()
    await player.stop()
    finish([1])
    await pending
    expect(platform.play).not.toHaveBeenCalled()
    expect(player.getState().status).toBe('stopped')
  })
})
