import RAPIER from '@dimforge/rapier2d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { BALANCE } from '@/config/balance'
import { BOARD } from '@/config/board'

beforeAll(async () => {
  await RAPIER.init()
})

/**
 * @description 在无渲染世界中创建一段与生产台面相同的静态碰撞墙
 * @param {RAPIER.World} world 测试物理世界
 * @param {{x1:number,y1:number,x2:number,y2:number}} wall 墙体设计坐标
 * @return {void}
 */
function createWall(
  world: RAPIER.World,
  wall: { x1: number; y1: number; x2: number; y2: number }
): void {
  const dx = wall.x2 - wall.x1
  const dy = wall.y2 - wall.y1
  const length = Math.hypot(dx, dy)
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation((wall.x1 + wall.x2) / 2 / BOARD.scale, (wall.y1 + wall.y2) / 2 / BOARD.scale)
      .setRotation(Math.atan2(dy, dx))
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(length / 2 / BOARD.scale, 5 / BOARD.scale).setRestitution(
      BALANCE.physics.wallRestitution
    ),
    body
  )
}

/**
 * @description 从指定位置释放弹珠并统计上半台面连续静止时间
 * @param {{x:number,y:number}} start 起始设计坐标
 * @return {{maxStationaryMs:number,finalY:number}} 轨迹摘要
 */
function simulateDrop(start: { x: number; y: number }): {
  maxStationaryMs: number
  stationaryAt: { x: number; y: number }
  finalX: number
  finalY: number
  finalSpeed: number
} {
  const world = new RAPIER.World({ x: 0, y: BALANCE.physics.gravity })
  for (const wall of BOARD.walls) createWall(world, wall)
  for (const slingshot of BOARD.slingshots) createWall(world, slingshot)
  createWall(world, BOARD.inspectionGate)
  for (const gate of BOARD.overtimeGates) createWall(world, gate)

  for (const post of BOARD.posts) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(post.x / BOARD.scale, post.y / BOARD.scale)
    )
    world.createCollider(RAPIER.ColliderDesc.ball(post.radius / BOARD.scale).setFriction(0), body)
  }
  for (const bumper of BOARD.bumpers) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(bumper.x / BOARD.scale, bumper.y / BOARD.scale)
    )
    world.createCollider(
      RAPIER.ColliderDesc.ball(bumper.radius / BOARD.scale).setRestitution(1),
      body
    )
  }
  for (const target of BOARD.targets) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(target.x / BOARD.scale, target.y / BOARD.scale)
        .setRotation(target.angle)
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(target.width / 2 / BOARD.scale, target.height / 2 / BOARD.scale),
      body
    )
  }

  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x / BOARD.scale, start.y / BOARD.scale)
      .setCcdEnabled(true)
      .setLinearDamping(0.04)
  )
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALANCE.physics.ballRadius / BOARD.scale)
      .setRestitution(BALANCE.physics.ballRestitution)
      .setFriction(BALANCE.physics.friction),
    ball
  )

  let stationaryMs = 0
  let maxStationaryMs = 0
  let stationaryAt = { x: start.x, y: start.y }
  for (let index = 0; index < 8 / BALANCE.physics.fixedStep; index += 1) {
    world.timestep = BALANCE.physics.fixedStep
    world.step()
    const position = ball.translation()
    const speed = Math.hypot(ball.linvel().x, ball.linvel().y)
    if (position.y * BOARD.scale < 900 && speed < BALANCE.physics.stallSpeed) {
      stationaryMs += BALANCE.physics.fixedStep * 1000
      if (stationaryMs > maxStationaryMs) {
        maxStationaryMs = stationaryMs
        stationaryAt = { x: position.x * BOARD.scale, y: position.y * BOARD.scale }
      }
    } else {
      stationaryMs = 0
    }
    if (position.y * BOARD.scale > BOARD.height + 100) break
  }

  const finalPosition = ball.translation()
  const finalVelocity = ball.linvel()
  return {
    maxStationaryMs,
    stationaryAt,
    finalX: finalPosition.x * BOARD.scale,
    finalY: finalPosition.y * BOARD.scale,
    finalSpeed: Math.hypot(finalVelocity.x, finalVelocity.y),
  }
}

describe('台面持续流动', () => {
  it.each([
    ['旧版左侧短导轨卡点', { x: 175, y: 590 }],
    ['左回环出口', { x: 235, y: 215 }],
    ['倾斜目标组', { x: 475, y: 545 }],
    ['关闭的验收门', { x: 510, y: 745 }],
    ['旧版验收门与发射通道夹点', { x: 597, y: 779 }],
  ])('%s 不会在上半台面永久静止', (_name, start) => {
    const result = simulateDrop(start)

    const diagnostic = JSON.stringify(result)
    expect(result.maxStationaryMs, diagnostic).toBeLessThan(BALANCE.physics.stallTimeoutMs)
    expect(result.finalY > 900 || result.finalSpeed >= BALANCE.physics.stallSpeed, diagnostic).toBe(
      true
    )
  })
})
