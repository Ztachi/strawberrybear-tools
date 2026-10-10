import { describe, expect, it } from 'vitest'
import { createProject } from '@strawberrybear/midi-editor'
import { recordingBarToTick, recordingRangeInBars } from './range'

describe('录制小节范围换算', () => {
  it('默认 4/4 小节可超出空项目时长，扩界仍得到精确整数 tick', () => {
    const document = createProject().document
    document.durationTicks = 0
    document.timeSignatureMap = []
    expect(recordingBarToTick(document, 1)).toBe(0)
    expect(recordingBarToTick(document, 2)).toBe(1920)
    expect(recordingBarToTick(document, 12)).toBe(21120)
    expect(recordingBarToTick(document, 100_000)).toBe(191_998_080)
  })

  it('3/4 和完整小节上的拍号变化沿用公共时间轴的编号', () => {
    const document = createProject().document
    document.timeSignatureMap = [{ tick: 0, numerator: 3, denominator: 4 }]
    expect(recordingBarToTick(document, 2)).toBe(1440)
    expect(recordingBarToTick(document, 3)).toBe(2880)

    document.timeSignatureMap = [
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 1920, numerator: 3, denominator: 4 },
    ]
    expect(recordingBarToTick(document, 2)).toBe(1920)
    expect(recordingBarToTick(document, 3)).toBe(3360)
    expect(recordingBarToTick(document, 4)).toBe(4800)
  })

  it('拍号在小节中途变化时保留前方不完整小节，并兼容重复及非法拍号点', () => {
    const document = createProject().document
    document.timeSignatureMap = [
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 1000, numerator: 3, denominator: 4 },
      { tick: 1200, numerator: 3, denominator: 4 },
      { tick: 1500, numerator: 0, denominator: 4 },
      { tick: 2000, numerator: 4, denominator: 4 },
    ]
    expect(recordingBarToTick(document, 2)).toBe(1000)
    expect(recordingBarToTick(document, 3)).toBe(2000)
    expect(recordingBarToTick(document, 4)).toBe(3920)
    expect(recordingRangeInBars(document, { startTick: 999, endTick: 1000 })).toEqual({
      start: 1,
      end: 2,
    })
    expect(recordingRangeInBars(document, { startTick: 1000, endTick: 2001 })).toEqual({
      start: 2,
      end: 4,
    })
  })

  it('区间结束恰好在小节边界时不多包含一节，部分小节则补齐覆盖', () => {
    const document = createProject().document
    expect(recordingRangeInBars(document, { startTick: 0, endTick: 1920 })).toEqual({
      start: 1,
      end: 2,
    })
    expect(recordingRangeInBars(document, { startTick: 480, endTick: 1921 })).toEqual({
      start: 1,
      end: 3,
    })
    expect(recordingRangeInBars(document, { startTick: 1920, endTick: 2400 })).toEqual({
      start: 2,
      end: 3,
    })
    expect(recordingRangeInBars(document, { startTick: 1920, endTick: 1920 })).toEqual({
      start: 2,
      end: 3,
    })
    expect(recordingRangeInBars(document, { startTick: 1920, endTick: 0 })).toEqual({
      start: 2,
      end: 3,
    })
  })

  it('非法和越界小节输入安全归一化，非法 tick 区间保留最小可用范围', () => {
    const document = createProject().document
    for (const bar of [NaN, Infinity, -Infinity, -4, 0, 1.9]) {
      expect(recordingBarToTick(document, bar)).toBe(0)
    }
    expect(recordingBarToTick(document, 2.9)).toBe(1920)
    expect(recordingBarToTick(document, 100_001)).toBe(191_998_080)
    expect(recordingRangeInBars(document, { startTick: NaN, endTick: Infinity })).toEqual({
      start: 1,
      end: 2,
    })
    expect(recordingRangeInBars(document, { startTick: -480, endTick: -1 })).toEqual({
      start: 1,
      end: 2,
    })
    expect(recordingRangeInBars(document, { startTick: 1e308, endTick: 1e308 })).toEqual({
      start: Number.MAX_SAFE_INTEGER - 1,
      end: Number.MAX_SAFE_INTEGER,
    })
  })

  it('低 PPQ 的分数拍长边界返回首个可写入的整数 tick', () => {
    const document = createProject().document
    document.ticksPerBeat = 3
    document.timeSignatureMap = [{ tick: 0, numerator: 1, denominator: 8 }]
    expect(recordingBarToTick(document, 2)).toBe(2)
    expect(recordingBarToTick(document, 3)).toBe(3)
  })
})
