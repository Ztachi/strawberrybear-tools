import { describe, expect, it } from 'vitest'
import { clamp, dragScrollVelocity, followScrollLeft, zoomScrollLeft } from './viewport'

describe('独立视口坐标和 Follow', () => {
  it('缩放锚点保持同一原曲时间', () => {
    const after = zoomScrollLeft(600, 120, 300, 180)
    expect((after + 180) / 300).toBe((600 + 180) / 120)
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
