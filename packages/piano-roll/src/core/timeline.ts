import type {
  PianoRollDocument,
  PianoRollTimeline,
  RulerMark,
  RulerMarkOptions,
  TempoPoint,
  TickBarPosition,
  TimeSignaturePoint,
} from './model'

const DEFAULT_TEMPO = 500_000
const DEFAULT_PPQ = 480
const EPSILON = 1e-9

interface TempoSegment extends TempoPoint {
  seconds: number
  secondsPerTick: number
}

interface MeterSegment extends TimeSignaturePoint {
  bar: number
  beatTicks: number
  barTicks: number
}

/** 非有限值和负数不参与坐标运算，统一回退为 0。 */
function nonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

/** 对必须大于 0 的数值应用明确默认值。 */
function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

/** 返回最后一个不大于 target 的段索引；段表始终包含 tick/秒为 0 的首项。 */
function segmentIndex<T>(
  segments: readonly T[],
  target: number,
  value: (segment: T) => number
): number {
  let left = 0
  let right = segments.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (value(segments[middle]!) <= target) left = middle + 1
    else right = middle
  }
  return Math.max(0, left - 1)
}

/** 速度点忽略非法值、负 tick 归零，同一归一化 tick 使用最后一条有效输入。 */
function normalizeTempoMap(points: readonly TempoPoint[]): TempoPoint[] {
  const byTick = new Map<number, TempoPoint>([
    [0, { tick: 0, microsecondsPerQuarter: DEFAULT_TEMPO }],
  ])
  for (const point of points) {
    if (
      !Number.isFinite(point.tick) ||
      !Number.isFinite(point.microsecondsPerQuarter) ||
      point.microsecondsPerQuarter <= 0
    )
      continue
    const tick = nonnegative(point.tick)
    byTick.set(tick, { tick, microsecondsPerQuarter: point.microsecondsPerQuarter })
  }
  return Array.from(byTick.values()).sort((a, b) => a.tick - b.tick)
}

/** MIDI 分母必须是正的 2 次幂；重复相同拍号不额外开启小节。 */
function normalizeMeterMap(points: readonly TimeSignaturePoint[]): TimeSignaturePoint[] {
  const byTick = new Map<number, TimeSignaturePoint>([
    [0, { tick: 0, numerator: 4, denominator: 4 }],
  ])
  for (const point of points) {
    if (
      !Number.isFinite(point.tick) ||
      !Number.isInteger(point.numerator) ||
      point.numerator < 1 ||
      point.numerator > 255
    )
      continue
    if (
      !Number.isFinite(point.denominator) ||
      point.denominator < 1 ||
      point.denominator > 128 ||
      !Number.isInteger(Math.log2(point.denominator))
    )
      continue
    const tick = nonnegative(point.tick)
    byTick.set(tick, { tick, numerator: point.numerator, denominator: point.denominator })
  }
  const sorted = Array.from(byTick.values()).sort((a, b) => a.tick - b.tick)
  return sorted.filter(
    (point, index) =>
      index === 0 ||
      point.numerator !== sorted[index - 1]!.numerator ||
      point.denominator !== sorted[index - 1]!.denominator
  )
}

/**
 * 构造精确时间轴。预处理复杂度为 O(T log T + M log M)，单次 tick/秒转换为 O(log T)。
 *
 * @param document 原始 MIDI 文档。PPQ 非法时使用 480；无效速度、拍号点被忽略。
 * @returns 独立于输入数组的时间轴。负数/非有限坐标归零；允许在完整结束时间以后外推，便于视口留白。
 * @remarks tempo 保留原始微秒精度；durationTicks 只来自文档声明，不使用音符尾端推断。
 */
