/**
 * @fileOverview 按键时间轴编译器
 * @description
 * 把全曲音符区间编译为确定的 down/up 事件时间轴。编译是纯函数，
 * 所有物理约束（最短保持、同键最短间隔、同键冲突截断）都在这里一次性求解，
 * 执行阶段不再做任何时序决策。
 *
 * 核心原则：
 * 1. 不同物理键完全独立，互不截断——长音只受"同键下一次按下"约束。
 * 2. 时值不足 holdMs 的短音拉长到 holdMs，保证游戏轮询能识别（防吞音）。
 * 3. 同键相邻按下之间保证 gapMs 抬起间隔，保证游戏识别为两次独立按键。
 * 4. 同键过密（间隔 < holdMs + gapMs，物理上不可能同时满足两条约束）时，
 *    后音仍准时按下（节奏优先），保持与间隔按 holdMs:gapMs 比例压缩。
 */

import type { KeystrokeEvent, KeystrokeNote, KeystrokeTiming } from './types'

/** 同键归并后的保持区间。 */
interface KeyInterval {
  startMs: number
  endMs: number
}

/**
 * @description: 将音符列表编译为按键事件时间轴
 * @param {KeystrokeNote[]} notes 全曲音符列表（顺序不限）
 * @param {KeystrokeTiming} timing 按键时序约束
 * @return {KeystrokeEvent[]} 按时间升序排列的 down/up 事件，同键 down/up 严格交替
 */
export function compileKeystrokeTimeline(
  notes: KeystrokeNote[],
  timing: KeystrokeTiming
): KeystrokeEvent[] {
  const holdMs = Number.isFinite(timing.holdMs) ? Math.max(0, timing.holdMs) : 0
  const gapMs = Number.isFinite(timing.gapMs) ? Math.max(0, timing.gapMs) : 0

  // 按物理键分组；无效音符（缺 key、非有限数值）直接丢弃
  const intervalsByKey = new Map<string, KeyInterval[]>()
  for (const note of notes) {
    if (!note.key || !Number.isFinite(note.startMs) || !Number.isFinite(note.durationMs)) continue
    const startMs = Math.max(0, note.startMs)
    const intervals = intervalsByKey.get(note.key) ?? []
    intervals.push({ startMs, endMs: startMs + Math.max(0, note.durationMs) })
    intervalsByKey.set(note.key, intervals)
  }

  const events: KeystrokeEvent[] = []
  for (const [key, intervals] of intervalsByKey) {
    intervals.sort((a, b) => a.startMs - b.startMs)

    // 同键同一时刻的多个音符物理上只能按一次，归并为一次按下并保留最长时值
    const merged: KeyInterval[] = []
    for (const interval of intervals) {
      const last = merged[merged.length - 1]
      if (last && interval.startMs <= last.startMs) {
        last.endMs = Math.max(last.endMs, interval.endMs)
      } else {
        merged.push({ ...interval })
      }
    }

    for (let i = 0; i < merged.length; i++) {
      const current = merged[i]
      const next = merged[i + 1]
      // 期望抬起时刻：MIDI 时值和最短保持取较大者（短音拉长防吞音）
      const desiredUpMs = current.startMs + Math.max(current.endMs - current.startMs, holdMs)
      let upMs = desiredUpMs

      if (next) {
        const intervalMs = next.startMs - current.startMs
        if (intervalMs >= holdMs + gapMs) {
          // 常规情形：只在需要给同键下一次按下让路时截断，长音不受其他键影响
          upMs = Math.min(desiredUpMs, next.startMs - gapMs)
        } else {
          // 过密情形：保持与间隔无法同时满足，按 holdMs:gapMs 比例分配可用间隔，后音准时按下
          const totalMs = holdMs + gapMs
          upMs = current.startMs + (totalMs > 0 ? (intervalMs * holdMs) / totalMs : 0)
        }
      }

      events.push({ atMs: current.startMs, type: 'down', key })
      events.push({ atMs: Math.max(current.startMs, upMs), type: 'up', key })
    }
  }

  // 全局按时间升序；同一时刻 up 先于 down，保证 gapMs 为 0 时同键事件仍然交替
  events.sort((a, b) => a.atMs - b.atMs || upFirst(a) - upFirst(b))
  return events
}

/**
 * @description: 排序辅助，up 事件优先级更高
 * @param {KeystrokeEvent} event 按键事件
 * @return {number} up 返回 0，down 返回 1
 */
function upFirst(event: KeystrokeEvent): number {
  return event.type === 'up' ? 0 : 1
}
