import type { PianoRollTimeline, RulerMark, RulerMarkOptions } from '../core'

/**
 * 网格与文字共用刻度选择，所选分辨率与真实小节/拍参照采用同一密度算法。
 * @param timeline 当前时间轴。
 * @param options 可见范围、缩放、最小间距及所选网格。
 * @returns 按精确 tick 排序且不重复的刻度。
 */
export function rulerMarks(timeline: PianoRollTimeline, options: RulerMarkOptions): RulerMark[] {
  if (options.gridTicks === undefined) return timeline.getRulerMarks(options)
  const marks = timeline.getRulerMarks({ ...options, gridTicks: undefined, subdivisions: 1 })
  const byTick = new Map(marks.map((mark) => [mark.tick, mark]))
  for (const mark of timeline.getRulerMarks(options))
    if (!byTick.has(mark.tick)) byTick.set(mark.tick, mark)
  return [...byTick.values()].sort((a, b) => a.tick - b.tick)
}

/**
 * 生成相位固定的标尺标签，返回绝对内容坐标，绘制时再统一减去滚动量。
 *
 * 标签密度由全曲字号、拍号和缩放决定，不从视口首个可见标签开始贪心避让。
 * 查询范围额外包含左右邻居，让边界文本自然裁剪，拍号变化处的避让也不随滚动变化。
 * 刻度线和标签采用不同密度，缩小时仍可保留细分线而不挤压文字。
 *
 * @param timeline 视图当前使用的精确时间轴。
 * @param timeZoom 已由视图归一化的每秒像素数。
 * @param scrollLeft 当前帧的水平内容偏移，保留亚像素精度。
 * @param width 可见时间区宽度，单位 CSS 像素。
 * @param measureText 当前标尺字体下的文字宽度测量函数。
 * @param gridTicks 编辑器所选网格；省略时仅显示小节/拍文字。
 * @returns 与可见区域相交且不会互相覆盖的标签，位置为绝对内容坐标。
 */
export function rulerLabels(
  timeline: PianoRollTimeline,
  timeZoom: number,
  scrollLeft: number,
  width: number,
  measureText: (text: string) => number,
  gridTicks?: RulerMarkOptions['gridTicks']
): RulerMark[] {
  const barDigits = String(timeline.tickToBarPosition(timeline.durationTicks).bar).length
  let beatDigits = 1
  let subdivisionDigits = 0
  for (const meter of timeline.timeSignatureMap) {
    beatDigits = Math.max(beatDigits, String(meter.numerator).length)
    if (typeof gridTicks === 'number' && gridTicks > 0) {
      const subdivisions = (timeline.ticksPerBeat * 4) / meter.denominator / gridTicks
      if (subdivisions > 1)
        subdivisionDigits = Math.max(subdivisionDigits, String(Math.ceil(subdivisions)).length)
    }
  }
  let digitWidth = 0
  for (let digit = 0; digit <= 9; digit += 1)
    digitWidth = Math.max(digitWidth, measureText(String(digit)))
  const labelWidth =
    digitWidth * (barDigits + beatDigits + subdivisionDigits) +
    measureText('.') * (subdivisionDigits ? 2 : 1)
  const spacing = labelWidth + 12
  const marks = rulerMarks(timeline, {
    startSeconds: Math.max(0, scrollLeft - spacing) / timeZoom,
    endSeconds: (scrollLeft + width + spacing) / timeZoom,
    pixelsPerSecond: timeZoom,
    minSpacingPx: spacing,
    subdivisions: 1,
    gridTicks,
  })
  return marks.filter((mark, index) => {
    // 拍号变化可能截断前一小节；保留后一个标签，避免两段标签互相覆盖。
    // 只比较内容坐标中的相邻候选，不依赖已绘制标签或视口取整误差。
    const next = marks[index + 1]
    const end = mark.x + 5 + measureText(mark.label)
    return end >= scrollLeft && mark.x + 5 <= scrollLeft + width && (!next || end + 6 <= next.x + 5)
  })
}
