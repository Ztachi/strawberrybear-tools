import { describe, expect, it } from 'vitest'
import { createNoteIndex, createTimeline, type PianoRollTrack } from '../core'
import { drawGrid, drawNotes, getTrackTimeRange, type RenderFrame } from './renderer'
import { defaultPianoRollTheme } from './theme'

function track(
  id: string,
  bounds: Partial<Pick<PianoRollTrack, 'startTick' | 'endTick'>> = {}
): PianoRollTrack {
  return { id, name: id, enabled: true, isPercussion: false, ...bounds }
}

describe('overview track regions', () => {
  it('uses MIDI metadata for empty tracks without stretching to document duration', () => {
    const index = createNoteIndex([])
    expect(getTrackTimeRange(track('intro', { startTick: 0, endTick: 80 }), index, 4_000)).toEqual({
      startTick: 0,
      endTick: 80,
    })
  })

  it('uses note bounds when metadata is absent and repairs truncated metadata', () => {
    const index = createNoteIndex([
      { id: 'note', trackId: 'music', pitch: 60, velocity: 100, startTick: 240, endTick: 360 },
    ])
    expect(getTrackTimeRange(track('music'), index, 4_000)).toEqual({
      startTick: 240,
      endTick: 360,
    })
    expect(
      getTrackTimeRange(track('music', { startTick: 300, endTick: 320 }), index, 4_000)
    ).toEqual({
      startTick: 240,
      endTick: 360,
    })
  })

  it('clamps bounds to the document and keeps reversed metadata as a marker', () => {
    const index = createNoteIndex([])
    expect(
      getTrackTimeRange(track('marker', { startTick: 9_000, endTick: 8_000 }), index, 4_000)
    ).toEqual({
      startTick: 4_000,
      endTick: 4_000,
    })
  })
})

/** 只替换 Canvas 边界，记录真实渲染逻辑选择的颜色与透明度。 */
function canvasFixture() {
  const fills: { color: string; alpha: number; region: boolean }[] = []
  const context = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    setTransform() {},
    clearRect() {},
    strokeRect() {},
    beginPath() {},
    roundRect() {},
    moveTo() {},
    lineTo() {},
    save() {},
    restore() {},
    rect() {},
    clip() {},
    fillText() {},
    stroke() {},
    measureText: (value: string) => ({ width: value.length * 7 }),
    fillRect() {
      fills.push({ color: this.fillStyle, alpha: this.globalAlpha, region: false })
    },
    fill() {
      fills.push({ color: this.fillStyle, alpha: this.globalAlpha, region: true })
    },
  }
  const canvas = {
    width: 240,
    height: 100,
    style: {},
    ownerDocument: { defaultView: { devicePixelRatio: 1 } },
    getContext: () => context,
  } as unknown as HTMLCanvasElement
  return { canvas, fills }
}

function colorFrame(variant: RenderFrame['variant'], color?: string): RenderFrame {
  const document = {
    ticksPerBeat: 480,
    durationTicks: 1920,
    tempoMap: [],
    timeSignatureMap: [],
    tracks: [{ ...track('music'), ...(color ? { color } : {}) }],
    notes: [{ id: 'note', trackId: 'music', pitch: 60, velocity: 100, startTick: 0, endTick: 480 }],
  }
  return {
    variant,
    timeline: createTimeline(document),
    index: createNoteIndex(document.notes),
    rows: [{ track: document.tracks[0]!, top: 0, height: 100 }],
    selectedTrackId: 'music',
    width: 240,
    height: 100,
    scrollLeft: 0,
    scrollTop: variant === 'editor' ? 640 : 0,
    timeZoom: 120,
    pitchZoom: 10,
  }
}

describe('音轨颜色', () => {
  for (const variant of ['overview', 'editor'] as const) {
    it(`${variant} 使用显式轨道色，缺省时使用主题色`, () => {
      const custom = canvasFixture()
      drawNotes(custom.canvas, colorFrame(variant, '#123456'))
      expect(custom.fills[0]!.color).toBe('#123456')
      const defaults = canvasFixture()
      drawNotes(defaults.canvas, colorFrame(variant))
      expect(defaults.fills[0]!.color).toBe(
        variant === 'overview'
          ? defaultPianoRollTheme.colors.overviewNote
          : defaultPianoRollTheme.colors.editorNote
      )
    })

    it(`${variant} 保留选中和不可演奏状态的颜色优先级`, () => {
      const frame = colorFrame(variant, '#123456')
      frame.editing = { selectedNoteIds: new Set(['note']), highlightPitches: new Set() }
      const selected = canvasFixture()
      drawNotes(selected.canvas, frame)
      expect(selected.fills[0]!.color).toBe(defaultPianoRollTheme.colors.noteSelected)
      frame.editing.selectedNoteIds = new Set()
      const unplayable = canvasFixture()
      drawNotes(unplayable.canvas, frame)
      expect(unplayable.fills[0]!.color).toBe(defaultPianoRollTheme.colors.noteUnplayable)
    })
  }

  it('总览自定义区域和描边不因选轨变回默认色，禁用时降低透明度', () => {
    const frame = colorFrame('overview', '#123456')
    const selected = canvasFixture()
    drawGrid(selected.canvas, canvasFixture().canvas, frame)
    expect(selected.fills.find((fill) => fill.region)).toEqual({
      color: '#123456',
      alpha: 0.2,
      region: true,
    })
    frame.rows[0]!.track.enabled = false
    const disabled = canvasFixture()
    drawGrid(disabled.canvas, canvasFixture().canvas, frame)
    expect(disabled.fills.find((fill) => fill.region)).toEqual({
      color: '#123456',
      alpha: 0.04,
      region: true,
    })
  })
})
