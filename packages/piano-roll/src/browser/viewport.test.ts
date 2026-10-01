import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clamp,
  createResizeScheduler,
  dragScrollVelocity,
  projectPlaybackViewport,
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
    expect(timeZoomBounds(936, 120)).toEqual({ minTimeZoom: 7.8, maxTimeZoom: 4800 })
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
      expect(timeZoomBounds(width!, duration!)).toEqual({ minTimeZoom: 0.001, maxTimeZoom: 4800 })
    }
  })
  it('自动播放分三段：开头指针移动，中段指针固定，曲尾指针再次移动', () => {
    const positions = [0, 200, 400, 500, 600, 700, 1000]
    expect(positions.map((x) => projectPlaybackViewport(x, 800, 1000, 73, true))).toEqual([
      { scrollLeft: 0, playheadX: 0 },
      { scrollLeft: 0, playheadX: 200 },
      { scrollLeft: 0, playheadX: 400 },
      { scrollLeft: 100, playheadX: 400 },
      { scrollLeft: 200, playheadX: 400 },
      { scrollLeft: 200, playheadX: 500 },
      { scrollLeft: 200, playheadX: 800 },
    ])
  })
  it('高缩放及小数视口中线不受原生 scrollLeft 取整或陈旧坐标影响', () => {
    for (const x of [12_000.125, 12_020.75, 12_083.01, 13_500.42]) {
      for (const nativeLeft of [0, Math.round(x - 400.25), x - 412, 20_000]) {
        const projected = projectPlaybackViewport(x, 800.5, 30_000.75, nativeLeft, true)
        expect(projected.playheadX).toBe(400.25)
        expect(projected.scrollLeft + projected.playheadX).toBe(x)
      }
    }
  })
  it('手动浏览完全保留视口，播放头允许在左右两侧不可见', () => {
    expect(projectPlaybackViewport(20, 800, 5000, 2000, false)).toEqual({
      scrollLeft: 2000,
      playheadX: -1980,
    })
    expect(projectPlaybackViewport(4500, 800, 5000, 2000, false)).toEqual({
      scrollLeft: 2000,
      playheadX: 2500,
    })
  })
  it('空曲和全曲一屏时内容保持静止，首尾衔接不跳变', () => {
    expect(projectPlaybackViewport(0, 800, 0, 0, true)).toEqual({ scrollLeft: 0, playheadX: 0 })
    expect(projectPlaybackViewport(640, 800, 800, 0, true)).toEqual({
      scrollLeft: 0,
      playheadX: 640,
    })
    for (const x of [400 - 0.001, 400, 400 + 0.001, 600 - 0.001, 600, 600 + 0.001]) {
      const projected = projectPlaybackViewport(x, 800, 1000, 0, true)
      expect(projected.scrollLeft + projected.playheadX).toBeCloseTo(x, 9)
      expect(projected.scrollLeft).toBeGreaterThanOrEqual(0)
      expect(projected.scrollLeft).toBeLessThanOrEqual(200)
    }
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
