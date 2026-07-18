import { describe, expect, it } from 'vitest'
import { BALANCE } from '@/config/balance'
import { BOARD, hasEnteredMainPlayfield } from '@/config/board'

describe('台面几何配置', () => {
  it('发射弹簧位于独立通道且不与右外道判定重叠', () => {
    const outlane = BOARD.sensors.find((sensor) => sensor.id === 'rightOutlane')
    expect(outlane).toBeDefined()
    if (!outlane) return
    const outlaneRight = outlane.x + outlane.width / 2
    const launcherLeft = BOARD.launcher.x - BOARD.launcher.width / 2
    expect(outlaneRight).toBeLessThan(launcherLeft)
  })

  it('墙体和传感器编号唯一', () => {
    const wallIds = BOARD.walls.map((wall) => wall.id)
    const sensorIds = BOARD.sensors.map((sensor) => sensor.id)
    expect(new Set(wallIds).size).toBe(wallIds.length)
    expect(new Set(sensorIds).size).toBe(sensorIds.length)
  })

  it('发射通道中心线周围没有其他墙体阻挡', () => {
    const channelBounds = {
      left: BOARD.launcher.x - BALANCE.physics.ballRadius,
      right: BOARD.launcher.x + BALANCE.physics.ballRadius,
    }
    const channelWallIds = new Set([
      'outer-right',
      'launcher-inner',
      'launcher-floor',
      'launcher-curve',
    ])
    const blockingWalls = BOARD.walls.filter((wall) => {
      if (channelWallIds.has(wall.id)) return false
      const minX = Math.min(wall.x1, wall.x2)
      const maxX = Math.max(wall.x1, wall.x2)
      const minY = Math.min(wall.y1, wall.y2)
      const maxY = Math.max(wall.y1, wall.y2)
      const crossesLauncher = minX < channelBounds.right && maxX > channelBounds.left
      const overlapsLauncherHeight = maxY > BOARD.launcher.top && minY < BOARD.launcher.bottom
      return crossesLauncher && overlapsLauncherHeight
    })

    expect(blockingWalls).toEqual([])
  })

  it('关键几何都保持在 720×1280 设计坐标内', () => {
    for (const wall of BOARD.walls) {
      expect([wall.x1, wall.x2]).toEqual(
        expect.arrayContaining([expect.any(Number), expect.any(Number)])
      )
      expect(wall.x1).toBeGreaterThanOrEqual(0)
      expect(wall.x2).toBeLessThanOrEqual(BOARD.width)
      expect(wall.y1).toBeGreaterThanOrEqual(0)
      expect(wall.y2).toBeLessThanOrEqual(BOARD.height)
    }
  })

  it('成功发射必须真正越过右侧通道内壁', () => {
    expect(hasEnteredMainPlayfield(656, 180)).toBe(false)
    expect(hasEnteredMainPlayfield(BOARD.launcher.entry.maxX, 180)).toBe(true)
  })

  it('左右拍板静止和抬起时都保留中央落口且互不重叠', () => {
    const tipX = (side: 'left' | 'right', angle: number) => {
      const flipper = BOARD.flippers[side]
      return flipper.x + Math.cos(angle) * flipper.length
    }

    const restGap =
      tipX('right', BOARD.flippers.right.rest) - tipX('left', BOARD.flippers.left.rest)
    const activeGap =
      tipX('right', BOARD.flippers.right.active) - tipX('left', BOARD.flippers.left.active)

    expect(restGap).toBeGreaterThan(BALANCE.physics.ballRadius * 2)
    expect(activeGap).toBeGreaterThan(BALANCE.physics.ballRadius * 2)
  })

  it('除顶部边界和发射弹簧底座外不存在会长期托球的水平墙', () => {
    const intentionalHorizontalWalls = new Set(['outer-top', 'launcher-floor'])
    const shelves = BOARD.walls.filter(
      (wall) => !intentionalHorizontalWalls.has(wall.id) && Math.abs(wall.y2 - wall.y1) < 12
    )

    expect(shelves).toEqual([])
    expect(Math.abs(BOARD.launcher.gate.y2 - BOARD.launcher.gate.y1)).toBeGreaterThanOrEqual(20)
    expect(Math.abs(BOARD.inspectionGate.y2 - BOARD.inspectionGate.y1)).toBeGreaterThanOrEqual(20)
    expect(BOARD.overtimeGates.every((gate) => Math.abs(gate.y2 - gate.y1) >= 20)).toBe(true)
  })

  it('目标牌全部带倾角，不会成为水平托球平台', () => {
    expect(BOARD.targets.every((target) => Math.abs(target.angle) >= 0.15)).toBe(true)
  })

  it('验收门端点与发射通道内壁之间不会夹住一颗球', () => {
    const launcherInner = BOARD.walls.find((wall) => wall.id === 'launcher-inner')
    expect(launcherInner).toBeDefined()
    if (!launcherInner) return

    const rightmostGateX = Math.max(BOARD.inspectionGate.x1, BOARD.inspectionGate.x2)
    expect(launcherInner.x1 - rightmostGateX).toBeGreaterThan(BALANCE.physics.ballRadius * 2 + 12)
  })
})
