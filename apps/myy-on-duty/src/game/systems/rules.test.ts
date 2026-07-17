import { describe, expect, it } from 'vitest'
import { BALANCE } from '@/config/balance'
import {
  addMaterial,
  calculateResult,
  drawMaterial,
  inventoryValue,
  selectEvent,
  settleInspection,
} from '@/game/systems/rules'
import type { GameSession } from '@/game/types'

const session: GameSession = {
  id: 'test',
  phase: 'ended',
  startedAt: 0,
  elapsedMs: 600_000,
  currency: 5000,
  inventory: [],
  collected: [],
  combo: 0,
  maxCombo: 20,
  sales: [],
  targets: { week: true, purchase: true, limit: true },
  event: null,
  eventHistory: ['wanted'],
  rescueAvailable: true,
  rescueCount: 0,
  stats: { loop: 2, special: 1 },
  physics: { x: 0, y: 0, vx: 0, vy: 0 },
  configVersion: BALANCE.version,
}

describe('玩法规则', () => {
  it('材料权重边界稳定', () => {
    expect(drawMaterial('farm', false, 0).id).toBe('cupAroma')
    expect(drawMaterial('farm', false, 0.999).id).toBe('cloudFruit')
    expect(BALANCE.materials.farm.reduce((sum, item) => sum + item.normalWeight, 0)).toBe(100)
  })

  it('库存按材料编号合并并正确估值', () => {
    const material = BALANCE.materials.farm[0]
    const inventory = addMaterial(addMaterial([], material, 'farm'), material, 'farm', 2)
    expect(inventory).toHaveLength(1)
    expect(inventory[0].count).toBe(3)
    expect(inventoryValue(inventory)).toBe(30)
  })

  it('验收倍率在 1.2 到 1.4 之间且整批取整', () => {
    const material = BALANCE.materials.nest[4]
    const inventory = addMaterial([], material, 'nest', 3)
    expect(settleInspection(inventory, 0).earned).toBe(504)
    expect(settleInspection(inventory, 0.999).earned).toBe(588)
  })

  it('事件不会与上一事件连续重复', () => {
    expect(selectEvent(session, 0)).not.toBe('wanted')
  })

  it('称号计算始终产出有效区间与三条亮点', () => {
    const result = calculateResult(session)
    expect(BALANCE.title.ranges.some((range) => range.key === result.title)).toBe(true)
    expect(result.highlights).toHaveLength(3)
  })
})
