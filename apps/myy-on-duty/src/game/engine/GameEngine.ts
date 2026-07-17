import RAPIER from '@dimforge/rapier2d-compat'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { BALANCE } from '@/config/balance'
import { BOARD, type BoardSensorId } from '@/config/board'
import type { DeviceId } from '@/game/types'

export interface EngineEventMap {
  bumper: { device: DeviceId }
  target: { id: string }
  sensor: { id: BoardSensorId }
  excuse: { index: number }
  launched: undefined
  charge: { progress: number }
  physics: { x: number; y: number; vx: number; vy: number }
}

/** 借口牌预设位置：左侧中部、中央偏上、右侧中部。 */
const EXCUSE_POSITIONS = [
  { x: 150, y: 700 },
  { x: 360, y: 620 },
  { x: 540, y: 560 },
] as const

type EventHandler<K extends keyof EngineEventMap> = (payload: EngineEventMap[K]) => void

/**
 * @description Rapier 物理与 Pixi 渲染的独立运行核心
 */
export class GameEngine {
  private app = new Application()
  private world!: RAPIER.World
  private eventQueue!: RAPIER.EventQueue
  private ball!: RAPIER.RigidBody
  private ballView = new Graphics()
  private root = new Container()
  private accumulator = 0
  private previousTime = 0
  private frameId = 0
  private chargingAt = 0
  private launched = false
  /** 弹珠是否已越过发射通道顶部进入主台面。 */
  private mainEntered = false
  private paused = true
  private leftPressed = false
  private rightPressed = false
  private colliderKinds = new Map<number, { kind: string; id: string }>()
  private handlers = new Map<keyof EngineEventMap, Set<EventHandler<keyof EngineEventMap>>>()
  private flippers: { left: RAPIER.RigidBody; right: RAPIER.RigidBody } | null = null
  private flipperViews: { left: Graphics; right: Graphics } | null = null
  /** 事件期间装置弹力倍率（下班冲刺 / 拒收强化），由玩法层设置。 */
  private bumperBoost: Partial<Record<DeviceId, number>> = {}
  /** 按 pointerId 记录触点区域，支持左右拍板同时触控。 */
  private activePointers = new Map<number, 'left' | 'right' | 'launch'>()
  private keydownHandler = (event: KeyboardEvent) => this.updateKey(event, true)
  private keyupHandler = (event: KeyboardEvent) => this.updateKey(event, false)
  private resizeObserver: ResizeObserver | null = null
  /** 目标牌物理与视图引用，用于击倒后下沉和冷却后升起。 */
  private targetParts = new Map<string, { collider: RAPIER.Collider; view: Graphics }>()
  /** 借口连发事件的三块借口牌。 */
  private excuseParts: { body: RAPIER.RigidBody; view: Graphics }[] = []

  /**
   * @description 初始化画布、物理世界和输入
   * @param {HTMLElement} host 画布挂载容器
   * @return {Promise<void>} 初始化完成
   */
  async init(host: HTMLElement): Promise<void> {
    await RAPIER.init()
    await this.app.init({ resizeTo: host, antialias: true, background: '#171124' })
    host.append(this.app.canvas)
    this.app.stage.addChild(this.root)
    this.world = new RAPIER.World({ x: 0, y: BALANCE.physics.gravity })
    this.eventQueue = new RAPIER.EventQueue(true)
    this.createBoard()
    this.bindInput(host)
    this.resize(host)
    // 监听容器尺寸变化（旋屏、窗口缩放），台面始终等比适配。
    this.resizeObserver = new ResizeObserver(() => this.resize(host))
    this.resizeObserver.observe(host)
    this.previousTime = performance.now()
    this.paused = false
    this.frameId = requestAnimationFrame(this.tick)
  }

  /**
   * @description 订阅游戏引擎事件
   * @param {K} event 事件名
   * @param {EventHandler<K>} handler 处理器
   * @return {() => void} 取消订阅函数
   */
  on<K extends keyof EngineEventMap>(event: K, handler: EventHandler<K>): () => void {
    const handlers = this.handlers.get(event) ?? new Set()
    handlers.add(handler as EventHandler<keyof EngineEventMap>)
    this.handlers.set(event, handlers)
    return () => handlers.delete(handler as EventHandler<keyof EngineEventMap>)
  }

