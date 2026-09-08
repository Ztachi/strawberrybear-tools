import type { createNoteIndex, PianoRollTimeline, PianoRollTrack } from '../core'
import { defaultPianoRollTheme, type PianoRollTheme } from './theme'

/** 一行轨道的内容坐标。 */
export interface TrackRow {
  track: PianoRollTrack
  top: number
  height: number
}

/** 在轨道区域内以省略号裁剪名称，避免 Canvas 的 maxWidth 压缩长文本。 */
function fitCanvasLabel(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  if (context.measureText(value).width <= maxWidth) return value
  const ellipsis = '…'
  if (context.measureText(ellipsis).width > maxWidth) return ''
  const characters = Array.from(value)
  let low = 0
  let high = characters.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (context.measureText(`${characters.slice(0, middle).join('')}${ellipsis}`).width <= maxWidth)
      low = middle
    else high = middle - 1
  }
  return `${characters.slice(0, low).join('')}${ellipsis}`
}

/**
 * 解析轨道在总览中的内容区域。
 *
 * MIDI 的 End Of Track 是最可信的区域边界；音符区间只用于补齐缺失或
 * 错误的元数据，避免坏元数据把音符绘制到粉色区域之外。结果始终限制
 * 在文档时间轴内，空轨道且没有边界时退化为零宽标记。
 */
export function getTrackTimeRange(
  track: PianoRollTrack,
  index: ReturnType<typeof createNoteIndex>,
  durationTicks: number
): { startTick: number; endTick: number } {
  const duration = Number.isFinite(durationTicks) ? Math.max(0, durationTicks) : 0
  const notes = index.getTimeRange(track.id)
  const metadataStart = Number.isFinite(track.startTick) ? Math.max(0, track.startTick!) : null
  const metadataEnd = Number.isFinite(track.endTick) ? Math.max(0, track.endTick!) : null
  // 元数据与音符取并集，保证异常的 EOT 或导入器截断不会隐藏真实音符。
  let start = metadataStart ?? notes?.startTick ?? 0
  let end = metadataEnd ?? notes?.endTick ?? start
  if (notes) {
    start = Math.min(start, notes.startTick)
    end = Math.max(end, notes.endTick)
  }
  start = Math.min(duration, Math.max(0, start))
  end = Math.min(duration, Math.max(0, end))
  if (end < start) end = start
  return { startTick: start, endTick: end }
}

/** 将真实区间投射到视口，并为零长度区间保留可识别的视觉标记。 */
function overviewRegionGeometry(
  range: { startTick: number; endTick: number },
  timeline: PianoRollTimeline,
  timeZoom: number,
  scrollLeft: number
): { left: number; width: number } {
  const startX = timeline.tickToSeconds(range.startTick) * timeZoom - scrollLeft
  const endX = timeline.tickToSeconds(range.endTick) * timeZoom - scrollLeft
  const width = Math.max(8, Math.abs(endX - startX))
  let left = Math.min(startX, endX)
  // 让结束于全曲末尾的空轨道在滚动到最右侧时仍完整可见。
  const contentEnd = timeline.durationSeconds * timeZoom - scrollLeft
  if (timeline.durationSeconds > 0 && left + width > contentEnd) left = contentEnd - width
  return { left, width }
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
  /** Canvas 与 DOM 共用的已解析主题；缺省时使用默认主题。 */
  theme?: PianoRollTheme
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
  const theme = frame.theme ?? defaultPianoRollTheme
  context.fillStyle = theme.colors.surface
  context.fillRect(0, 0, width, height)
  if (frame.variant === 'editor') {
    const firstRow = Math.max(0, Math.floor(scrollTop / pitchZoom))
    const lastRow = Math.min(127, Math.ceil((scrollTop + height) / pitchZoom))
    for (let row = firstRow; row <= lastRow; row += 1) {
      const pitch = 127 - row
      const y = row * pitchZoom - scrollTop
      context.fillStyle = [1, 3, 6, 8, 10].includes(pitch % 12)
        ? theme.colors.surface
        : theme.colors.surfaceSubtle
      context.fillRect(0, y, width, pitchZoom)
      context.fillStyle = pitch % 12 === 0 ? theme.colors.gridMajor : theme.colors.gridMinor
      context.fillRect(0, y + pitchZoom - 1, width, 1)
    }
  } else {
    // 网格先绘制，区域稍后覆盖在线条之上，保持音轨内容清晰。
    for (const row of frame.rows) {
      const y = row.top - scrollTop
      context.fillStyle = theme.colors.border
      context.globalAlpha = 0.55
      context.fillRect(0, y + row.height - 1, width, 1)
      context.globalAlpha = 1
    }
  }
  const marks = timeline.getRulerMarks({
    startSeconds: scrollLeft / timeZoom,
    endSeconds: (scrollLeft + width) / timeZoom,
    pixelsPerSecond: timeZoom,
  })
  rulerContext.fillStyle = theme.colors.surfaceRaised
  rulerContext.fillRect(0, 0, width, 32)
  rulerContext.font = `12px ${theme.metrics.fontFamily}`
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
    // 总览内容区只保留小节线，拍/细分线在缩放较小时会淹没音符；
    // 标尺仍保留细分刻度，方便定位和拖拽。详情内容区保留完整细分线。
    if (!(frame.variant === 'overview' && mark.kind !== 'bar')) {
      context.strokeStyle = major
        ? theme.colors.gridMajor
        : mark.kind === 'beat'
          ? theme.colors.gridBeat
          : theme.colors.gridMinor
      context.globalAlpha = major ? 0.72 : frame.variant === 'editor' ? 0.7 : 0.58
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
      context.globalAlpha = 1
    }
    rulerContext.strokeStyle = major ? theme.colors.gridMajor : theme.colors.gridBeat
    rulerContext.beginPath()
    rulerContext.moveTo(x, major ? 2 : 23)
    rulerContext.lineTo(x, 32)
    rulerContext.stroke()
    const labelWidth = rulerContext.measureText(mark.label).width
    const fitsBeforeBar = major || x + 5 + labelWidth + 6 < nextBarPositions[index]!
    if (mark.label && x > labelRight + 6 && fitsBeforeBar) {
      rulerContext.fillStyle = theme.colors.text
      rulerContext.fillText(mark.label, x + 5, 16)
      labelRight = x + 5 + labelWidth
    }
  }
  if (frame.variant === 'overview') {
    for (const row of frame.rows) {
      const y = row.top - scrollTop
      const range = getTrackTimeRange(row.track, frame.index, timeline.durationTicks)
      const region = overviewRegionGeometry(range, timeline, timeZoom, scrollLeft)
      const regionLeft = region.left
      const regionWidth = region.width
      const regionTop = y + 3
      const regionHeight = Math.max(1, row.height - 6)
      context.fillStyle =
        row.track.id === frame.selectedTrackId
          ? theme.colors.trackSelected
          : row.track.enabled
            ? theme.colors.trackEnabled
            : theme.colors.trackDisabled
      context.globalAlpha = row.track.enabled ? 1 : 0.32
      const radius = Math.min(5, regionHeight / 2, regionWidth / 2)
      const visibleLeft = Math.max(-radius, regionLeft)
      const visibleRight = Math.min(width + radius, regionLeft + regionWidth)
      if (visibleRight > visibleLeft) {
        context.beginPath()
        context.roundRect(visibleLeft, regionTop, visibleRight - visibleLeft, regionHeight, radius)
        context.fill()
        context.strokeStyle = theme.colors.border
        context.globalAlpha = row.track.enabled ? 0.65 : 0.25
        context.stroke()
      }
      context.globalAlpha = 1
      if (regionWidth >= 16 && regionLeft < width && regionLeft + regionWidth > 0) {
        context.save()
        context.beginPath()
        context.rect(regionLeft, regionTop, regionWidth, regionHeight)
        context.clip()
        context.fillStyle = theme.colors.text
        context.font = `12px ${theme.metrics.fontFamily}`
        const labelX = Math.max(4, regionLeft + 8)
        const labelWidth = Math.max(0, Math.min(width, regionLeft + regionWidth) - labelX - 8)
        const label = fitCanvasLabel(context, row.track.name, labelWidth)
        context.fillText(label, labelX, regionTop + 17)
        context.restore()
      }
    }
  }
}

