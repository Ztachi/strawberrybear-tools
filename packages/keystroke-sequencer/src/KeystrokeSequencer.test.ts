/**
 * @fileOverview 按键序列执行器单元测试
 * @description 使用假定时器验证事件派发时序、暂停释放、跨界长音恢复、seek、速度与自然结束。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeystrokeSequencer } from './KeystrokeSequencer'
import type { KeystrokeNote } from './types'

/** 测试统一使用的时序约束。 */
const TIMING = { holdMs: 54, gapMs: 54 }

/** 记录的按键动作。 */
interface RecordedAction {
  type: 'down' | 'up'
  key: string
  atMs: number
}

/**
 * @description: 创建带动作记录的执行器
 * @param {KeystrokeNote[]} notes 音符列表
 * @param {number} [speed] 播放速度
 * @return {{ sequencer: KeystrokeSequencer, actions: RecordedAction[], ended: () => boolean }} 执行器与记录
 */
function createRecordedSequencer(notes: KeystrokeNote[], speed?: number) {
  const actions: RecordedAction[] = []
  let endedFlag = false
  const startMs = Date.now()
  const sequencer = new KeystrokeSequencer({
    notes,
    timing: TIMING,
    speed,
    // 假定时器下 Date.now 与 advanceTimersByTime 同步推进，作为测试时钟
    now: () => Date.now(),
    onKeyDown: (key) => actions.push({ type: 'down', key, atMs: Date.now() - startMs }),
    onKeyUp: (key) => actions.push({ type: 'up', key, atMs: Date.now() - startMs }),
    onEnded: () => {
      endedFlag = true
    },
  })
  return { sequencer, actions, ended: () => endedFlag }
}

describe('KeystrokeSequencer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('按时间轴准确派发 down/up 事件', () => {
    const { sequencer, actions } = createRecordedSequencer([
      { key: 'A', startMs: 0, durationMs: 200 },
      { key: 'S', startMs: 100, durationMs: 200 },
    ])
    sequencer.play()

    vi.advanceTimersByTime(0)
    expect(actions).toEqual([{ type: 'down', key: 'A', atMs: 0 }])

    vi.advanceTimersByTime(100)
    expect(actions).toContainEqual({ type: 'down', key: 'S', atMs: 100 })

    vi.advanceTimersByTime(200)
    expect(actions).toContainEqual({ type: 'up', key: 'A', atMs: 200 })
    expect(actions).toContainEqual({ type: 'up', key: 'S', atMs: 300 })
    sequencer.dispose()
  })

  it('暂停时抬起按下的键，恢复时重按跨界长音且不重复派发已过事件', () => {
    const { sequencer, actions } = createRecordedSequencer([
      { key: 'A', startMs: 0, durationMs: 1000 },
      { key: 'S', startMs: 100, durationMs: 100 },
    ])
    sequencer.play()
    vi.advanceTimersByTime(300) // S 已完整弹完，A 仍按住

    sequencer.pause()
    expect(actions.filter((a) => a.key === 'A')).toEqual([
      { type: 'down', key: 'A', atMs: 0 },
      { type: 'up', key: 'A', atMs: 300 }, // 暂停释放
    ])

    sequencer.resume()
    vi.advanceTimersByTime(0)
    // 跨界长音 A 恢复时重按；S 的事件不再重复
    expect(actions.filter((a) => a.key === 'A')).toHaveLength(3)
    expect(actions.filter((a) => a.key === 'S')).toHaveLength(2)

    vi.advanceTimersByTime(700)
    // A 在原定 1000ms 处抬起
    expect(actions[actions.length - 1]).toEqual({ type: 'up', key: 'A', atMs: 1000 })
    sequencer.dispose()
  })

  it('seek 跳过中间事件，被跳过 down 的 up 不会派发', () => {
    const { sequencer, actions } = createRecordedSequencer([
      { key: 'A', startMs: 0, durationMs: 100 },
      { key: 'S', startMs: 500, durationMs: 100 },
    ])
    sequencer.play()
    vi.advanceTimersByTime(10)
    sequencer.seek(450) // 跳过 A 的 up（A 被 play 内部先行释放）

    vi.advanceTimersByTime(50)
    expect(actions.filter((a) => a.key === 'S')[0]).toMatchObject({ type: 'down', key: 'S' })

    vi.advanceTimersByTime(200)
    // A 只有 play 时的 down 和 seek 时的释放 up，没有多余事件
    expect(actions.filter((a) => a.key === 'A')).toHaveLength(2)
    sequencer.dispose()
  })

  it('stop 抬起所有键并归零位置', () => {
    const { sequencer, actions } = createRecordedSequencer([
      { key: 'A', startMs: 0, durationMs: 1000 },
    ])
    sequencer.play()
    vi.advanceTimersByTime(100)
    sequencer.stop()

    expect(actions).toEqual([
      { type: 'down', key: 'A', atMs: 0 },
      { type: 'up', key: 'A', atMs: 100 },
    ])
    expect(sequencer.getPositionMs()).toBe(0)
    expect(sequencer.status).toBe('idle')
  })

  it('speed 为 2 时真实耗时减半', () => {
    const { sequencer, actions } = createRecordedSequencer(
      [{ key: 'A', startMs: 0, durationMs: 400 }],
      2
    )
    sequencer.play()
    vi.advanceTimersByTime(200)

    expect(actions).toEqual([
      { type: 'down', key: 'A', atMs: 0 },
      { type: 'up', key: 'A', atMs: 200 },
    ])
    sequencer.dispose()
  })

  it('时间轴走完后进入 ended 状态并触发 onEnded', () => {
    const { sequencer, ended } = createRecordedSequencer([
      { key: 'A', startMs: 0, durationMs: 100 },
    ])
    sequencer.play()
    vi.advanceTimersByTime(200)

    expect(ended()).toBe(true)
    expect(sequencer.status).toBe('ended')
    expect(sequencer.getPositionMs()).toBe(100)
  })

  it('空音符列表播放后立即结束且不派发任何事件', () => {
    const { sequencer, actions, ended } = createRecordedSequencer([])
    sequencer.play()
    vi.advanceTimersByTime(0)

    expect(actions).toEqual([])
    expect(ended()).toBe(true)
  })
})