  /**
   * @description 暂停或恢复物理推进
   * @param {boolean} paused 是否暂停
   * @return {void}
   */
  setPaused(paused: boolean): void {
    this.paused = paused
    this.previousTime = performance.now()
  }

  /**
   * @description 恢复保存的弹珠物理状态
   * @param {{x:number,y:number,vx:number,vy:number}} state 物理状态
   * @return {void}
   */
  restore(state: { x: number; y: number; vx: number; vy: number }): void {
    const scale = BOARD.scale
    this.ball.setTranslation({ x: state.x / scale, y: state.y / scale }, true)
    this.ball.setLinvel({ x: state.vx, y: state.vy }, true)
    this.launched = true
    this.mainEntered = true
  }

  /** @description 读取存档所需的弹珠状态 @return {{x:number,y:number,vx:number,vy:number}} 物理快照 */
  getSnapshot(): { x: number; y: number; vx: number; vy: number } {
    const position = this.ball.translation()
    const velocity = this.ball.linvel()
    return {
      x: position.x * BOARD.scale,
      y: position.y * BOARD.scale,
      vx: velocity.x,
      vy: velocity.y,
    }
  }

  /**
   * @description 设置事件期间的装置弹力倍率
   * @param {Partial<Record<DeviceId, number>>} boost 各装置倍率，空对象表示恢复默认
   * @return {void}
   */
  setBumperBoost(boost: Partial<Record<DeviceId, number>>): void {
    this.bumperBoost = boost
  }

  /**
   * @description 设置目标牌倒下或升起状态
   * @param {string} id 目标编号
   * @param {boolean} down 是否倒下
   * @return {void}
   */
  setTargetDown(id: string, down: boolean): void {
    const part = this.targetParts.get(id)
    if (!part) return
    // 倒下的目标牌不再参与碰撞，冷却结束后重新升起。
    part.collider.setEnabled(!down)
    part.view.alpha = down ? 0.25 : 1
  }

