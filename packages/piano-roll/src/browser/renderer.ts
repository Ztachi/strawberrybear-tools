import type { createNoteIndex, PianoRollTimeline, PianoRollTrack } from '../core'

/** 一行轨道的内容坐标。 */
export interface TrackRow {
  track: PianoRollTrack
  top: number
  height: number
}

/** 一次静态层绘制的只读输入，不包含播放头时间。 */
export interface RenderFrame {
  variant: 'overview' | 'editor'
  timeline: PianoRollTimeline
  index: ReturnType<typeof createNoteIndex>
  rows: readonly TrackRow[]
  selectedTrackId: string | null
  width: number
  height: number
  scrollLeft: number
  scrollTop: number
  timeZoom: number
  pitchZoom: number
}

/** 仅在视口或 DPR 改变时分配 backing store，绝不按整首歌尺寸分配。 */
export function canvasContext(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null {
  const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio || 1
  const backingWidth = Math.max(1, Math.round(width * dpr))
  const backingHeight = Math.max(1, Math.round(height * dpr))
  if (canvas.width !== backingWidth) canvas.width = backingWidth
  if (canvas.height !== backingHeight) canvas.height = backingHeight
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const context = canvas.getContext('2d')
  if (!context) return null
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  return context
}

/** 获取可见轨道，前缀位置以二分定位，轨道数很多时也不遍历全部。 */
export function visibleRows(rows: readonly TrackRow[], top: number, height: number): TrackRow[] {
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const row = rows[middle]!
    if (row.top + row.height <= top) low = middle + 1
    else high = middle
  }
  const result: TrackRow[] = []
  for (let index = low; index < rows.length; index += 1) {
    const row = rows[index]!
    if (row.top > top + height) break
    result.push(row)
  }
  return result
}

/** 绘制视口内网格与独立标尺。小节、拍和细分由同一时间轴提供。 */
export function drawGrid(
  grid: HTMLCanvasElement,
  ruler: HTMLCanvasElement,
  frame: RenderFrame
): void {
  const context = canvasContext(grid, frame.width, frame.height)
  const rulerContext = canvasContext(ruler, frame.width, 32)
  if (!context || !rulerContext) return
  const { width, height, scrollLeft, scrollTop, pitchZoom, timeline, timeZoom } = frame
  context.fillStyle = '#202124'
  context.fillRect(0, 0, width, height)
  if (frame.variant === 'editor') {
    const firstRow = Math.max(0, Math.floor(scrollTop / pitchZoom))
    const lastRow = Math.min(127, Math.ceil((scrollTop + height) / pitchZoom))
    for (let row = firstRow; row <= lastRow; row += 1) {
      const pitch = 127 - row
      const y = row * pitchZoom - scrollTop
      context.fillStyle = [1, 3, 6, 8, 10].includes(pitch % 12) ? '#202124' : '#2c2e31'
      context.fillRect(0, y, width, pitchZoom)
      context.fillStyle = pitch % 12 === 0 ? '#55575a' : '#35373b'
      context.fillRect(0, y + pitchZoom - 1, width, 1)
    }
  } else {
    const endX = timeline.secondsToContentX(timeline.durationSeconds, timeZoom) - scrollLeft
    for (const row of frame.rows) {
      const y = row.top - scrollTop
      context.fillStyle = row.track.id === frame.selectedTrackId ? '#387844' : '#285f33'
      context.globalAlpha = row.track.enabled ? 1 : 0.32
      context.fillRect(
        Math.max(0, -scrollLeft),
        y + 3,
        Math.max(0, Math.min(width, endX)),
        row.height - 6
      )
      context.globalAlpha = 1
      context.fillStyle = '#131518'
      context.fillRect(0, y + row.height - 1, width, 1)
    }
  }
  const marks = timeline.getRulerMarks({
    startSeconds: scrollLeft / timeZoom,
    endSeconds: (scrollLeft + width) / timeZoom,
    pixelsPerSecond: timeZoom,
  })
  rulerContext.fillStyle = '#36373b'
  rulerContext.fillRect(0, 0, width, 32)
  rulerContext.font = '12px system-ui'
  let labelRight = Number.NEGATIVE_INFINITY
  const nextBarPositions: number[] = []
  let nextBarX = Number.POSITIVE_INFINITY
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    nextBarPositions[index] = nextBarX
    if (marks[index]!.kind === 'bar') nextBarX = marks[index]!.x - scrollLeft
  }
  for (const [index, mark] of marks.entries()) {
    const x = Math.round(mark.x - scrollLeft) + 0.5
    const major = mark.kind === 'bar'
    context.strokeStyle = major ? '#777b8066' : mark.kind === 'beat' ? '#73767b33' : '#73767b18'
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
    rulerContext.strokeStyle = major ? '#babcc3' : '#797b82'
    rulerContext.beginPath()
    rulerContext.moveTo(x, major ? 2 : 23)
    rulerContext.lineTo(x, 32)
    rulerContext.stroke()
    const labelWidth = rulerContext.measureText(mark.label).width
    const fitsBeforeBar = major || x + 5 + labelWidth + 6 < nextBarPositions[index]!
    if (mark.label && x > labelRight + 6 && fitsBeforeBar) {
      rulerContext.fillStyle = '#e4e4e7'
      rulerContext.fillText(mark.label, x + 5, 16)
      labelRight = x + 5 + labelWidth
    }
  }
}

