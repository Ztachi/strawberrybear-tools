import { describe, expect, it } from 'vitest'
import { createNoteIndex, createTimeline, type PianoRollTrack } from '../core'
import {
  drawGrid,
  drawKeyboard,
  drawPitchActivity,
  drawNotes,
  getTrackTimeRange,
  type RenderFrame,
} from './renderer'
import { defaultPianoRollTheme } from './theme'

function track(
  id: string,
  bounds: Partial<Pick<PianoRollTrack, 'startTick' | 'endTick'>> = {}
): PianoRollTrack {
  return { id, name: id, enabled: true, isPercussion: false, ...bounds }
}

describe('overview track regions', () => {
  it('编辑态严格使用裁剪边界，不让隐藏音符撑回区域', () => {
    const index = createNoteIndex([
      { id: 'n', trackId: 'music', pitch: 60, velocity: 100, startTick: 240, endTick: 360 },
    ])
    expect(
      getTrackTimeRange(track('music', { startTick: 0, endTick: 300 }), index, 4000, true)
    ).toEqual({ startTick: 0, endTick: 300 })
  })
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
  let borders = 0
  const fills: { color: string; alpha: number; region: boolean }[] = []
  const texts: string[] = []
  const rectangles: { x: number; y: number; width: number; height: number }[] = []
  const verticalLines: number[] = []
  const paths: { color: string; points: number[][] }[] = []
  const dashes: number[][] = []
  let points: number[][] = []
  let startX = 0
  const context = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    setTransform() {},
    clearRect() {},
    strokeRect() { borders++ },
    beginPath() {
      points = []
    },
    closePath() {},
    setLineDash(value: number[]) {
      dashes.push(value)
    },
    roundRect() {},
    moveTo(x: number, y: number) {
      points.push([x, y])
      startX = x
    },
    lineTo(x: number, y: number) {
      points.push([x, y])
      if (x === startX) verticalLines.push(x)
    },
    save() {},
    restore() {},
    rect(x: number, y: number, w: number, h: number) {
      points = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ]
    },
    clip() {},
    fillText(value: string) {
      texts.push(value)
    },
    stroke() {},
    measureText: (value: string) => ({ width: value.length * 7 }),
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ color: this.fillStyle, alpha: this.globalAlpha, region: false })
      rectangles.push({ x, y, width, height })
    },
    fill() {
      paths.push({ color: this.fillStyle, points: [...points] })
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
  return { canvas, fills, texts, rectangles, verticalLines, paths, dashes, get borders() { return borders } }
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

describe('总览音符空间', () => {
  it('详情有效区域两侧覆盖不透明中性灰，不复用粉色音轨背景', () => {
    const grid = canvasFixture()
    const frame = colorFrame('editor')
    frame.rows[0]!.track = { ...frame.rows[0]!.track, startTick: 120, endTick: 720 }
    frame.editing = { selectedNoteIds: new Set(), highlightPitches: null, clipTrackRegions: true }
    drawGrid(grid.canvas, canvasFixture().canvas, frame)
    const fills = grid.fills.flatMap((fill, i) =>
      fill.color === defaultPianoRollTheme.colors.regionInactive
        ? [{ alpha: fill.alpha, rect: grid.rectangles[i] }]
        : []
    )
    expect(defaultPianoRollTheme.colors.regionInactive).not.toBe(
      defaultPianoRollTheme.colors.trackDisabled
    )
    expect(fills).toEqual([
      { alpha: 1, rect: { x: 0, y: 0, width: 15, height: 100 } },
      { alpha: 1, rect: { x: 90, y: 0, width: 150, height: 100 } },
    ])
  })
  it('详情 Canvas 放大后绘制 1/256 网格，三连音保留真实拍线', () => {
    const grid = canvasFixture()
    const ruler = canvasFixture()
    const frame = colorFrame('editor')
    frame.timeZoom = 4800
    frame.editing = { selectedNoteIds: new Set(), highlightPitches: null, gridTicks: 7.5 }
    drawGrid(grid.canvas, ruler.canvas, frame)
    // 显示网格保留半 tick 精度，不能被 MIDI 事件的整数存储精度拉成大小格。
    expect(grid.verticalLines).toEqual([0, 37.5, 75, 112.5, 150, 187.5, 225])
    expect(ruler.verticalLines).toEqual(grid.verticalLines)
    frame.width = 2400
    frame.editing.gridTicks = 320
    const triplets = canvasFixture()
    drawGrid(triplets.canvas, canvasFixture().canvas, frame)
    expect(triplets.verticalLines).toEqual([0, 1600, 2400])
  })
  it('轨道名称只在左侧展示，内容区域不重复绘制名称', () => {
    const grid = canvasFixture()
    const ruler = canvasFixture()
    drawGrid(grid.canvas, ruler.canvas, colorFrame('overview'))
    expect(grid.texts).toEqual([])
    expect(ruler.texts.length).toBeGreaterThan(0)
  })

  for (const height of [56, 100, 180]) {
    it(`${height}px 行高的单音居中，不再预留名称高度`, () => {
      const notes = canvasFixture()
      const frame = colorFrame('overview')
      frame.rows[0]!.height = height
      frame.height = height
      drawNotes(notes.canvas, frame)
      expect(notes.rectangles).toHaveLength(1)
      const note = notes.rectangles[0]!
      expect(note.y + note.height / 2).toBe(height / 2)
    })
  }

  it('宽音域使用上下完整预览空间，音符不越过相邻轨道', () => {
    const notes = canvasFixture()
    const frame = colorFrame('overview')
    frame.index = createNoteIndex(
      [0, 127].map((pitch) => ({
        id: `note-${pitch}`,
        trackId: 'music',
        pitch,
        velocity: 100,
        startTick: 0,
        endTick: 480,
      }))
    )
    frame.rows[0]!.top = 100
    frame.height = 200
    drawNotes(notes.canvas, frame)
    expect(notes.rectangles).toHaveLength(2)
    expect(notes.rectangles.every((note) => note.y >= 106 && note.y + note.height <= 194)).toBe(
      true
    )
    expect(Math.min(...notes.rectangles.map((note) => note.y))).toBeLessThan(110)
  })
})

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

describe('琴键发音和参考音符', () => {
  it('琴键及网格发音高亮使用相同半音行，音名放大后增加', () => {
    const keys = canvasFixture()
    drawKeyboard(keys.canvas, 100, 28, 66 * 28, defaultPianoRollTheme, null, [60, 61])
    const active = keys.paths.filter(
      (path) => path.color === defaultPianoRollTheme.colors.keyActive
    )
    expect(active).toHaveLength(2)
    expect(active[0]!.points).toEqual([[0, 28], [42, 28], [42, 14], [64, 14], [64, 56], [42, 56], [42, 56], [0, 56]])
    expect(active[0]!.points).toContainEqual([0, 28])
    expect(active[1]!.points).toEqual([
      [0, 0],
      [42, 0],
      [42, 28],
      [0, 28],
    ])
    expect(keys.texts).toContain('C4')
    expect(keys.texts).toContain('A♯3')
    const frame = colorFrame('editor', '#001122')
    frame.pitchZoom = 28
    frame.scrollTop = 67 * 28
    frame.activePitches = [60, 59]
    const activity = canvasFixture()
    drawPitchActivity(activity.canvas, frame)
    expect(activity.rectangles.filter((_, index) => index >= activity.rectangles.length - 2)).toEqual([
      { x: 0, y: 0, width: 240, height: 27 },
      { x: 0, y: 28, width: 240, height: 27 },
    ])
    expect(activity.borders).toBe(0)
    expect(
      activity.fills.every((fill) => [defaultPianoRollTheme.colors.pitchActive, '#000000'].includes(fill.color))
    ).toBe(true)
  })

  it('参考音符保留原音轨颜色并用虚线轮廓区分模板灰色，在当前轨后面，遵守各自有效区域，关闭后隐藏', () => {
    const frame = colorFrame('editor', '#123456')
    frame.rows = [
      ...frame.rows,
      { track: { ...track('other', { endTick: 240 }), color: '#336699' }, top: 100, height: 100 },
    ]
    frame.index = createNoteIndex([
      { id: 'note', trackId: 'music', pitch: 60, velocity: 100, startTick: 0, endTick: 480 },
      { id: 'reference', trackId: 'other', pitch: 60, velocity: 100, startTick: 0, endTick: 480 },
      { id: 'hidden', trackId: 'other', pitch: 64, velocity: 100, startTick: 480, endTick: 960 },
    ])
    frame.editing = {
      clipTrackRegions: true,
      selectedNoteIds: new Set(['reference']),
      highlightPitches: new Set([60]),
    }
    frame.showOtherTracks = true
    const notes = canvasFixture()
    drawNotes(notes.canvas, frame)
    expect(notes.fills.filter((fill) => fill.color === '#336699')).toHaveLength(1)
    expect(notes.fills[0]).toMatchObject({ color: '#336699', alpha: 0.32 })
    expect(notes.dashes).toEqual([[3, 2], []])
    expect(notes.rectangles[0]!.width).toBe(30)
    expect(notes.fills.some((fill) => fill.color === '#123456')).toBe(true)
    frame.showOtherTracks = false
    const hidden = canvasFixture()
    drawNotes(hidden.canvas, frame)
    expect(hidden.fills.some((fill) => fill.color === '#336699')).toBe(false)
  })
})
