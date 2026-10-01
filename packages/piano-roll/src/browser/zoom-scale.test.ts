import { describe, expect, it } from 'vitest'
import { sliderToTimeZoom, timeZoomToSlider } from './zoom-scale'

describe('倍率滑块', () => {
  it('端点严格对应一屏和上限，低倍区没有不可见死区', () => {
    const min = 0.73123456789
    expect(sliderToTimeZoom(0, min, 1200)).toBe(min)
    expect(sliderToTimeZoom(100, min, 1200)).toBe(1200)
    expect(timeZoomToSlider(min, min, 1200)).toBe(0)
    const firstDouble = timeZoomToSlider(min * 2, min, 1200)
    const secondDouble = timeZoomToSlider(min * 4, min, 1200)
    expect(firstDouble).toBeGreaterThan(9)
    expect(secondDouble - firstDouble).toBeCloseTo(firstDouble, 10)
  })
  it('任意小数手势与滑块双向可逆，容器改变只调整端点', () => {
    for (const min of [0.001, 2.38145, 185, 1200]) {
      for (const value of [0, 0.0001, 1, 23.14159, 99, 100]) {
        const zoom = sliderToTimeZoom(value, min, 1200)
        expect(timeZoomToSlider(zoom, min, 1200)).toBeCloseTo(min === 1200 ? 0 : value, 8)
      }
    }
  })
})
