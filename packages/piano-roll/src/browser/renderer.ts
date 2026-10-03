import {
  clipNoteToTrackRegion,
  type createNoteIndex,
  type PianoRollTimeline,
  type PianoRollTrack,
} from '../core'
import { defaultPianoRollTheme, type PianoRollTheme } from './theme'
import { rulerLabels, rulerMarks } from './ruler-layout'
import { isBlackKey, layoutPianoKeys, pianoKeyLabel, pitchRowGeometry } from './keyboard-layout'

/** 一行轨道的内容坐标。 */
export interface TrackRow {
  track: PianoRollTrack
  top: number
  height: number
}

/**
 * @description 计算总览轨道行的统一内容坐标，供 Canvas、轨道栏与命中测试共用。
 * @param tracks 当前文档按显示顺序排列的轨道。
 * @param viewportHeight CSS 布局完成后的内容视口高度，不包含工具栏或标尺。
 * @param explicitHeights 宿主显式设置的行高；这些行保留原有 56–320px 限制。
 * @return 按顺序连续排列的轨道行。自动行均分剩余空间，低于 56px 后产生溢出。
 */
export function layoutTrackRows(
  tracks: readonly PianoRollTrack[],
  viewportHeight: number,
  explicitHeights?: ReadonlyMap<string, number>
): TrackRow[] {
  const minimumHeight = 56
  let fixedHeight = 0
  let automaticCount = 0
  const resolvedHeights: (number | undefined)[] = []
  for (const track of tracks) {
    const value = explicitHeights?.get(track.id)
    if (value === undefined) {
      resolvedHeights.push(undefined)
      automaticCount += 1
    } else {
      // 显式行高延续既有 API 的边界；非法输入不能污染后续所有轨道的坐标。
      const height = Math.min(
        320,
        Math.max(minimumHeight, Number.isFinite(value) ? value : minimumHeight)
      )
      resolvedHeights.push(height)
      fixedHeight += height
    }
  }
  const availableHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  const automaticHeight =
    automaticCount > 0
      ? Math.max(minimumHeight, (availableHeight - fixedHeight) / automaticCount)
      : minimumHeight
  let top = 0
  return tracks.map((track, index) => {
    const height = resolvedHeights[index] ?? automaticHeight
    const row = { track, top, height }
    top += height
    return row
  })
}

/**
 * 解析轨道在总览中的内容区域。
 *
 * 编辑态以显式区域为有效范围；只读 MIDI 预览仍用音符补齐缺失或错误的
 * End Of Track。结果始终限制在文档时间轴内，空轨无边界时退化为零宽标记。
 */