  /**
   * @description 升起借口连发事件的三块借口牌
   * @return {void}
   */
  raiseExcuses(): void {
    this.clearExcuses()
    this.excuseParts = EXCUSE_POSITIONS.map((position, index) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          position.x / BOARD.scale,
          position.y / BOARD.scale
        )
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(34 / BOARD.scale, 12 / BOARD.scale).setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS
        ),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'excuse', id: String(index) })
      const view = new Graphics().roundRect(-34, -12, 68, 24, 6).fill(0xd96d6d)
      const text = new Text({ text: `借口${index + 1}`, style: { fill: '#ffffff', fontSize: 13 } })
      text.anchor.set(0.5)
      view.addChild(text)
      view.position.set(position.x, position.y)
      this.root.addChild(view)
      return { body, view }
    })
  }

  /**
   * @description 击倒指定借口牌
   * @param {number} index 借口牌下标
   * @return {void}
   */
  knockExcuse(index: number): void {
    const part = this.excuseParts[index]
    if (!part) return
    this.world.removeRigidBody(part.body)
    part.view.destroy()
    // 用占位保持下标稳定，剩余借口牌编号不变。
    this.excuseParts[index] = undefined as unknown as (typeof this.excuseParts)[number]
  }

  /**
   * @description 收回全部剩余借口牌
   * @return {void}
   */
  clearExcuses(): void {
    for (const part of this.excuseParts) {
      if (!part) continue
      this.world.removeRigidBody(part.body)
      part.view.destroy()
    }
    this.excuseParts = []
  }

  /**
   * @description 把弹珠放回发射弹簧，等待再次蓄力
   * @return {void}
   */
  resetToLauncher(): void {
    this.ball.setTranslation(
      { x: BOARD.ballStart.x / BOARD.scale, y: BOARD.ballStart.y / BOARD.scale },
      true
    )
    this.ball.setLinvel({ x: 0, y: 0 }, true)
    this.launched = false
    this.mainEntered = false
    this.chargingAt = 0
  }

  /** @description 释放当前资源 @return {void} */
  destroy(): void {
    cancelAnimationFrame(this.frameId)
    window.removeEventListener('keydown', this.keydownHandler)
    window.removeEventListener('keyup', this.keyupHandler)
    this.resizeObserver?.disconnect()
    this.app.destroy(true, { children: true })
    this.handlers.clear()
  }

  /** @description 创建静态台面、机关、传感器和弹珠 @return {void} */
  private createBoard(): void {
    for (const [x1, y1, x2, y2] of BOARD.walls) this.createWall(x1, y1, x2, y2)
    for (const bumper of BOARD.bumpers) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(bumper.x / BOARD.scale, bumper.y / BOARD.scale)
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.ball(bumper.radius / BOARD.scale)
          .setRestitution(1)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'bumper', id: bumper.id })
      this.drawCircle(bumper.x, bumper.y, bumper.radius, 0x78c6a3, bumper.id)
    }
    for (const target of BOARD.targets) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(target.x / 20, target.y / 20)
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(18 / 20, 38 / 20).setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS
        ),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'target', id: target.id })
      const view = this.drawRect(target.x - 18, target.y - 38, 36, 76, 0xf2c56b, target.id)
      this.targetParts.set(target.id, { collider, view })
    }
    for (const sensor of BOARD.sensors) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(sensor.x / 20, sensor.y / 20)
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sensor.width / 40, sensor.height / 40)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'sensor', id: sensor.id })
      this.drawRect(
        sensor.x - sensor.width / 2,
        sensor.y - sensor.height / 2,
        sensor.width,
        sensor.height,
        0x70528d,
        sensor.id,
        0.28
      )
    }
    this.createFlippers()
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(BOARD.ballStart.x / 20, BOARD.ballStart.y / 20)
        .setCcdEnabled(true)
        .setLinearDamping(0.04)
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALANCE.physics.ballRadius / BOARD.scale)
        .setRestitution(BALANCE.physics.ballRestitution)
        .setFriction(BALANCE.physics.friction)
        .setDensity(1),
      this.ball
    )
    this.ballView.circle(0, 0, BALANCE.physics.ballRadius).fill(0xf3a9bc).stroke({
      width: 5,
      color: 0xffffff,
    })
    this.root.addChild(this.ballView)
  }

  /** @description 创建可运动的左右拍板 @return {void} */
  private createFlippers(): void {
    const create = (side: 'left' | 'right') => {
      const config = BOARD.flippers[side]
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(config.x / 20, config.y / 20)
          .setRotation(config.rest)
      )
      this.world.createCollider(
        RAPIER.ColliderDesc.capsule((config.length / 2 - 12) / 20, 12 / 20)
          .setTranslation(config.length / 40, 0)
          .setRestitution(0.55),
        body
      )
      const view = new Graphics().roundRect(0, -12, config.length, 24, 12).fill(0xf08ba5)
      view.position.set(config.x, config.y)
      view.rotation = config.rest
      this.root.addChild(view)
      return { body, view }
    }
    const left = create('left')
    const right = create('right')
    this.flippers = { left: left.body, right: right.body }
    this.flipperViews = { left: left.view, right: right.view }
  }

  /**
   * @description 创建一段静态墙
   * @param {number} x1 起点 X
   * @param {number} y1 起点 Y
   * @param {number} x2 终点 X
   * @param {number} y2 终点 Y
   * @return {void}
   */
  private createWall(x1: number, y1: number, x2: number, y2: number): void {
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation((x1 + x2) / 40, (y1 + y2) / 40)
        .setRotation(Math.atan2(dy, dx))
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(length / 40, 5 / 20).setRestitution(
        BALANCE.physics.wallRestitution
      ),
      body
    )
    const wall = new Graphics().moveTo(x1, y1).lineTo(x2, y2).stroke({
      width: 10,
      color: 0xc7a8df,
      cap: 'round',
    })
    this.root.addChild(wall)
  }

  /**
   * @description 处理 PC 键盘输入
   * @param {KeyboardEvent} event 键盘事件
   * @param {boolean} pressed 是否按下
   * @return {void}
   */
  private updateKey(event: KeyboardEvent, pressed: boolean): void {
    if (event.code === 'KeyA') this.leftPressed = pressed
    if (event.code === 'KeyL') this.rightPressed = pressed
    if (event.code === 'Space') {
      event.preventDefault() // 阻止空格触发页面滚动或按钮点击
      pressed ? this.startCharge() : this.releaseLauncher()
    }
  }

  /** @description 绑定键盘和左右半屏多点触控 @param {HTMLElement} host 容器 @return {void} */
  private bindInput(host: HTMLElement): void {
    window.addEventListener('keydown', this.keydownHandler)
    window.addEventListener('keyup', this.keyupHandler)
    host.addEventListener('pointerdown', (event) => {
      // 未发射时右下角区域用于蓄力，其余区域按左右半屏映射拍板。
      const zone: 'left' | 'right' | 'launch' =
        !this.launched &&
        event.clientX > host.clientWidth * 0.72 &&
        event.clientY > host.clientHeight * 0.6
          ? 'launch'
          : event.clientX < host.clientWidth / 2
            ? 'left'
            : 'right'
      this.activePointers.set(event.pointerId, zone)
      if (zone === 'launch') this.startCharge()
      if (zone === 'left') this.leftPressed = true
      if (zone === 'right') this.rightPressed = true
    })
    const releasePointer = (event: PointerEvent) => {
      const zone = this.activePointers.get(event.pointerId)
      this.activePointers.delete(event.pointerId)
      if (zone === 'launch') this.releaseLauncher()
      // 只有该侧不再有其他触点时才落下拍板，支持双指交替操作。
      const zones = new Set(this.activePointers.values())
      if (zone === 'left' && !zones.has('left')) this.leftPressed = false
      if (zone === 'right' && !zones.has('right')) this.rightPressed = false
    }
    host.addEventListener('pointerup', releasePointer)
    host.addEventListener('pointercancel', releasePointer)
  }

  /** @description 开始发射蓄力 @return {void} */
  private startCharge(): void {
    if (!this.launched && !this.chargingAt) this.chargingAt = performance.now()
  }

  /** @description 按蓄力时长向上发射弹珠 @return {void} */
  private releaseLauncher(): void {
    if (!this.chargingAt || this.launched) return
    const progress = Math.min(
      1,
      (performance.now() - this.chargingAt) / BALANCE.physics.chargeDurationMs
    )
    const force =
      BALANCE.physics.launcherMinForce +
      (BALANCE.physics.launcherMaxForce - BALANCE.physics.launcherMinForce) * progress
    this.ball.setLinvel({ x: -2, y: -force }, true)
    this.chargingAt = 0
    this.launched = true
    this.emit('charge', { progress: 0 })
  }

  /** @description 固定步长推进物理并渲染 @param {number} now 当前时间 @return {void} */
  private tick = (now: number): void => {
    const delta = Math.min(0.05, (now - this.previousTime) / 1000)
    this.previousTime = now
    if (!this.paused) {
      this.accumulator += delta
      while (this.accumulator >= BALANCE.physics.fixedStep) {
        this.stepPhysics()
        this.accumulator -= BALANCE.physics.fixedStep
      }
    }
    this.render()
    this.frameId = requestAnimationFrame(this.tick)
  }

  /** @description 推进一次物理并处理碰撞事件 @return {void} */
  private stepPhysics(): void {
    if (this.flippers) {
      for (const side of ['left', 'right'] as const) {
        const pressed = side === 'left' ? this.leftPressed : this.rightPressed
        const target = pressed ? BOARD.flippers[side].active : BOARD.flippers[side].rest
        this.flippers[side].setNextKinematicRotation(target)
      }
    }
    const velocity = this.ball.linvel()
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed > BALANCE.physics.maxSpeed) {
      const ratio = BALANCE.physics.maxSpeed / speed
      this.ball.setLinvel({ x: velocity.x * ratio, y: velocity.y * ratio }, true)
    }
    this.world.timestep = BALANCE.physics.fixedStep
    this.world.step(this.eventQueue)
    const position = this.ball.translation()
    const designX = position.x * BOARD.scale
    const designY = position.y * BOARD.scale
    if (this.launched && !this.mainEntered) {
      // 只有越过发射通道顶部弯道进入主场，才算正式开始本局计时。
      if (designX < 600 && designY < 900) {
        this.mainEntered = true
        this.emit('launched', undefined)
      } else {
        const current = this.ball.linvel()
        if (designY > BOARD.ballStart.y - 30 && Math.hypot(current.x, current.y) < 3) {
          // 力度不足自然回落到弹簧，恢复可蓄力状态。
          this.launched = false
        }
      }
    }
    this.eventQueue.drainCollisionEvents((first, second, started) => {
      if (!started) return
      const meta = this.colliderKinds.get(first) ?? this.colliderKinds.get(second)
      if (!meta) return
      if (meta.kind === 'bumper') {
        // 主动机关沿「机关中心 → 弹珠」方向补充能量，方向稳定可预期。
        const bumper = BOARD.bumpers.find((item) => item.id === meta.id)
        const position = this.ball.translation()
        const boost = this.bumperBoost[meta.id as DeviceId] ?? 1
        const impulse = BALANCE.physics.bumperImpulse * boost
        if (bumper) {
          const dx = position.x - bumper.x / BOARD.scale
          const dy = position.y - bumper.y / BOARD.scale
          const distance = Math.hypot(dx, dy) || 1
          this.ball.applyImpulse(
            { x: (dx / distance) * impulse, y: (dy / distance) * impulse },
            true
          )
        }
        this.emit('bumper', { device: meta.id as DeviceId })
      }
      if (meta.kind === 'target') this.emit('target', { id: meta.id })
      if (meta.kind === 'excuse') this.emit('excuse', { index: Number(meta.id) })
      if (meta.kind === 'sensor') this.emit('sensor', { id: meta.id as BoardSensorId })
    })
  }

  /** @description 将物理状态映射到 Pixi 设计坐标 @return {void} */
  private render(): void {
    const position = this.ball.translation()
    this.ballView.position.set(position.x * BOARD.scale, position.y * BOARD.scale)
    if (this.flippers && this.flipperViews) {
      // 拍板视图只同步旋转角度，避免每帧销毁重建 Graphics。
      for (const side of ['left', 'right'] as const) {
        this.flipperViews[side].rotation = this.flippers[side].rotation()
      }
    }
    // 蓄力期间持续上报进度，供发射弹簧的压缩动画使用。
    if (this.chargingAt) {
      const progress = Math.min(
        1,
        (performance.now() - this.chargingAt) / BALANCE.physics.chargeDurationMs
      )
      this.emit('charge', { progress })
    }
    const velocity = this.ball.linvel()
    this.emit('physics', {
      x: position.x * BOARD.scale,
      y: position.y * BOARD.scale,
      vx: velocity.x,
      vy: velocity.y,
    })
  }

  /** @description 按容器尺寸缩放台面 @param {HTMLElement} host 容器 @return {void} */
  private resize(host: HTMLElement): void {
    const scale = Math.min(host.clientWidth / BOARD.width, host.clientHeight / BOARD.height)
    this.root.scale.set(scale)
    this.root.position.set((host.clientWidth - BOARD.width * scale) / 2, 0)
  }

  /** @description 绘制带标签圆形占位机关 @return {void} */
  private drawCircle(x: number, y: number, radius: number, color: number, label: string): void {
    const view = new Graphics()
      .circle(x, y, radius)
      .fill(color)
      .stroke({ width: 8, color: 0xffffff })
    this.root.addChild(view, new Text({ text: label, style: { fill: '#24162f', fontSize: 22 } }))
    this.root.children.at(-1)?.position.set(x - 26, y - 12)
  }

  /** @description 绘制带标签矩形占位机关 @return {Graphics} 矩形视图 */
  private drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    label: string,
    alpha = 1
  ): Graphics {
    const view = new Graphics().roundRect(x, y, width, height, 8).fill({ color, alpha })
    this.root.addChild(view)
    const text = new Text({ text: label, style: { fill: '#ffffff', fontSize: 14 } })
    text.position.set(x + 4, y + 4)
    this.root.addChild(text)
    return view
  }

  /** @description 派发类型安全的引擎事件 @return {void} */
  private emit<K extends keyof EngineEventMap>(event: K, payload: EngineEventMap[K]): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload))
  }
}
