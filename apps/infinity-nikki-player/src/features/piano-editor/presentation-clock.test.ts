import { expect, it } from 'vitest'
import { PianoPresentationClock } from './presentation-clock'

it('延迟 IPC 的接收时刻不改变源时间，每个显示帧连续推进', () => {
  const clock = new PianoPresentationClock()
  clock.receive({ positionSeconds: 10, isPlaying: true, playbackRate: 2 }, 1000)
  expect(clock.read(1250, 100).positionSeconds).toBe(10.5)
  const positions = Array.from(
    { length: 60 },
    (_, i) => clock.read(1250 + (i * 1000) / 60, 100).positionSeconds
  )
  for (let i = 1; i < positions.length; i++)
    expect(positions[i]! - positions[i - 1]!).toBeCloseTo(2 / 60, 8)
})

it('暂停、向后 seek、切歌、倍速和曲尾采用新权威值，不平滑掉真实操作', () => {
  const clock = new PianoPresentationClock()
  clock.receive({ positionSeconds: 12, isPlaying: false, playbackRate: 1 }, 1000)
  expect(clock.read(1800, 100).positionSeconds).toBe(12)
  clock.receive({ positionSeconds: 3, isPlaying: true, playbackRate: 0.5 }, 2000)
  expect(clock.read(3000, 100).positionSeconds).toBe(3.5)
  expect(clock.read(3000, 3.2).positionSeconds).toBe(3.2)
  clock.receive({ positionSeconds: 0, isPlaying: false, playbackRate: 1 }, 3100)
  expect(clock.read(5000, 100).positionSeconds).toBe(0)
})
