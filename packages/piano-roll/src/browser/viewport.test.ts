import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clamp,
  createResizeScheduler,
  dragScrollVelocity,
  followScrollLeft,
  resizeScrollLeft,
  timeZoomBounds,
  zoomScrollLeft,
} from './viewport'

describe('独立视口坐标和 Follow', () => {
  it('缩放锚点保持同一原曲时间', () => {
    const after = zoomScrollLeft(600, 120, 300, 180)
    expect((after + 180) / 300).toBe((600 + 180) / 120)
  })
  it('容器变化保留中心原曲时间', () => {
    const after = resizeScrollLeft(600, 120, 200, 800, 1000)
    expect((after + 500) / 200).toBe((600 + 400) / 120)
    expect(resizeScrollLeft(0, 120, 200, 0, 800)).toBe(0)
  })
  it('整曲下限使用实际时间视口宽度，不添加尾部空白', () => {
    expect(timeZoomBounds(936, 120)).toEqual({ minTimeZoom: 7.8, maxTimeZoom: 1200 })
    expect(timeZoomBounds(800, 10_000_000).minTimeZoom).toBe(0.00008)
    expect(timeZoomBounds(800, 0.01)).toEqual({ minTimeZoom: 80000, maxTimeZoom: 80000 })
  })
  it('空曲和无效尺寸的缩放界限始终有限', () => {
    for (const [width, duration] of [
      [0, 12],
      [800, 0],
      [800, Number.NaN],
      [Number.POSITIVE_INFINITY, 1],
    ]) {
      expect(timeZoomBounds(width!, duration!)).toEqual({ minTimeZoom: 0.001, maxTimeZoom: 1200 })
    }
  })
  it('Follow 只在播放头离开安全范围后调整滚动', () => {
    expect(followScrollLeft(600, 500, 800)).toBeNull()
    expect(followScrollLeft(1200, 500, 800)).toBe(1000)
    expect(followScrollLeft(0, 500, 800)).toBe(0)
    expect(followScrollLeft(1200, 500, 0)).toBeNull()
  })
  it('边缘拖动支持左右方向且限速', () => {
    expect(dragScrollVelocity(200, 800)).toBe(0)
    expect(dragScrollVelocity(0, 800)).toBeLessThan(0)
    expect(dragScrollVelocity(799, 800)).toBeGreaterThan(0)
    expect(dragScrollVelocity(10000, 800)).toBe(1080)
  })
  it('非法尺寸使用有限默认值', () => {
    expect(clamp(Number.NaN, 8, 36, 16)).toBe(16)
    expect(clamp(-100, 8, 36)).toBe(8)
  })
})

describe('容器测量防抖', () => {
  afterEach(() => vi.useRealTimers())
  it('连续尺寸通知合并为末次更新', () => {
    vi.useFakeTimers()
    const callback = vi.fn()
    const scheduler = createResizeScheduler(callback)
    scheduler.schedule()
    vi.advanceTimersByTime(40)
    scheduler.schedule()
    vi.advanceTimersByTime(59)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(200)
    expect(callback).toHaveBeenCalledTimes(1)
  })
  it('持续拖动在最大等待时间内仍会更新，销毁可取消两个计时器', () => {
    vi.useFakeTimers()
    const callback = vi.fn()
    const scheduler = createResizeScheduler(callback)
    for (let index = 0; index < 5; index += 1) {
      scheduler.schedule()
      vi.advanceTimersByTime(40)
    }
    expect(callback).toHaveBeenCalledTimes(1)
    scheduler.schedule()
    scheduler.cancel()
    vi.advanceTimersByTime(300)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