/** 绘制区间索引返回的可见音符，跨可见窗口的长音也保留。 */
export function drawNotes(canvas: HTMLCanvasElement, frame: RenderFrame): void {
  const context = canvasContext(canvas, frame.width, frame.height)
  if (!context) return
  const theme = frame.theme ?? defaultPianoRollTheme
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
      context.fillStyle =
        frame.variant === 'overview'
          ? theme.colors.overviewNote
          : row.track.color || theme.colors.editorNote
      context.fillRect(x, y, w, noteHeight)
      if (frame.variant === 'editor') {
        context.strokeStyle = theme.colors.noteOutline
        context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), noteHeight - 1)
        context.fillStyle = theme.colors.noteVelocity
        context.fillRect(
          x + 2,
          y + 3,
          Math.max(0, Math.min(w - 4, ((w - 4) * note.velocity) / 127)),
          1
        )
      }
    }
    context.globalAlpha = 1
    // 总览名称在 drawGrid 中随内容区域裁剪，避免长名称穿过轨道边界。
  }
}

/** 左侧完整 MIDI 0–127 键盘，只绘制可见音高行。 */
export function drawKeyboard(
  canvas: HTMLCanvasElement,
  height: number,
  pitchZoom: number,
  scrollTop: number,
  theme: PianoRollTheme = defaultPianoRollTheme
): void {
  const context = canvasContext(canvas, 64, height)
  if (!context) return
  const first = Math.max(0, Math.floor(scrollTop / pitchZoom))
  const last = Math.min(127, Math.ceil((scrollTop + height) / pitchZoom))
  context.font = `11px ${theme.metrics.fontFamily}`
  for (let row = first; row <= last; row += 1) {
    const pitch = 127 - row
    const y = row * pitchZoom - scrollTop
    const black = [1, 3, 6, 8, 10].includes(pitch % 12)
    context.fillStyle = theme.colors.keyWhite
    context.fillRect(0, y, 64, pitchZoom)
    context.fillStyle = theme.colors.keyBorder
    context.fillRect(0, y + pitchZoom - 1, 64, 1)
    if (black) {
      context.fillStyle = theme.colors.keyBlack
      context.fillRect(0, y, 42, pitchZoom - 1)
    }
    if (pitch % 12 === 0) {
      context.fillStyle = theme.colors.text
      context.fillText(`C${Math.floor(pitch / 12) - 1}`, 43, y + Math.min(pitchZoom - 2, 12))
    }
  }
}
