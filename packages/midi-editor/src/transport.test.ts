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
  it('每轨限制独立于全曲长度，裁剪尾音并忽略边界上的音符，拉长后重新可播', () => {
    const { synth, events } = createSynth()
    let current = {
      ...document,
      tracks: [
        { ...document.tracks[0]!, endTick: 720 },
        { ...document.tracks[1]!, enabled: true, endTick: 1920 },
      ],
    }
    const transport = createEditorTransport({
      getDocument: () => current,
      synth,
      now: () => clock,
      lookaheadSeconds: 2,
    })
    transport.play()
    expect(events.filter((e) => e.type === 'on').map((e) => e.pitch)).toEqual([60, 40, 62])
    expect(events.find((e) => e.type === 'off' && e.pitch === 62)!.when).toBeCloseTo(clock + 0.75)
    transport.stop()
    events.length = 0
    current = { ...current, tracks: [{ ...current.tracks[0]!, endTick: 1440 }, current.tracks[1]!] }
    transport.invalidate()
    transport.play()
    expect(events.filter((e) => e.type === 'on').map((e) => e.pitch)).toEqual([60, 40, 62, 64])
    transport.dispose()
  })
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

  it('长音中间续播恢复尾音，循环接管下一轮时保持声部和实时位置', () => {
    const { synth, events } = createSynth()
    const current = {
      ...document,
      notes: [{ id: 'held', trackId: 't', pitch: 60, velocity: 100, startTick: 0, endTick: 1440 }],
    }
    const transport = createEditorTransport({ getDocument: () => current, synth, now: () => clock })
    transport.setLoop({ startTick: 480, endTick: 960 })
    transport.seek(0.75)
    transport.play()
    expect(events.filter((event) => event.type === 'on')).toEqual([
      { type: 'on', pitch: 60, when: 100 },
    ])
    expect(events.find((event) => event.type === 'off')!.when).toBeCloseTo(100.25)
    advance(200)
    // lookahead 已预排下一轮，但真实播放头此刻仍在本轮 0.95 秒，不能提前跳回起点。
    expect(transport.getState().positionSeconds).toBeCloseTo(0.95)
    expect(events.filter((event) => event.type === 'on').map((event) => event.when)).toEqual([
      100, 100.25,
    ])
    transport.dispose()
  })

  it('缩短歌曲后循环区裁剪到新终点，超出歌曲的循环取消，停止时立即通知', () => {
    const { synth } = createSynth()
    let current = document
    const changed = vi.fn()
    const transport = createEditorTransport({
      getDocument: () => current,
      synth,
      now: () => clock,
      onChange: changed,
    })
    transport.setLoop({ startTick: 480, endTick: 1920 })
    current = { ...document, durationTicks: 960 }
    transport.invalidate()
    expect(transport.getState().loop).toEqual({ startSeconds: 0.5, endSeconds: 1 })
    transport.setLoop({ startTick: 1440, endTick: 1920 })
    expect(transport.getState().loop).toBeNull()
    transport.seek(0.9)
    transport.play()
    current = { ...document, durationTicks: 480 }
    transport.invalidate()
    expect(transport.getState().positionSeconds).toBe(0.5)
    expect(transport.getState().isPlaying).toBe(false)
    expect(changed.mock.calls.at(-1)![0].durationSeconds).toBe(0.5)
    transport.dispose()
  })

  it('pauses, seeks and changes rate without double scheduling', () => {
    const { synth, events } = createSynth()
    const transport = createEditorTransport({
      getDocument: () => document,
      synth,
      now: () => clock,
    })
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
