import RAPIER from '@dimforge/rapier2d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { BALANCE } from '@/config/balance'
import { BOARD, hasEnteredMainPlayfield } from '@/config/board'

interface LaunchResult {
  entered: boolean
  minimumY: number
  finalY: number
}

beforeAll(async () => {
  await RAPIER.init()
})

/**
 * @description 使用生产台面坐标做无渲染发射模拟
 * @param {number} force 初始向上速度
 * @param {number} compression 蓄力压缩比例
 * @return {LaunchResult} 发射轨迹摘要
 */
function simulateLaunch(force: number, compression: number): LaunchResult {
  const world = new RAPIER.World({ x: 0, y: BALANCE.physics.gravity })
  for (const wall of BOARD.walls) {
    const dx = wall.x2 - wall.x1
    const dy = wall.y2 - wall.y1
    const length = Math.hypot(dx, dy)
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(
          (wall.x1 + wall.x2) / 2 / BOARD.scale,
          (wall.y1 + wall.y2) / 2 / BOARD.scale
        )
        .setRotation(Math.atan2(dy, dx))
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(length / 2 / BOARD.scale, 5 / BOARD.scale).setRestitution(
        BALANCE.physics.wallRestitution
      ),
      body
    )
  }

  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(
        BOARD.ballStart.x / BOARD.scale,
        (BOARD.ballStart.y + BOARD.launcher.compressionTravel * compression) / BOARD.scale
      )
      .setCcdEnabled(true)
      .setLinearDamping(0.04)
  )
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALANCE.physics.ballRadius / BOARD.scale)
      .setRestitution(BALANCE.physics.ballRestitution)
      .setFriction(BALANCE.physics.friction),
    ball
  )
  ball.setLinvel({ x: -0.6, y: -Math.min(force, BALANCE.physics.maxSpeed) }, true)

  let entered = false
  let minimumY = Number.POSITIVE_INFINITY
  for (let index = 0; index < 8 / BALANCE.physics.fixedStep; index += 1) {
    world.timestep = BALANCE.physics.fixedStep
    world.step()
    const position = ball.translation()
    const x = position.x * BOARD.scale
    const y = position.y * BOARD.scale
    minimumY = Math.min(minimumY, y)
    if (hasEnteredMainPlayfield(x, y)) {
      entered = true
      break
    }
  }

  return {
    entered,
    minimumY,
    finalY: ball.translation().y * BOARD.scale,
  }
}

describe('真实发射通道轨迹', () => {
  it('满蓄力会经过顶部弯道并进入左侧主台面', () => {
    const result = simulateLaunch(BALANCE.physics.launcherMaxForce, 1)

    expect(result.entered).toBe(true)
    expect(result.minimumY).toBeLessThan(BOARD.launcher.top)
  })

  it('低蓄力不会被误判为进场并会沿通道回落', () => {
    const result = simulateLaunch(BALANCE.physics.launcherMinForce, 0)

    expect(result.entered).toBe(false)
    expect(result.finalY).toBeGreaterThanOrEqual(BOARD.ballStart.y)
  })
})