/** 绘制区间索引返回的可见音符，跨可见窗口的长音也保留。 */
export function drawNotes(canvas: HTMLCanvasElement, frame: RenderFrame): void {
  const context = canvasContext(canvas, frame.width, frame.height)
  if (!context) return
  const { timeline, scrollLeft, scrollTop, timeZoom, pitchZoom, width, height } = frame
  const startTick = timeline.secondsToTick(Math.max(0, (scrollLeft - 5) / timeZoom))
  const endTick = timeline.secondsToTick((scrollLeft + width) / timeZoom)
  const rows =
    frame.variant === 'overview'
      ? frame.rows
      : frame.rows.filter((row) => row.track.id === frame.selectedTrackId)
  for (const row of rows) {
    const range = frame.index.getPitchRange(row.track.id)
    const low = (range?.min ?? 48) - 3
    const high = (range?.max ?? 84) + 3
    const scale = (row.height - 34) / Math.max(12, high - low)
    for (const note of frame.index.query(row.track.id, startTick, endTick)) {
      const start = timeline.tickToSeconds(note.startTick) * timeZoom - scrollLeft
      const end = timeline.tickToSeconds(note.endTick) * timeZoom - scrollLeft
      const noteHeight = frame.variant === 'editor' ? Math.max(3, pitchZoom - 3) : 3
      const y =
        frame.variant === 'editor'
          ? (127 - note.pitch) * pitchZoom - scrollTop + 1
          : row.top - scrollTop + 23 + (high - note.pitch) * scale
      if (y > height || y + noteHeight < 0) continue
      const x = Math.max(-2, start)
      const w = Math.min(width + 2, Math.max(start + 2, end)) - x
      if (w <= 0) continue
      context.globalAlpha = row.track.enabled ? 1 : 0.28
      context.fillStyle = frame.variant === 'overview' ? '#b4f2b9' : row.track.color || '#38b951'
      context.fillRect(x, y, w, noteHeight)
      if (frame.variant === 'editor') {
        context.strokeStyle = '#102d16'
        context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), noteHeight - 1)
        context.fillStyle = '#c9ffd0'
        context.fillRect(
          x + 2,
          y + 3,
          Math.max(0, Math.min(w - 4, ((w - 4) * note.velocity) / 127)),
          1
        )
      }
    }
    context.globalAlpha = 1
    if (frame.variant === 'overview') {
      context.fillStyle = '#e0fce3'
      context.font = '12px system-ui'
      context.fillText(row.track.name, 8, row.top - scrollTop + 17, width - 16)
    }
  }
}

/** 左侧完整 MIDI 0–127 键盘，只绘制可见音高行。 */
export function drawKeyboard(
  canvas: HTMLCanvasElement,
  height: number,
  pitchZoom: number,
  scrollTop: number
): void {
  const context = canvasContext(canvas, 64, height)
  if (!context) return
  const first = Math.max(0, Math.floor(scrollTop / pitchZoom))
  const last = Math.min(127, Math.ceil((scrollTop + height) / pitchZoom))
  context.font = '11px system-ui'
  for (let row = first; row <= last; row += 1) {
    const pitch = 127 - row
    const y = row * pitchZoom - scrollTop
    const black = [1, 3, 6, 8, 10].includes(pitch % 12)
    context.fillStyle = '#e6e6e8'
    context.fillRect(0, y, 64, pitchZoom)
    context.fillStyle = '#96969d'
    context.fillRect(0, y + pitchZoom - 1, 64, 1)
    if (black) {
      context.fillStyle = '#141519'
      context.fillRect(0, y, 42, pitchZoom - 1)
    }
    if (pitch % 12 === 0) {
      context.fillStyle = '#303138'
      context.fillText(`C${Math.floor(pitch / 12) - 1}`, 43, y + Math.min(pitchZoom - 2, 12))
    }
  }
}