export function getTrackTimeRange(
  track: PianoRollTrack,
  index: ReturnType<typeof createNoteIndex>,
  durationTicks: number,
  clipToRegion = false
): { startTick: number; endTick: number } {
  const duration = Number.isFinite(durationTicks) ? Math.max(0, durationTicks) : 0
  const notes = index.getTimeRange(track.id)
  const metadataStart = Number.isFinite(track.startTick) ? Math.max(0, track.startTick!) : null
  const metadataEnd = Number.isFinite(track.endTick) ? Math.max(0, track.endTick!) : null
  // 只读预览兼容异常 EOT；编辑态不能用隐藏音符撑开用户已缩短的范围。
  let start = metadataStart ?? (clipToRegion && metadataEnd !== null ? 0 : (notes?.startTick ?? 0))
  let end = metadataEnd ?? notes?.endTick ?? start
  if (notes && !clipToRegion) {
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
  /** 宿主音频时钟确认正在发声的音高，只使独立高光层失效。 */
  activePitches?: readonly number[]
  /** 浏览和编辑共用的参考音轨显示设置。 */
  showOtherTracks?: boolean
  /** Canvas 与 DOM 共用的已解析主题；缺省时使用默认主题。 */
  theme?: PianoRollTheme
  /** 编辑层投影：选中音符与可演奏音高；只影响配色，不改变布局。 */
  editing?: {
    /** 编辑态区域是硬边界；只读 MIDI 预览继续兼容不完整的 EOT 元数据。 */
    clipTrackRegions?: boolean
    /** 宿主选择的网格步长，绘制与标尺使用同一密度和 tick 相位。 */
    gridTicks?: number | 'bar'
    selectedNoteIds: ReadonlySet<string>
    highlightPitches: ReadonlySet<number> | null
  }
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
    const playable = frame.editing?.highlightPitches ?? null
    for (let row = firstRow; row <= lastRow; row += 1) {
      const pitch = 127 - row
      const y = pitchRowGeometry(pitch, pitchZoom).top - scrollTop
      context.fillStyle = isBlackKey(pitch) ? theme.colors.surface : theme.colors.surfaceSubtle
      context.fillRect(0, y, width, pitchZoom)
      // 不可演奏行叠一层淡遮罩，网格线仍保留在其上以维持节拍参照。
      if (playable && !playable.has(pitch)) {
        context.fillStyle = theme.colors.pitchUnplayable
        context.fillRect(0, y, width, pitchZoom)
      }
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
  if (frame.variant === 'editor' && frame.editing?.clipTrackRegions) {
    const row = frame.rows.find((item) => item.track.id === frame.selectedTrackId)
    if (row) {
      const range = getTrackTimeRange(row.track, frame.index, timeline.durationTicks, true)
      const left = timeline.tickToSeconds(range.startTick) * timeZoom - scrollLeft
      const right = timeline.tickToSeconds(range.endTick) * timeZoom - scrollLeft
      // 有效区域外使用中性灰，避免品牌浅色让未开放区域看起来像选中的音轨。
      context.fillStyle = theme.colors.regionInactive
      context.fillRect(0, 0, Math.max(0, Math.min(width, left)), height)
      context.fillRect(Math.max(0, right), 0, Math.max(0, width - Math.max(0, right)), height)
      context.globalAlpha = 1
      context.fillStyle = theme.colors.gridMajor
      if (right >= 0 && right <= width) context.fillRect(right, 0, 1, height)
    }
  }
  const markOptions = {
    // 保留跨过裁剪边缘的线宽，避免尚未完全离开的刻度突然消失。
    startSeconds: Math.max(0, scrollLeft - 1) / timeZoom,
    endSeconds: (scrollLeft + width + 1) / timeZoom,
    pixelsPerSecond: timeZoom,
  }
  const gridTicks = frame.editing?.gridTicks
  const marks = rulerMarks(timeline, {
    ...markOptions,
    gridTicks,
  })
  rulerContext.fillStyle = theme.colors.surfaceRaised
  rulerContext.fillRect(0, 0, width, 32)
  rulerContext.font = `12px ${theme.metrics.fontFamily}`
  for (const mark of marks) {
    // 与音符使用同一亚像素坐标；按视口取整会让慢速滚动产生整像素跳步。
    const x = mark.x - scrollLeft
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
  }
  rulerContext.fillStyle = theme.colors.text
  for (const mark of rulerLabels(
    timeline,
    timeZoom,
    scrollLeft,
    width,
    (text) => rulerContext.measureText(text).width,
    gridTicks
  )) {
    rulerContext.fillText(mark.label, mark.x - scrollLeft + 5, 16)
  }
  if (frame.variant === 'overview') {
    for (const row of frame.rows) {
      const y = row.top - scrollTop
      const range = getTrackTimeRange(
        row.track,
        frame.index,
        timeline.durationTicks,
        frame.editing?.clipTrackRegions
      )
      const region = overviewRegionGeometry(range, timeline, timeZoom, scrollLeft)
      const regionLeft = region.left
      const regionWidth = region.width
      const regionTop = y + 3
      const regionHeight = Math.max(1, row.height - 6)
      const selectedTrack = row.track.id === frame.selectedTrackId
      context.fillStyle =
        row.track.color ||
        (selectedTrack
          ? theme.colors.trackSelected
          : row.track.enabled
            ? theme.colors.trackEnabled
            : theme.colors.trackDisabled)
      // 自定义色用浅色区域区分音轨，选中只增强透明度，不改回主题粉色。
      context.globalAlpha = row.track.color
        ? row.track.enabled
          ? selectedTrack
            ? 0.2
            : 0.12
          : 0.04
        : row.track.enabled
          ? 1
          : 0.32
      const radius = Math.min(5, regionHeight / 2, regionWidth / 2)
      const visibleLeft = Math.max(-radius, regionLeft)
      const visibleRight = Math.min(width + radius, regionLeft + regionWidth)
      if (visibleRight > visibleLeft) {
        context.beginPath()
        context.roundRect(visibleLeft, regionTop, visibleRight - visibleLeft, regionHeight, radius)
        context.fill()
        context.strokeStyle = row.track.color || theme.colors.border
        context.globalAlpha = row.track.enabled ? 0.65 : 0.25
        context.stroke()
      }
      context.globalAlpha = 1
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
      : frame.showOtherTracks
        ? [
            ...frame.rows.filter((row) => row.track.id !== frame.selectedTrackId),
            ...frame.rows.filter((row) => row.track.id === frame.selectedTrackId),
          ]
        : frame.rows.filter((row) => row.track.id === frame.selectedTrackId)
  const selected = frame.editing?.selectedNoteIds
  const playable = frame.editing?.highlightPitches ?? null
  for (const row of rows) {
    const reference = frame.variant === 'editor' && row.track.id !== frame.selectedTrackId
    const range = frame.index.getPitchRange(row.track.id)
    const low = (range?.min ?? 48) - 3
    const high = (range?.max ?? 84) + 3
    // 名称由左侧轨道栏展示；音符居中使用完整预览高度，只保留上下安全间距。
    const scale = (row.height - 15) / Math.max(12, high - low)
    const middlePitch = (high + low) / 2
    for (const original of frame.index.query(row.track.id, startTick, endTick)) {
      const note = frame.editing?.clipTrackRegions
        ? clipNoteToTrackRegion(original, row.track)
        : original
      if (!note) continue
      const start = timeline.tickToSeconds(note.startTick) * timeZoom - scrollLeft
      const end = timeline.tickToSeconds(note.endTick) * timeZoom - scrollLeft
      const noteHeight = frame.variant === 'editor' ? Math.max(3, pitchZoom - 3) : 3
      const y =
        frame.variant === 'editor'
          ? pitchRowGeometry(note.pitch, pitchZoom).top - scrollTop + 1
          : row.top - scrollTop + (row.height - noteHeight) / 2 + (middlePitch - note.pitch) * scale
      if (y > height || y + noteHeight < 0) continue
      const x = Math.max(-2, start)
      const w = Math.min(width + 2, Math.max(start + 2, end)) - x
      if (w <= 0) continue
      context.globalAlpha = reference
        ? row.track.enabled
          ? 0.32
          : 0.18
        : row.track.enabled
          ? 1
          : 0.28
      const isSelected = !reference && (selected?.has(note.id) ?? false)
      const unplayable = playable !== null && !playable.has(note.pitch)
      // 选中优先于其它状态；不可演奏音符在两种视图中都用灰色提示。
      const trackColor = row.track.color || theme.colors.editorNote
      context.fillStyle = reference
        ? trackColor
        : isSelected
          ? theme.colors.noteSelected
          : unplayable
            ? theme.colors.noteUnplayable
            : row.track.color ||
              (frame.variant === 'overview' ? theme.colors.overviewNote : theme.colors.editorNote)
      context.fillRect(x, y, w, noteHeight)
      if (frame.variant === 'editor') {
        // 参考轨保留原配色，用空心虚线轮廓区分模板外的实心灰色音符。
        if (reference) {
          context.globalAlpha = row.track.enabled ? 0.8 : 0.4
          context.setLineDash([3, 2])
        }
        context.strokeStyle = reference
          ? trackColor
          : isSelected
            ? theme.colors.text
            : theme.colors.noteOutline
        context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), noteHeight - 1)
        if (reference) {
          context.setLineDash([])
          continue
        }
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
  }
}

/**
 * @description 绘制独立发音高光层，音频帧不必重绘节拍、音符或编辑预览。
 * @param canvas 视口大小的高光画布。
 * @param frame 统一视口与宿主发音状态。
 * @return 无返回值。
 */
export function drawPitchActivity(canvas: HTMLCanvasElement, frame: RenderFrame): void {
  const context = canvasContext(canvas, frame.width, frame.height)
  if (!context || frame.variant !== 'editor') return
  const colors = (frame.theme ?? defaultPianoRollTheme).colors
  const blur = Math.min(12, frame.pitchZoom / 2)
  const rows = [...new Set(frame.activePitches)]
    .filter(pitch => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127)
    .map(pitch => {
      const { top, height } = pitchRowGeometry(pitch, frame.pitchZoom)
      return { y: top - frame.scrollTop, height }
    })
    .filter(row => row.y < frame.height + blur && row.y + row.height > -blur)
  context.save()
  context.fillStyle = colors.pitchActive
  context.shadowColor = colors.pitchActiveGlow
  // Canvas shadowBlur 不随坐标变换缩放，按 DPR 补偿以保持不同屏幕上的 CSS 光晕范围一致。
  context.shadowBlur = blur * (canvas.ownerDocument.defaultView?.devicePixelRatio || 1)
  for (const row of rows) context.fillRect(0, row.y, frame.width, row.height)
  context.shadowBlur = 0
  context.shadowColor = 'transparent'
  // 先保留外扩阴影，再清空行内实体；避免不透明的高光把宿主音轨颜色洗成白色。
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = '#000000'
  for (const row of rows) context.fillRect(0, row.y, frame.width, row.height)
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = colors.pitchActive
  context.globalAlpha = 0.2
  for (const row of rows) context.fillRect(0, row.y, frame.width, row.height - 1)
  context.restore()
}

/**
 * @description 左侧半音键盘与网格逐行对齐，黑键较短，音名随音高缩放增加。
 * @param canvas 琴键画布。
 * @param height 可见高度。
 * @param pitchZoom 每半音行高。
 * @param scrollTop 纵向内容偏移。
 * @param theme 解析后的主题。
 * @param playable 可演奏集合；null 不过滤。
 * @param activePitches 宿主确认正在发声的音高。
 * @return 无返回值。
 */
export function drawKeyboard(
  canvas: HTMLCanvasElement,
  height: number,
  pitchZoom: number,
  scrollTop: number,
  theme: PianoRollTheme = defaultPianoRollTheme,
  playable: ReadonlySet<number> | null = null,
  activePitches: readonly number[] = []
): void {
  const context = canvasContext(canvas, 64, height)
  if (!context) return
  const active = new Set(activePitches)
  context.font = `11px ${theme.metrics.fontFamily}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  // 主体严格保持半音行高，前端凸出部分与白键使用同一轮廓、填充和发音状态。
  context.fillStyle = theme.colors.keyWhite
  context.fillRect(0, 0, 64, height)
  const keys = layoutPianoKeys(pitchZoom)
  for (const key of [...keys.filter((key) => !key.black), ...keys.filter((key) => key.black)]) {
    const { pitch, black } = key
    const y = key.top - scrollTop
    if (key.frontBottom - scrollTop <= 0 || key.frontTop - scrollTop >= height) continue
    const face = () => {
      context.beginPath()
      if (black) context.rect(0, y, 42, key.height)
      else {
        context.moveTo(0, y)
        context.lineTo(42, y)
        context.lineTo(42, key.frontTop - scrollTop)
        context.lineTo(64, key.frontTop - scrollTop)
        context.lineTo(64, key.frontBottom - scrollTop)
        context.lineTo(42, key.frontBottom - scrollTop)
        context.lineTo(42, y + key.height)
        context.lineTo(0, y + key.height)
        context.closePath()
      }
    }
    face()
    context.fillStyle = black ? theme.colors.keyBlack : theme.colors.keyWhite
    context.fill()
    if (playable && !playable.has(pitch)) {
      context.fillStyle = theme.colors.pitchUnplayable
      context.fill()
    }
    if (active.has(pitch)) {
      context.fillStyle = theme.colors.keyActive
      context.fill()
    }
    context.strokeStyle = theme.colors.keyBorder
    context.lineWidth = 1
    context.stroke()
    const label = pianoKeyLabel(pitch, pitchZoom)
    if (label) {
      context.fillStyle = black || active.has(pitch) ? '#ffffff' : theme.colors.text
      context.fillText(label, black ? 21 : 51, y + key.height / 2)
    }
  }
}
