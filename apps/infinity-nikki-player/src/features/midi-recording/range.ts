import { createTimeline, type PianoRollDocument } from '@strawberrybear/piano-roll/core'

const MAX_RECORDING_BAR = 100_000
const MAX_SEARCH_TICK = Number.MAX_SAFE_INTEGER

/**
 * @description 将录制设置中的小节号换算成可写入 MIDI 的整数起始 tick。
 * @param document 提供 PPQ 与拍号变化的原始文档。
 * @param bar 从 1 开始的小节号；非有限值回退为 1，其余值向下取整并限制到 1–100000。
 * @return 非负整数 tick；非整数拍号边界采用第一个进入目标小节的整数 tick。
 */
export function recordingBarToTick(document: PianoRollDocument, bar: number): number {
  const target = Number.isFinite(bar)
    ? Math.min(MAX_RECORDING_BAR, Math.max(1, Math.floor(bar)))
    : 1
  if (target === 1) return 0

  const timeline = createTimeline(document)
  let lower = 0
  let upper = Math.min(
    MAX_SEARCH_TICK,
    Math.max(1, Math.ceil(timeline.durationTicks), timeline.ticksPerBeat * 4)
  )
  // 拍号可能在半小节处变化，不能用固定拍长反推；复用公共时间轴的小节顺序扩界。
  while (timeline.tickToBarPosition(upper).bar < target && upper < MAX_SEARCH_TICK) {
    upper = Math.min(MAX_SEARCH_TICK, upper * 2)
  }

  // 使用整数 lower-bound，保留公共时间轴对变拍号与不完整小节的统一解释。
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2)
    if (timeline.tickToBarPosition(middle).bar < target) lower = middle + 1
    else upper = middle
  }
  return lower
}

/**
 * @description 将半开录制区间扩展成覆盖该区间的小节起止号。
 * @param document 提供 PPQ 与拍号变化的原始文档。
 * @param range tick 区间；非法坐标归零，空区间或反向区间至少保留一个小节。
 * @return 起始小节与不包含的结束小节，结束值始终大于起始值，极端坐标限制在安全整数内。
 */
export function recordingRangeInBars(
  document: PianoRollDocument,
  range: { startTick: number; endTick: number }
): { start: number; end: number } {
  const timeline = createTimeline(document)
  const startTick = Number.isFinite(range.startTick) ? Math.max(0, Math.floor(range.startTick)) : 0
  const endTick = Number.isFinite(range.endTick) ? Math.max(0, Math.ceil(range.endTick)) : startTick
  // 畸形文档的极小拍长或极大坐标可能生成不可精确表示的小节号，仍须留出结束值。
  const start = Math.min(MAX_SEARCH_TICK - 1, timeline.tickToBarPosition(startTick).bar)
  // MIDI 区间不包含结束 tick；精确停在小节边界时不能再多包含后一小节。
  const lastTick = Math.max(startTick, endTick - 1)
  const end = Math.min(
    MAX_SEARCH_TICK,
    Math.max(start + 1, timeline.tickToBarPosition(lastTick).bar + 1)
  )
  return { start, end }
}
