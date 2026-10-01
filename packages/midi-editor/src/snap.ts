import type { PianoRollDocument, TimeSignaturePoint } from '@strawberrybear/piano-roll/core'
import type { SnapMode, SnapResolution } from './model'

/** 分辨率对应的四分音符倍数（三连音为 2/3）；`bar` 与 `off` 单独处理。 */
const BEAT_MULTIPLIERS: Record<Exclude<SnapResolution, 'bar' | 'off'>, number> = {
  '1/1': 4,
  '1/2': 2,
  '1/4': 1,
  '1/8': 1 / 2,
  '1/16': 1 / 4,
  '1/32': 1 / 8,
  '1/4t': 2 / 3,
  '1/8t': 1 / 3,
  '1/16t': 1 / 6,
}

/** 找到在 tick 处生效的拍号；空表或全部晚于 tick 时回退到 4/4。 */
function meterAt(map: readonly TimeSignaturePoint[], tick: number): TimeSignaturePoint {
  let current: TimeSignaturePoint = { tick: 0, numerator: 4, denominator: 4 }
  for (const point of map) {
    if (point.tick <= tick && point.tick >= current.tick) current = point
  }
  return current
}

/**
 * @description: 计算某分辨率在 tick 处的网格步长。
 * @param {SnapResolution} resolution 吸附分辨率
 * @param {PianoRollDocument} document 提供 PPQ 与拍号图
 * @param {number} tick 参考位置；只对 `bar` 有影响
 * @return {number} 步长 tick；`off` 返回 0
 */
export function resolutionTicks(
  resolution: SnapResolution,
  document: PianoRollDocument,
  tick = 0
): number {
  if (resolution === 'off') return 0
  const ppq = document.ticksPerBeat > 0 ? document.ticksPerBeat : 480
  if (resolution === 'bar') {
    const meter = meterAt(document.timeSignatureMap, tick)
    return ((ppq * 4) / meter.denominator) * meter.numerator
  }
  return ppq * BEAT_MULTIPLIERS[resolution]
}

/**
 * @description: 把 tick 吸附到网格；网格相位以当前拍号段起点为锚，保证拍号变化后小节线对齐。
 * @param {number} tick 原始 tick
 * @param {SnapResolution} resolution 吸附分辨率
 * @param {PianoRollDocument} document 提供 PPQ 与拍号图
 * @param {SnapMode} mode nearest 取最近，floor 向下取
 * @return {number} 吸附后的非负 tick
 */
export function snapTick(
  tick: number,
  resolution: SnapResolution,
  document: PianoRollDocument,
  mode: SnapMode = 'nearest'
): number {
  const safe = Number.isFinite(tick) ? Math.max(0, tick) : 0
  const step = resolutionTicks(resolution, document, safe)
  if (step <= 0) return safe
  const anchor = meterAt(document.timeSignatureMap, safe).tick
  const units = (safe - anchor) / step
  const snapped = anchor + (mode === 'floor' ? Math.floor(units + 1e-9) : Math.round(units)) * step
  return Math.max(0, Math.round(snapped))
}
