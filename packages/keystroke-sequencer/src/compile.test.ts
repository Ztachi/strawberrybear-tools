/**
 * @fileOverview 按键时间轴编译器单元测试
 * @description 覆盖长音保真、同键约束、短音拉长、过密压缩和输出结构不变量。
 */
import { describe, expect, it } from 'vitest'
import { compileKeystrokeTimeline } from './compile'
import type { KeystrokeEvent, KeystrokeNote } from './types'

/** 测试统一使用的时序约束：60fps 推荐值。 */
const TIMING = { holdMs: 54, gapMs: 54 }

/**
 * @description: 取指定键的事件序列
 * @param {KeystrokeEvent[]} events 全部事件
 * @param {string} key 物理键
 * @return {KeystrokeEvent[]} 该键的事件（保持原顺序）
 */
function eventsOf(events: KeystrokeEvent[], key: string): KeystrokeEvent[] {
  return events.filter((event) => event.key === key)
}

describe('compileKeystrokeTimeline', () => {
  it('长音不被其他键的音符截断（核心回归：后按的音不截断先弹的长音）', () => {
    const notes: KeystrokeNote[] = [
      { key: 'A', startMs: 0, durationMs: 2000 },
      // 长音期间另一只手弹的密集旋律，全部在其他键上
      { key: 'S', startMs: 100, durationMs: 80 },
      { key: 'D', startMs: 300, durationMs: 80 },
      { key: 'F', startMs: 500, durationMs: 80 },
      { key: 'G', startMs: 700, durationMs: 80 },
    ]
    const events = compileKeystrokeTimeline(notes, TIMING)
    const aEvents = eventsOf(events, 'A')

    expect(aEvents).toEqual([
      { atMs: 0, type: 'down', key: 'A' },
      { atMs: 2000, type: 'up', key: 'A' },
    ])
  })

  it('短音时值不足 holdMs 时拉长到 holdMs（防吞音）', () => {
    const events = compileKeystrokeTimeline([{ key: 'A', startMs: 100, durationMs: 10 }], TIMING)

    expect(events).toEqual([
      { atMs: 100, type: 'down', key: 'A' },
      { atMs: 154, type: 'up', key: 'A' },
    ])
  })

  it('同键相邻时前音截断到下一次按下前 gapMs', () => {
    const notes: KeystrokeNote[] = [
      { key: 'A', startMs: 0, durationMs: 1000 },
      { key: 'A', startMs: 500, durationMs: 300 },
    ]
    const events = compileKeystrokeTimeline(notes, TIMING)

    expect(eventsOf(events, 'A')).toEqual([
      { atMs: 0, type: 'down', key: 'A' },
      { atMs: 446, type: 'up', key: 'A' }, // 500 - gapMs
      { atMs: 500, type: 'down', key: 'A' },
      { atMs: 800, type: 'up', key: 'A' },
    ])
  })

  it('短音拉长不会挤占同键下一次按下的间隔', () => {
    const notes: KeystrokeNote[] = [
      { key: 'A', startMs: 0, durationMs: 10 },
      { key: 'A', startMs: 120, durationMs: 100 },
    ]
    const events = compileKeystrokeTimeline(notes, TIMING)

    // 期望抬起 54ms（拉长后），上限 120 - 54 = 66ms，二者取小仍是 54ms，保持完整
    expect(eventsOf(events, 'A')[1]).toEqual({ atMs: 54, type: 'up', key: 'A' })
  })

  it('同键过密时后音准时按下，保持与间隔按比例压缩', () => {
    const notes: KeystrokeNote[] = [
      { key: 'A', startMs: 0, durationMs: 60 },
      { key: 'A', startMs: 60, durationMs: 200 }, // 间隔 60 < holdMs + gapMs = 108
    ]
    const events = compileKeystrokeTimeline(notes, TIMING)

    expect(eventsOf(events, 'A')).toEqual([
      { atMs: 0, type: 'down', key: 'A' },
      { atMs: 30, type: 'up', key: 'A' }, // 60 * 54 / 108
      { atMs: 60, type: 'down', key: 'A' }, // 后音仍准时
      { atMs: 260, type: 'up', key: 'A' },
    ])
  })

  it('同键同一时刻的多个音符归并为一次按下并保留最长时值', () => {
    const notes: KeystrokeNote[] = [
      { key: 'A', startMs: 100, durationMs: 200 },
      { key: 'A', startMs: 100, durationMs: 800 },
    ]
    const events = compileKeystrokeTimeline(notes, TIMING)

    expect(eventsOf(events, 'A')).toEqual([
      { atMs: 100, type: 'down', key: 'A' },
      { atMs: 900, type: 'up', key: 'A' },
    ])
  })

  it('和弦（多键同刻）互不影响，各自完整保持', () => {
    const notes: KeystrokeNote[] = [
      { key: 'A', startMs: 0, durationMs: 500 },
      { key: 'S', startMs: 0, durationMs: 500 },
      { key: 'D', startMs: 0, durationMs: 500 },
    ]
    const events = compileKeystrokeTimeline(notes, TIMING)

    for (const key of ['A', 'S', 'D']) {
      expect(eventsOf(events, key)).toEqual([
        { atMs: 0, type: 'down', key },
        { atMs: 500, type: 'up', key },
      ])
    }
  })

  it('丢弃无效音符并容忍空输入', () => {
    expect(compileKeystrokeTimeline([], TIMING)).toEqual([])
    expect(
      compileKeystrokeTimeline(
        [
          { key: '', startMs: 0, durationMs: 100 },
          { key: 'A', startMs: Number.NaN, durationMs: 100 },
          { key: 'A', startMs: 0, durationMs: Number.POSITIVE_INFINITY },
        ],
        TIMING
      )
    ).toEqual([])
  })

  it('任意复杂输入下满足结构不变量：全局有序、同键 down/up 严格交替、同键间隔约束', () => {
    // 构造一个含长音、和弦、同键重复、过密音的复杂输入
    const notes: KeystrokeNote[] = []
    for (let i = 0; i < 200; i++) {
      notes.push({
        key: ['A', 'S', 'D', 'F', 'G'][i % 5],
        startMs: (i * 37) % 3000,
        durationMs: (i * 91) % 800,
      })
    }
    const events = compileKeystrokeTimeline(notes, TIMING)

    // 全局时间有序
    for (let i = 1; i < events.length; i++) {
      expect(events[i].atMs).toBeGreaterThanOrEqual(events[i - 1].atMs)
    }

    // 同键 down/up 严格交替，且相邻两次按下之间抬起间隔不为负
    const lastType = new Map<string, string>()
    const lastUpAt = new Map<string, number>()
    for (const event of events) {
      expect(event.type).not.toBe(lastType.get(event.key))
      if (event.type === 'down') {
        const upAt = lastUpAt.get(event.key)
        if (upAt !== undefined) {
          expect(event.atMs).toBeGreaterThanOrEqual(upAt)
        }
      } else {
        lastUpAt.set(event.key, event.atMs)
      }
      lastType.set(event.key, event.type)
    }
  })
})
