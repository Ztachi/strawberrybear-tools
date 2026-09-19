import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import { createEditorTransport, type SynthPort } from './transport'

/** 120 BPM，PPQ 480：一拍 0.5s。 */
const document: PianoRollDocument = {
  durationTicks: 1920,
  ticksPerBeat: 480,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500_000 }],
  timeSignatureMap: [],
  tracks: [
    { id: 't', name: 'T', isPercussion: false, enabled: true },
    { id: 'muted', name: 'M', isPercussion: false, enabled: false },
  ],
  notes: [
    { id: 'a', trackId: 't', pitch: 60, velocity: 100, startTick: 0, endTick: 480 },
    { id: 'b', trackId: 't', pitch: 62, velocity: 100, startTick: 480, endTick: 960 },
    { id: 'c', trackId: 't', pitch: 64, velocity: 100, startTick: 960, endTick: 1440 },
    { id: 'm', trackId: 'muted', pitch: 40, velocity: 100, startTick: 0, endTick: 480 },
  ],
}

function createSynth() {
  const events: { type: string; pitch: number; when: number }[] = []
  const synth: SynthPort = {
    noteOn: (pitch, _velocity, when) => events.push({ type: 'on', pitch, when }),
    noteOff: (pitch, when) => events.push({ type: 'off', pitch, when }),
    allNotesOff: () => events.push({ type: 'all', pitch: -1, when: -1 }),
  }
  return { synth, events }
}

describe('createEditorTransport', () => {
  let clock = 0
  beforeEach(() => {
    vi.useFakeTimers()
    clock = 100
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function advance(ms: number) {
    clock += ms / 1000
    vi.advanceTimersByTime(ms)
  }

  it('schedules enabled notes ahead of the clock and ends naturally', () => {
    const { synth, events } = createSynth()
    const ended = vi.fn()
    const transport = createEditorTransport({
      getDocument: () => document,
      synth,
      now: () => clock,
      lookaheadSeconds: 0.2,
      intervalMs: 50,
      onEnded: ended,
    })
    transport.play()
    expect(events.filter((e) => e.type === 'on').map((e) => e.pitch)).toEqual([60])
    expect(events[0]!.when).toBe(100)
    advance(400)
    expect(events.filter((e) => e.type === 'on').map((e) => e.pitch)).toEqual([60, 62])
    expect(events.find((e) => e.type === 'on' && e.pitch === 62)!.when).toBeCloseTo(100.5)
    // 禁用轨永不发声
    expect(events.some((e) => e.pitch === 40)).toBe(false)
    advance(1700)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(transport.getState().isPlaying).toBe(false)
    expect(transport.getState().positionSeconds).toBe(2)
  })

  it('loops between ticks and truncates tails at loop end', () => {
    const { synth, events } = createSynth()
    const transport = createEditorTransport({
      getDocument: () => document,
      synth,
      now: () => clock,
      lookaheadSeconds: 0.1,
      intervalMs: 50,
    })
    transport.setLoop({ startTick: 0, endTick: 720 })
    transport.play()
    advance(1200)
    const ons = events.filter((e) => e.type === 'on')
    // 0.75s 一轮：60@0, 62@0.5, 60@0.75, 62@1.25...
    expect(ons.slice(0, 4).map((e) => [e.pitch, Math.round((e.when - 100) * 100) / 100])).toEqual([
      [60, 0],
      [62, 0.5],
      [60, 0.75],
      [62, 1.25],
    ])
    const offFor62 = events.find((e) => e.type === 'off' && e.pitch === 62)!
    expect(offFor62.when).toBeCloseTo(100.75)
    expect(transport.getState().positionSeconds).toBeLessThan(0.75)
    transport.dispose()
  })

  it('pauses, seeks and changes rate without double scheduling', () => {
    const { synth, events } = createSynth()
    const transport = createEditorTransport({ getDocument: () => document, synth, now: () => clock })
    transport.play()
    advance(300)
    transport.pause()
    expect(transport.getState().isPlaying).toBe(false)
    expect(transport.getState().positionSeconds).toBeCloseTo(0.3)
    expect(events.at(-1)!.type).toBe('all')
    transport.seek(1)
    expect(transport.getState().positionSeconds).toBe(1)
    transport.play()
    expect(events.filter((e) => e.type === 'on').at(-1)!.pitch).toBe(64)
    transport.setRate(2)
    expect(transport.getState().playbackRate).toBe(2)
    advance(300)
    // 1s 起点 + 0.3s × 2 倍速 = 1.6s，尚未结束
    expect(transport.getState().positionSeconds).toBeCloseTo(1.6)
    advance(300)
    expect(transport.getState().isPlaying).toBe(false)
    transport.dispose()
  })
})
