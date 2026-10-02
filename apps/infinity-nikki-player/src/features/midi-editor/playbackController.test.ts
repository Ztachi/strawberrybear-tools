import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditorSession, createProject } from '@strawberrybear/midi-editor'
import { createMidiEditorPlaybackController } from './playbackController'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'

afterEach(() => vi.useRealTimers())

describe('MIDI editor playback controller', () => {
  it('切换项目期间文档为空时停止旧试听，载入新文档后可以重新播放', async () => {
    vi.useFakeTimers()
    let document: PianoRollDocument | null = previewProject().document
    const changed = vi.fn()
    const stop = vi.fn()
    const schedule = vi.fn(() => ({ stop }))
    const controller = createMidiEditorPlaybackController({
      getDocument: () => document,
      getLoop: () => null,
      ensureAudio: async () => {},
      getAudioClock: () => 10,
      scheduleNote: schedule,
      onChange: changed,
    })
    await controller.play()
    document = null
    expect(() => controller.invalidate()).not.toThrow()
    expect(stop).toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({
      isPlaying: false,
      durationSeconds: 0,
      positionSeconds: 0,
    })
    controller.stop()
    controller.seek(1)
    await controller.play()
    document = previewProject().document
    controller.invalidate()
    await controller.play()
    expect(controller.getState().isPlaying).toBe(true)
    controller.dispose()
  })
  it('未初始化音频时缩短曲长也会裁剪播放位置并通知界面', () => {
    const session = createEditorSession(previewProject())
    const changed = vi.fn()
    const controller = createMidiEditorPlaybackController({
      getDocument: () => session.getState().document,
      getLoop: () => null,
      onChange: changed,
    })
    controller.seek(1.5)
    session.dispatch({ type: 'resize-track-region', trackId: 'track', endTick: 480 })
    controller.invalidate()
    expect(controller.getState().positionSeconds).toBe(0.5)
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ durationSeconds: 0.5, positionSeconds: 0.5 })
    )
    controller.dispose()
  })
  it('同一音符每次点击都按传入时长重新排程', async () => {
    const project = previewProject()
    const schedule = vi.fn(() => ({ stop: vi.fn() }))
    const controller = createMidiEditorPlaybackController({
      getDocument: () => project.document,
      getLoop: () => null,
      ensureAudio: async () => {},
      getAudioClock: () => 10,
      scheduleNote: schedule,
    })
    await controller.audition(60, 100, 1.25)
    await controller.audition(60, 100, 1.25)
    expect(schedule.mock.calls).toEqual([
      [60, 100, 10, 1.25],
      [60, 100, 10, 1.25],
    ])
    controller.dispose()
  })
  function previewProject() {
    return createProject({
      name: '模板试听回归',
      document: {
        ticksPerBeat: 480,
        durationTicks: 1920,
        tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
        timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
        tracks: [{ id: 'track', name: '音轨', enabled: true, isPercussion: false, endTick: 1920 }],
        notes: [60, 61, 67].map((pitch) => ({
          id: String(pitch),
          trackId: 'track',
          pitch,
          velocity: 100,
          startTick: 0,
          endTick: 480,
        })),
      },
    })
  }

  it('开启时仅排程模板内原音高，关闭时完整试听，文档和时长不变', async () => {
    vi.useFakeTimers()
    const project = previewProject()
    const original = JSON.stringify(project.document)
    let pitches: ReadonlySet<number> | null = new Set([60, 67])
    const schedule = vi.fn((_pitch: number, _velocity: number, _when: number) => ({
      stop: vi.fn(),
    }))
    const controller = createMidiEditorPlaybackController({
      getDocument: () => project.document,
      getLoop: () => null,
      getPlayablePitches: () => pitches,
      ensureAudio: async () => {},
      getAudioClock: () => 10,
      scheduleNote: schedule,
    })
    await controller.play()
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([60, 67])
    expect(controller.getState().durationSeconds).toBe(2)
    controller.stop()
    pitches = null
    controller.invalidate()
    schedule.mockClear()
    await controller.play()
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([60, 61, 67])
    expect(JSON.stringify(project.document)).toBe(original)
    controller.dispose()
  })

  it('播放中换模板取消旧排程，从当前位置继续；空模板保持静音', async () => {
    vi.useFakeTimers()
    const project = previewProject()
    // 第二批音符用于确认切换后不会沿用已编译的旧模板范围。
    project.document.notes.push(
      ...project.document.notes.map((note) => ({
        ...note,
        id: `${note.id}-next`,
        startTick: 480,
        endTick: 960,
      }))
    )
    let pitches: ReadonlySet<number> | null = new Set([60])
    let clock = 10
    const handles: { stop: ReturnType<typeof vi.fn> }[] = []
    const schedule = vi.fn((_pitch: number, _velocity: number, _when: number) => {
      const handle = { stop: vi.fn() }
      handles.push(handle)
      return handle
    })
    const controller = createMidiEditorPlaybackController({
      getDocument: () => project.document,
      getLoop: () => null,
      getPlayablePitches: () => pitches,
      ensureAudio: async () => {},
      getAudioClock: () => clock,
      scheduleNote: schedule,
    })
    await controller.play()
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([60])
    clock = 10.2
    pitches = new Set([67])
    controller.invalidate()
    expect(handles[0]!.stop).toHaveBeenLastCalledWith()
    expect(controller.getState().isPlaying).toBe(true)
    expect(controller.getState().positionSeconds).toBeCloseTo(0.2)
    schedule.mockClear()
    clock = 10.4
    vi.advanceTimersByTime(25)
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([67])
    pitches = new Set()
    controller.invalidate()
    controller.stop()
    schedule.mockClear()
    await controller.play()
    expect(schedule).not.toHaveBeenCalled()
    expect(controller.getState().durationSeconds).toBe(2)
    controller.dispose()
  })

  it('单音试听同样过滤，切换模板停止旧单音，初始化期间换模板也不会漏音', async () => {
    vi.useFakeTimers()
    const project = previewProject()
    let pitches: ReadonlySet<number> | null = new Set([60])
    const stop = vi.fn()
    const schedule = vi.fn(
      (_pitch: number, _velocity: number, _when: number, _duration?: number) => ({ stop })
    )
    let ready = Promise.resolve()
    const controller = createMidiEditorPlaybackController({
      getDocument: () => project.document,
      getLoop: () => null,
      getPlayablePitches: () => pitches,
      ensureAudio: () => ready,
      getAudioClock: () => 10,
      scheduleNote: schedule,
    })
    await controller.audition(61, 100)
    expect(schedule).not.toHaveBeenCalled()
    await controller.audition(60, 100)
    expect(schedule).toHaveBeenCalledWith(60, 100, 10, 0.35)
    pitches = new Set([67])
    controller.invalidate()
    expect(stop).toHaveBeenCalledWith()
    schedule.mockClear()
    let resolve!: () => void
    ready = new Promise<void>((done) => {
      resolve = done
    })
    const pending = controller.audition(67, 100)
    pitches = new Set([60])
    resolve()
    await pending
    expect(schedule).not.toHaveBeenCalled()
    pitches = null
    await controller.audition(61, 100)
    expect(schedule).toHaveBeenCalledWith(61, 100, 10, 0.35)
    controller.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

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
        tracks: [{ id: 'track', name: 'Track', enabled: true, isPercussion: false, endTick: 1920 }],
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