export function createTimeline(document: PianoRollDocument): PianoRollTimeline {
  const ticksPerBeat = Math.max(1, Math.round(positive(document.ticksPerBeat, DEFAULT_PPQ)))
  const tempoMap = normalizeTempoMap(document.tempoMap)
  const timeSignatureMap = normalizeMeterMap(document.timeSignatureMap)
  const durationTicks = nonnegative(document.durationTicks)
  const tempos: TempoSegment[] = []
  let smallestSecondsPerTick = Number.POSITIVE_INFINITY
  for (const point of tempoMap) {
    const previous = tempos[tempos.length - 1]
    const secondsPerTick = point.microsecondsPerQuarter / 1_000_000 / ticksPerBeat
    smallestSecondsPerTick = Math.min(smallestSecondsPerTick, secondsPerTick)
    tempos.push({
      ...point,
      seconds: previous
        ? previous.seconds + (point.tick - previous.tick) * previous.secondsPerTick
        : 0,
      secondsPerTick,
    })
  }
  const meters: MeterSegment[] = []
  for (const point of timeSignatureMap) {
    const previous = meters[meters.length - 1]
    const beatTicks = (ticksPerBeat * 4) / point.denominator
    meters.push({
      ...point,
      bar: previous
        ? previous.bar + Math.ceil((point.tick - previous.tick) / previous.barTicks - EPSILON)
        : 1,
      beatTicks,
      barTicks: beatTicks * point.numerator,
    })
  }

  function tickToSeconds(tick: number): number {
    const target = nonnegative(tick)
    const segment = tempos[segmentIndex(tempos, target, (point) => point.tick)]!
    return segment.seconds + (target - segment.tick) * segment.secondsPerTick
  }

  function secondsToTick(seconds: number): number {
    const target = nonnegative(seconds)
    const segment = tempos[segmentIndex(tempos, target, (point) => point.seconds)]!
    return segment.tick + (target - segment.seconds) / segment.secondsPerTick
  }

  function tickToBarPosition(tick: number): TickBarPosition {
    const target = nonnegative(tick)
    const segment = meters[segmentIndex(meters, target, (point) => point.tick)]!
    const offset = target - segment.tick
    const bars = Math.floor(offset / segment.barTicks)
    const tickInBar = offset - bars * segment.barTicks
    const beats = Math.floor(tickInBar / segment.beatTicks)
    return {
      bar: segment.bar + bars,
      beat: beats + 1,
      tickInBeat: tickInBar - beats * segment.beatTicks,
    }
  }

  function getRulerMarks(options: RulerMarkOptions): RulerMark[] {
    const startSeconds = Math.min(
      nonnegative(options.startSeconds),
      nonnegative(options.endSeconds)
    )
    const endSeconds = Math.max(nonnegative(options.startSeconds), nonnegative(options.endSeconds))
    const scale = positive(options.pixelsPerSecond, 1)
    const minSpacing = positive(options.minSpacingPx, 12)
    const maxMarks = Math.min(10_000, Math.max(1, Math.floor(positive(options.maxMarks, 2000))))
    const maximumSubdivision =
      2 ** Math.floor(Math.log2(Math.min(64, Math.max(1, positive(options.subdivisions, 4)))))
    const startTick = secondsToTick(startSeconds)
    const endTick = secondsToTick(endSeconds)
    // 密度以整份时间轴的最快 tempo 为基准；速度点进出视口不能改变已有刻度。
    // 较慢段允许更疏，换取滚动期间稳定的拍/小节序列。
    // 将可见区间宽度纳入密度选择；循环量与视口刻度数有关，不与整曲 tick 数有关。
    const spacing = Math.max(
      minSpacing,
      ((endSeconds - startSeconds) * scale) / Math.max(1, maxMarks - 1)
    )
    const result: RulerMark[] = []
    const firstMeter = segmentIndex(meters, startTick, (point) => point.tick)
    for (
      let index = firstMeter;
      index < meters.length && meters[index]!.tick <= endTick;
      index += 1
    ) {
      const meter = meters[index]!
      const nextTick = meters[index + 1]?.tick ?? Number.POSITIVE_INFINITY
      const leftTick = Math.max(startTick, meter.tick)
      const rightTick = Math.min(endTick, nextTick)
      let subdivisions = maximumSubdivision
      while (
        subdivisions > 1 &&
        (meter.beatTicks / subdivisions) * smallestSecondsPerTick * scale < spacing
      )
        subdivisions /= 2
      let stepBeats = 1 / subdivisions
      if (meter.beatTicks * smallestSecondsPerTick * scale < spacing) {
        const barPixels = meter.barTicks * smallestSecondsPerTick * scale
        const barStride = 2 ** Math.ceil(Math.log2(Math.max(1, spacing / barPixels)))
        stepBeats = meter.numerator * barStride
      }
      const stepTicks = meter.beatTicks * stepBeats
      const first = Math.max(0, Math.ceil((leftTick - meter.tick) / stepTicks - EPSILON))
      const last = Math.floor((rightTick - meter.tick) / stepTicks + EPSILON)
      for (let unit = first; unit <= last; unit += 1) {
        const tick = meter.tick + unit * stepTicks
        if (tick >= nextTick || tick < startTick - EPSILON || tick > endTick + EPSILON) continue
        const relativeBeats = unit * stepBeats
        const isBar =
          Math.abs(relativeBeats / meter.numerator - Math.round(relativeBeats / meter.numerator)) <
          EPSILON
        const isBeat = Math.abs(relativeBeats - Math.round(relativeBeats)) < EPSILON
        const position = tickToBarPosition(tick)
        const seconds = tickToSeconds(tick)
        result.push({
          tick,
          seconds,
          x: seconds * scale,
          kind: isBar ? 'bar' : isBeat ? 'beat' : 'subdivision',
          bar: position.bar,
          beat: position.beat,
          label: isBar ? String(position.bar) : isBeat ? `${position.bar}.${position.beat}` : '',
        })
        if (result.length >= maxMarks) return result
      }
    }
    return result
  }

  return {
    ticksPerBeat,
    tempoMap,
    timeSignatureMap,
    durationTicks,
    durationSeconds: tickToSeconds(durationTicks),
    tickToSeconds,
    secondsToTick,
    tickToBeat: (tick) => nonnegative(tick) / ticksPerBeat,
    tickToBarPosition,
    secondsToContentX: (seconds, pixelsPerSecond) =>
      nonnegative(seconds) * positive(pixelsPerSecond, 1),
    contentXToSeconds: (x, pixelsPerSecond) => nonnegative(x) / positive(pixelsPerSecond, 1),
    getRulerMarks,
  }
}
