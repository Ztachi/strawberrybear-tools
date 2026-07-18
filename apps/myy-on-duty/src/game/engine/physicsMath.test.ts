import { describe, expect, it } from 'vitest'
import { normalizeAngle, stepAngleTowards } from '@/game/engine/physicsMath'

describe('拍板角度推进', () => {
  it('右拍板跨过 π 边界时沿短弧推进', () => {
    const current = Math.PI - 0.05
    const target = -Math.PI + 0.55
    const next = stepAngleTowards(current, target, 0.15)

    expect(normalizeAngle(next - current)).toBeCloseTo(0.15, 6)
  })

  it('长按后会收敛到目标角且不会累计整圈', () => {
    const target = -Math.PI + 0.55
    let angle = Math.PI - 0.32

    for (let index = 0; index < 240; index += 1) {
      angle = stepAngleTowards(angle, target, 0.15)
      expect(angle).toBeGreaterThanOrEqual(-Math.PI)
      expect(angle).toBeLessThanOrEqual(Math.PI)
    }

    expect(angle).toBeCloseTo(target, 6)
  })
})
