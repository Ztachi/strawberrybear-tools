import RAPIER from '@dimforge/rapier2d-compat'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { BALANCE } from '@/config/balance'
import { BOARD, hasEnteredMainPlayfield, type BoardSensorId } from '@/config/board'
import { PALETTE, PALETTE_TEXT } from '@/config/palette'
import { playSfx } from '@/game/engine/audio'
import { normalizeAngle, stepAngleTowards } from '@/game/engine/physicsMath'
import type { DeviceId, EventId, KeyBindings, PhysicsSnapshot } from '@/game/types'

export interface EngineEventMap {
  bumper: { device: DeviceId }
  target: { id: string }
  sensor: { id: BoardSensorId; entered: boolean }
  excuse: { index: number }
  launched: undefined
  charge: { progress: number }
  launcher: { state: 'ready' | 'traveling' | 'entered' }
  physics: { x: number; y: number; vx: number; vy: number }
  unstuck: { x: number; y: number }
}

/** 借口牌预设位置：左侧中部、中央偏上、右侧中部。 */
const EXCUSE_POSITIONS = [
  { x: 210, y: 700, angle: 0.2 },
  { x: 350, y: 655, angle: -0.18 },
  { x: 490, y: 710, angle: 0.2 },
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
  private launcherSpringView = new Graphics()
  private root = new Container()
  private accumulator = 0
  private previousTime = 0
  private frameId = 0
  private chargingAt = 0
  /** 主台面上低速静止的累计时间，用于处理几何端点的极小概率平衡。 */
  private stationaryMs = 0
  private launched = false
  /** 弹珠是否已越过发射通道顶部进入主台面。 */
  private mainEntered = false
  private paused = true
  private inputEnabled = true
  private leftPressed = false
  private rightPressed = false
  private colliderKinds = new Map<number, { kind: string; id: string }>()
  private handlers = new Map<keyof EngineEventMap, Set<EventHandler<keyof EngineEventMap>>>()
  private flippers: { left: RAPIER.RigidBody; right: RAPIER.RigidBody } | null = null
  private flipperViews: { left: Graphics; right: Graphics } | null = null
  /** 事件期间装置弹力倍率（下班冲刺 / 拒收强化），由玩法层设置。 */
  private bumperBoost: Partial<Record<DeviceId, number>> = {}
  private slingshotBoost = 1
  /** 按 pointerId 记录触点区域，支持左右拍板同时触控。 */
  private activePointers = new Map<number, 'left' | 'right' | 'launch'>()
  private keydownHandler = (event: KeyboardEvent) => this.updateKey(event, true)
  private keyupHandler = (event: KeyboardEvent) => this.updateKey(event, false)
  private resizeObserver: ResizeObserver | null = null
  private inputHost: HTMLElement | null = null
  private pointerdownHandler: ((event: PointerEvent) => void) | null = null
  private pointerupHandler: ((event: PointerEvent) => void) | null = null
  /** 单向挡片在弹珠进入主台面后启用，避免重新掉回发射通道。 */
  private launcherGate: { collider: RAPIER.Collider; view: Graphics } | null = null
  /** 强制加班期间临时关闭劳动区出口。 */
  private overtimeGates: { collider: RAPIER.Collider; view: Graphics }[] = []
  /** 成果验收通道门默认关闭，三目标与库存条件满足后打开。 */
  private inspectionGate: { collider: RAPIER.Collider; view: Graphics } | null = null
  /** 固定步长前后位置，用于渲染插值。 */
  private previousBallPosition = {
    x: BOARD.ballStart.x / BOARD.scale,
    y: BOARD.ballStart.y / BOARD.scale,
  }
  private currentBallPosition = {
    x: BOARD.ballStart.x / BOARD.scale,
    y: BOARD.ballStart.y / BOARD.scale,
  }
  /** 目标牌物理与视图引用，用于击倒后下沉和冷却后升起。 */
  private targetParts = new Map<string, { collider: RAPIER.Collider; view: Container }>()
  /** 三类劳动装置和陨星坑的视图，用于随机事件状态提示。 */
  private deviceViews = new Map<DeviceId, Container>()
  /** 事件牌在事件执行和冷却期必须熄灭。 */
  private eventCardView: Graphics | null = null
  /** 借口连发事件的三块借口牌。 */
  private excuseParts: { body: RAPIER.RigidBody; view: Graphics }[] = []
  /** Pixi 文案不是 Vue 节点，需要单独记录才能在运行中切换语言。 */
  private localizedTexts = new Map<Text, string>()
  /** 捕获/弹出等一次性光效，在渲染循环中按存活时间推进并自动销毁。 */
  private bursts: { view: Graphics; bornAt: number }[] = []

  constructor(
    private readonly keyBindings: KeyBindings = {
      left: 'KeyA',
      right: 'KeyL',
      launch: 'Space',
    },
    private translate: (key: string) => string = (key) => key
  ) {}

  /**
   * @description 初始化画布、物理世界和输入
   * @param {HTMLElement} host 画布挂载容器
   * @return {Promise<void>} 初始化完成
   */
  async init(host: HTMLElement): Promise<void> {
    await RAPIER.init()
    await this.app.init({ resizeTo: host, antialias: true, background: '#fbe0e8' })
    host.append(this.app.canvas)
    this.app.stage.addChild(this.root)
    this.world = new RAPIER.World({ x: 0, y: BALANCE.physics.gravity })
    this.eventQueue = new RAPIER.EventQueue(true)
    this.createBoard()
    this.syncBallInterpolation()
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
   * @description 更新画布翻译器并立即刷新已存在的 Pixi 文案
   * @param {(key: string) => string} translate 新语言翻译器
   * @return {void}
   */
  setTranslator(translate: (key: string) => string): void {
    this.translate = translate
    for (const [text, key] of this.localizedTexts) {
      if (text.destroyed) {
        this.localizedTexts.delete(text)
        continue
      }
      text.text = translate(key)
    }
  }

  /**
   * @description 暂停或恢复物理推进
   * @param {boolean} paused 是否暂停
   * @return {void}
   */
  setPaused(paused: boolean): void {
    this.paused = paused
    this.previousTime = performance.now()
    if (paused) {
      this.leftPressed = false
      this.rightPressed = false
      this.activePointers.clear()
      this.chargingAt = 0
      this.stationaryMs = 0
    }
  }

  /**
   * @description 恢复保存的弹珠物理状态
   * @param {{x:number,y:number,vx:number,vy:number}} state 物理状态
   * @return {void}
   */
  restore(state: PhysicsSnapshot): void {
    const scale = BOARD.scale
    this.ball.setTranslation({ x: state.x / scale, y: state.y / scale }, true)
    this.ball.setLinvel({ x: state.vx, y: state.vy }, true)
    this.launched = state.launched ?? true
    this.mainEntered = state.mainEntered ?? true
    this.stationaryMs = 0
    if (this.flippers) {
      if (state.leftFlipperAngle !== undefined) {
        this.flippers.left.setRotation(normalizeAngle(state.leftFlipperAngle), true)
      }
      if (state.rightFlipperAngle !== undefined) {
        this.flippers.right.setRotation(normalizeAngle(state.rightFlipperAngle), true)
      }
    }
    this.setLauncherGate(this.mainEntered)
    this.syncBallInterpolation()
  }

  /** @description 读取存档所需的实时物理状态 @return {PhysicsSnapshot} 物理快照 */
  getSnapshot(): PhysicsSnapshot {
    const position = this.ball.translation()
    const velocity = this.ball.linvel()
    return {
      x: position.x * BOARD.scale,
      y: position.y * BOARD.scale,
      vx: velocity.x,
      vy: velocity.y,
      launched: this.launched,
      mainEntered: this.mainEntered,
      leftFlipperAngle: this.flippers?.left.rotation(),
      rightFlipperAngle: this.flippers?.right.rotation(),
    }
  }

  /** @description 开始发射蓄力 @return {void} */
  beginCharge(): void {
    if (!this.paused && !this.launched && !this.chargingAt) {
      this.chargingAt = performance.now()
      playSfx('charge')
    }
  }

  /** @description 释放发射蓄力 @return {void} */
  releaseCharge(): void {
    if (!this.chargingAt || this.launched || this.paused) return
    const progress = this.getChargeProgress()
    const force =
      BALANCE.physics.launcherMinForce +
      (BALANCE.physics.launcherMaxForce - BALANCE.physics.launcherMinForce) * progress
    // 轻微向左的初速让满蓄力稳定接触顶部弯道；弱蓄力仍会在直线通道内回落。
    this.ball.setLinvel({ x: -0.6, y: -force }, true)
    this.chargingAt = 0
    this.launched = true
    playSfx('launch')
    this.emit('launcher', { state: 'traveling' })
    this.emit('charge', { progress: 0 })
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
   * @description 设置下班冲刺对普通主动机关的统一强化
   * @param {boolean} active 是否生效
   * @return {void}
   */
  setSprintBoost(active: boolean): void {
    this.slingshotBoost = active ? BALANCE.physics.sprintMultiplier : 1
  }

  /**
   * @description 开关玩家输入，结束动画期间保留物理但锁定拍板
   * @param {boolean} enabled 是否允许输入
   * @return {void}
   */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled
    if (!enabled) {
      this.leftPressed = false
      this.rightPressed = false
      this.activePointers.clear()
    }
  }

  /**
   * @description 开关强制加班出口挡片
   * @param {boolean} closed 是否关闭出口
   * @return {void}
   */
  setOvertimeGate(closed: boolean): void {
    for (const gate of this.overtimeGates) {
      gate.collider.setEnabled(closed)
      gate.view.visible = closed
    }
  }

  /**
   * @description 开关成果验收通道
   * @param {boolean} open 是否开放通道
   * @return {void}
   */
  setInspectionOpen(open: boolean): void {
    if (!this.inspectionGate) return
    this.inspectionGate.collider.setEnabled(!open)
    this.inspectionGate.view.visible = !open
  }

  /**
   * @description 用颜色和透明度呈现随机事件对装置的影响
   * @param {EventId} eventId 当前事件；空值恢复普通状态
   * @param {DeviceId} target 今日超想要的指定装置
   * @param {Record<string, boolean>} progress 暖暖查岗完成情况
   * @return {void}
   */
  setEventVisuals(eventId?: EventId, target?: DeviceId, progress?: Record<string, boolean>): void {
    for (const [device, view] of this.deviceViews) {
      view.alpha = 1
      view.tint = 0xffffff
      if (eventId === 'wanted' && device !== 'meteor') {
        view.tint = device === target ? 0xffe066 : 0xff96a6
        view.alpha = device === target ? 1 : 0.6
      } else if (eventId === 'inspection' && device !== 'meteor') {
        view.tint = progress?.[device] ? 0x9be3b4 : 0xd6c2f5
        view.alpha = progress?.[device] ? 0.7 : 1
      } else if ((eventId === 'sprint' || eventId === 'rareHarvest') && device !== 'meteor') {
        view.tint = 0xffe066
      } else if (eventId === 'meteorHarvest' && device === 'meteor') {
        view.tint = 0xffd45f
      }
    }
  }

  /** @description 设置事件牌是否亮起可触发 @param {boolean} available 是否可触发 @return {void} */
  setEventCardAvailable(available: boolean): void {
    if (!this.eventCardView) return
    this.eventCardView.alpha = available ? 1 : 0.35
    this.eventCardView.tint = available ? 0xffffff : 0xd8c3c8
  }

  /** @description 把调试面板修改的重力同步到 Rapier 世界 @return {void} */
  syncBalance(): void {
    this.world.gravity = { x: 0, y: BALANCE.physics.gravity }
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
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(position.x / BOARD.scale, position.y / BOARD.scale)
          .setRotation(position.angle)
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(34 / BOARD.scale, 12 / BOARD.scale).setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS
        ),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'excuse', id: String(index) })
      const view = new Graphics()
        .roundRect(-34, -12, 68, 24, 8)
        .fill(PALETTE.danger)
        .stroke({ width: 3, color: PALETTE.white })
      const text = new Text({
        text: this.translate(`game.excuse.${index}`),
        style: { fill: PALETTE_TEXT.white, fontSize: 13, fontWeight: '700' },
      })
      this.localize(text, `game.excuse.${index}`)
      text.anchor.set(0.5)
      view.addChild(text)
      view.position.set(position.x, position.y)
      view.rotation = position.angle
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
   * @description 在指定位置播放一圈扩散光效，用于捕获、弹出和救球反馈
   * @param {number} x 设计坐标 X
   * @param {number} y 设计坐标 Y
   * @return {void}
   */
  playBurst(x: number, y: number): void {
    const view = new Graphics()
      .circle(0, 0, 26)
      .stroke({ width: 6, color: PALETTE.gold })
      .circle(0, 0, 14)
      .stroke({ width: 4, color: PALETTE.primaryHover })
    view.position.set(x, y)
    this.root.addChild(view)
    this.bursts.push({ view, bornAt: performance.now() })
  }

  /**
   * @description 从指定装置口弹出弹珠：先落位再赋予速度并伴随光效，替代跨台面瞬移
   * @param {{x:number,y:number,vx:number,vy:number}} state 弹出位置与初速度
   * @return {void}
   */
  ejectBall(state: { x: number; y: number; vx: number; vy: number }): void {
    this.playBurst(state.x, state.y)
    this.restore({ ...state, launched: true, mainEntered: true })
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
    this.stationaryMs = 0
    this.setLauncherGate(false)
    this.syncBallInterpolation()
    this.emit('launcher', { state: 'ready' })
  }

  /** @description 释放当前资源 @return {void} */
  destroy(): void {
    cancelAnimationFrame(this.frameId)
    window.removeEventListener('keydown', this.keydownHandler)
    window.removeEventListener('keyup', this.keyupHandler)
    if (this.inputHost && this.pointerdownHandler && this.pointerupHandler) {
      this.inputHost.removeEventListener('pointerdown', this.pointerdownHandler)
      this.inputHost.removeEventListener('pointerup', this.pointerupHandler)
      this.inputHost.removeEventListener('pointercancel', this.pointerupHandler)
    }
    this.resizeObserver?.disconnect()
    this.app.destroy(true, { children: true })
    this.handlers.clear()
  }

  /**
   * @description 创建静态台面、机关、传感器和弹珠
   * @return {void}
   */
  private createBoard(): void {
    this.createBackdrop()
    this.drawPlayfieldZones()
    for (const wall of BOARD.walls) {
      const isOuterRail =
        wall.id.startsWith('outer') ||
        wall.id.startsWith('launcher') ||
        wall.id.startsWith('corner')
      this.createWall(
        wall.x1,
        wall.y1,
        wall.x2,
        wall.y2,
        isOuterRail ? PALETTE.primaryActive : PALETTE.primaryHover
      )
    }
    for (const post of BOARD.posts) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(post.x / BOARD.scale, post.y / BOARD.scale)
      )
      this.world.createCollider(
        // 挡柱必须低摩擦，否则弹珠会在圆柱侧面形成静态受力平衡。
        RAPIER.ColliderDesc.ball(post.radius / BOARD.scale)
          .setRestitution(BALANCE.physics.wallRestitution)
          .setFriction(0),
        body
      )
      this.drawPost(post.x, post.y, post.radius)
    }
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
      const view = this.drawBumper(bumper.x, bumper.y, bumper.radius, bumper.id, bumper.labelKey)
      this.deviceViews.set(bumper.id as DeviceId, view)
    }
    for (const target of BOARD.targets) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(target.x / BOARD.scale, target.y / BOARD.scale)
          .setRotation(target.angle)
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          target.width / 2 / BOARD.scale,
          target.height / 2 / BOARD.scale
        ).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'target', id: target.id })
      const view = this.drawTarget(
        target.x,
        target.y,
        target.width,
        target.height,
        target.angle,
        target.labelKey
      )
      this.targetParts.set(target.id, { collider, view })
    }
    for (const sensor of BOARD.sensors) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(sensor.x / BOARD.scale, sensor.y / BOARD.scale)
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sensor.width / 40, sensor.height / 40)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'sensor', id: sensor.id })
      this.drawSensor(sensor)
    }
    this.createSlingshots()
    this.createGates()
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
    this.drawBall()
    this.drawLauncherSpring()
    this.root.addChild(this.launcherSpringView)
    this.root.addChild(this.ballView)
  }

  /** @description 创建可运动的左右拍板 @return {void} */
  private createFlippers(): void {
    const create = (side: 'left' | 'right') => {
      const config = BOARD.flippers[side]
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(config.x / BOARD.scale, config.y / BOARD.scale)
          .setRotation(config.rest)
      )
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule((config.length / 2 - 12) / BOARD.scale, 12 / BOARD.scale)
          .setRotation(Math.PI / 2)
          .setTranslation(config.length / 2 / BOARD.scale, 0)
          .setRestitution(0.55)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
      )
      this.colliderKinds.set(collider.handle, { kind: 'flipper', id: side })
      const view = new Graphics()
      view.roundRect(0, -14, config.length, 28, 14).fill(PALETTE.white).stroke({
        width: 4,
        color: PALETTE.primaryActive,
      })
      view
        .moveTo(20, 0)
        .lineTo(config.length - 16, 0)
        .stroke({
          width: 6,
          color: PALETTE.primary,
          cap: 'round',
        })
      view.circle(0, 0, 17).fill(PALETTE.primaryHover).stroke({ width: 5, color: PALETTE.white })
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
  private createWall(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = PALETTE.primary,
    activeEvents = false
  ): { collider: RAPIER.Collider; view: Graphics } {
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation((x1 + x2) / 2 / BOARD.scale, (y1 + y2) / 2 / BOARD.scale)
        .setRotation(Math.atan2(dy, dx))
    )
    const descriptor = RAPIER.ColliderDesc.cuboid(
      length / 2 / BOARD.scale,
      5 / BOARD.scale
    ).setRestitution(BALANCE.physics.wallRestitution)
    if (activeEvents) descriptor.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
    const collider = this.world.createCollider(descriptor, body)
    const wall = new Graphics()
    // 柔和的同色系描边：底层浅晕 + 主体轨道 + 顶部高光，保持粉白主题的干净观感。
    wall.moveTo(x1, y1).lineTo(x2, y2).stroke({
      width: 13,
      color: PALETTE.primaryActive,
      alpha: 0.16,
      cap: 'round',
    })
    wall.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 8, color, cap: 'round' })
    wall.moveTo(x1, y1).lineTo(x2, y2).stroke({
      width: 2.5,
      color: PALETTE.white,
      alpha: 0.65,
      cap: 'round',
    })
    this.root.addChild(wall)
    return { collider, view: wall }
  }

  /** @description 创建左右下班弹弓，并为碰撞附加主动冲量 @return {void} */
  private createSlingshots(): void {
    for (const slingshot of BOARD.slingshots) {
      // 弹弓三角形整体填充，主动弹面用更深的粉色强调可交互性。
      const back = BOARD.walls.find((wall) => wall.id === `${slingshot.id}-sling-back`)
      if (back) {
        const fill = new Graphics()
          .poly([slingshot.x1, slingshot.y1, slingshot.x2, slingshot.y2, back.x2, back.y2])
          .fill(PALETTE.primaryLight)
        this.root.addChild(fill)
      }
      const part = this.createWall(
        slingshot.x1,
        slingshot.y1,
        slingshot.x2,
        slingshot.y2,
        PALETTE.primaryActive,
        true
      )
      this.colliderKinds.set(part.collider.handle, { kind: 'slingshot', id: slingshot.id })
    }
  }

  /** @description 创建默认隐藏的单向挡片与强制加班出口挡片 @return {void} */
  private createGates(): void {
    const launcher = BOARD.launcher.gate
    this.launcherGate = this.createWall(
      launcher.x1,
      launcher.y1,
      launcher.x2,
      launcher.y2,
      PALETTE.gold
    )
    this.launcherGate.collider.setEnabled(false)
    this.launcherGate.view.visible = false

    this.overtimeGates = BOARD.overtimeGates.map((gate) => {
      const part = this.createWall(gate.x1, gate.y1, gate.x2, gate.y2, PALETTE.danger)
      part.collider.setEnabled(false)
      part.view.visible = false
      return part
    })
    const inspection = BOARD.inspectionGate
    this.inspectionGate = this.createWall(
      inspection.x1,
      inspection.y1,
      inspection.x2,
      inspection.y2,
      PALETTE.gold
    )
  }

  /**
   * @description 处理 PC 键盘输入
   * @param {KeyboardEvent} event 键盘事件
   * @param {boolean} pressed 是否按下
   * @return {void}
   */
  private updateKey(event: KeyboardEvent, pressed: boolean): void {
    if (pressed && (this.paused || !this.inputEnabled)) return
    if (event.code === this.keyBindings.left) {
      if (pressed && !this.leftPressed) playSfx('flipper')
      this.leftPressed = pressed
    }
    if (event.code === this.keyBindings.right) {
      if (pressed && !this.rightPressed) playSfx('flipper')
      this.rightPressed = pressed
    }
    if (event.code === this.keyBindings.launch) {
      event.preventDefault() // 阻止空格触发页面滚动或按钮点击
      pressed ? this.beginCharge() : this.releaseCharge()
    }
  }

  /** @description 绑定键盘和左右半屏多点触控 @param {HTMLElement} host 容器 @return {void} */
  private bindInput(host: HTMLElement): void {
    this.inputHost = host
    window.addEventListener('keydown', this.keydownHandler)
    window.addEventListener('keyup', this.keyupHandler)
    this.pointerdownHandler = (event) => {
      if (this.paused || !this.inputEnabled) return
      const bounds = host.getBoundingClientRect()
      const zone: 'left' | 'right' =
        event.clientX - bounds.left < bounds.width / 2 ? 'left' : 'right'
      this.activePointers.set(event.pointerId, zone)
      if (zone === 'left') {
        if (!this.leftPressed) playSfx('flipper')
        this.leftPressed = true
      }
      if (zone === 'right') {
        if (!this.rightPressed) playSfx('flipper')
        this.rightPressed = true
      }
      host.setPointerCapture?.(event.pointerId)
    }
    this.pointerupHandler = (event) => {
      const zone = this.activePointers.get(event.pointerId)
      this.activePointers.delete(event.pointerId)
      // 只有该侧不再有其他触点时才落下拍板，支持双指交替操作。
      const zones = new Set(this.activePointers.values())
      if (zone === 'left' && !zones.has('left')) this.leftPressed = false
      if (zone === 'right' && !zones.has('right')) this.rightPressed = false
    }
    host.addEventListener('pointerdown', this.pointerdownHandler)
    host.addEventListener('pointerup', this.pointerupHandler)
    host.addEventListener('pointercancel', this.pointerupHandler)
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
    const alpha = this.paused ? 1 : this.accumulator / BALANCE.physics.fixedStep
    this.render(alpha)
    this.frameId = requestAnimationFrame(this.tick)
  }

  /** @description 推进一次物理并处理碰撞事件 @return {void} */
  private stepPhysics(): void {
    if (this.flippers) {
      for (const side of ['left', 'right'] as const) {
        const pressed = side === 'left' ? this.leftPressed : this.rightPressed
        const target = pressed ? BOARD.flippers[side].active : BOARD.flippers[side].rest
        const current = this.flippers[side].rotation()
        const maxStep = BALANCE.physics.flipperSpeed * BALANCE.physics.fixedStep
        // 右拍板的工作角跨过 π/-π，必须沿最短圆弧推进，否则会绕台面旋转一整圈。
        const next = stepAngleTowards(current, target, maxStep)
        this.flippers[side].setNextKinematicRotation(next)
      }
    }
    if (this.chargingAt && !this.launched) {
      // 蓄力时弹珠随弹簧向下移动；松开后再交还给 Rapier 自由运动。
      const progress = this.getChargeProgress()
      this.ball.setTranslation(
        {
          x: BOARD.ballStart.x / BOARD.scale,
          y: (BOARD.ballStart.y + BOARD.launcher.compressionTravel * progress) / BOARD.scale,
        },
        true
      )
      this.ball.setLinvel({ x: 0, y: 0 }, true)
    }
    const velocity = this.ball.linvel()
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed > BALANCE.physics.maxSpeed) {
      const ratio = BALANCE.physics.maxSpeed / speed
      this.ball.setLinvel({ x: velocity.x * ratio, y: velocity.y * ratio }, true)
    }
    this.previousBallPosition = { ...this.currentBallPosition }
    this.world.timestep = BALANCE.physics.fixedStep
    this.world.step(this.eventQueue)
    const position = this.ball.translation()
    this.currentBallPosition = { x: position.x, y: position.y }
    const designX = position.x * BOARD.scale
    const designY = position.y * BOARD.scale
    if (this.launched && !this.mainEntered) {
      // 球心必须越过内壁进入左侧主场；只按高度会在通道内过早升起挡片并卡球。
      if (hasEnteredMainPlayfield(designX, designY)) {
        this.mainEntered = true
        this.setLauncherGate(true)
        this.emit('launcher', { state: 'entered' })
        this.emit('launched', undefined)
      } else {
        const current = this.ball.linvel()
        if (designY >= BOARD.ballStart.y && current.y > 0) {
          // 力度不足自然回落到弹簧，恢复可蓄力状态。
          this.resetToLauncher()
        }
      }
    }
    const settledVelocity = this.ball.linvel()
    const settledSpeed = Math.hypot(settledVelocity.x, settledVelocity.y)
    if (this.mainEntered && designY < 900 && settledSpeed < BALANCE.physics.stallSpeed) {
      this.stationaryMs += BALANCE.physics.fixedStep * 1000
      if (this.stationaryMs >= BALANCE.physics.stallTimeoutMs) {
        // 单纯施加冲量可能被窄缝两侧的接触约束全部抵消；先移出一个球身再给出可见的回场速度。
        const towardCenter = designX < BOARD.width / 2 ? 1 : -1
        this.ball.setTranslation(
          {
            x: position.x + (towardCenter * BALANCE.physics.unstickDistance) / BOARD.scale,
            y: position.y - BALANCE.physics.ballRadius / BOARD.scale,
          },
          true
        )
        this.ball.setLinvel(
          {
            x: towardCenter * BALANCE.physics.unstickImpulse,
            y: -BALANCE.physics.unstickImpulse * 0.6,
          },
          true
        )
        this.emit('unstuck', { x: designX, y: designY })
        this.stationaryMs = 0
      }
    } else {
      this.stationaryMs = 0
    }
    this.eventQueue.drainCollisionEvents((first, second, started) => {
      const meta = this.colliderKinds.get(first) ?? this.colliderKinds.get(second)
      if (!meta) return
      if (meta.kind === 'sensor') {
        this.emit('sensor', { id: meta.id as BoardSensorId, entered: started })
        return
      }
      if (!started) return
      if (meta.kind === 'bumper') {
        playSfx('bumper')
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
      if (meta.kind === 'slingshot') {
        playSfx('bumper')
        const slingshot = BOARD.slingshots.find((item) => item.id === meta.id)
        if (slingshot) {
          const ratio = (BALANCE.physics.slingshotImpulse / 15) * this.slingshotBoost
          this.ball.applyImpulse(
            { x: slingshot.impulse.x * ratio, y: slingshot.impulse.y * ratio },
            true
          )
        }
      }
      if (meta.kind === 'flipper') {
        const side = meta.id as 'left' | 'right'
        const pressed = side === 'left' ? this.leftPressed : this.rightPressed
        if (pressed) {
          // 主动抬板补充向上的可控能量，flipperImpulse 成为实际手感参数。
          this.ball.applyImpulse(
            {
              x: (side === 'left' ? 0.35 : -0.35) * BALANCE.physics.flipperImpulse,
              y: -BALANCE.physics.flipperImpulse,
            },
            true
          )
        }
      }
      if (meta.kind === 'target') {
        playSfx('target')
        this.emit('target', { id: meta.id })
      }
      if (meta.kind === 'excuse') this.emit('excuse', { index: Number(meta.id) })
    })
  }

  /** @description 将物理状态映射到 Pixi 设计坐标 @return {void} */
  private render(alpha: number): void {
    const renderX =
      this.previousBallPosition.x +
      (this.currentBallPosition.x - this.previousBallPosition.x) * alpha
    const renderY =
      this.previousBallPosition.y +
      (this.currentBallPosition.y - this.previousBallPosition.y) * alpha
    this.ballView.position.set(renderX * BOARD.scale, renderY * BOARD.scale)
    if (this.flippers && this.flipperViews) {
      // 拍板视图只同步旋转角度，避免每帧销毁重建 Graphics。
      for (const side of ['left', 'right'] as const) {
        this.flipperViews[side].rotation = this.flippers[side].rotation()
      }
    }
    // 蓄力期间持续上报进度，供发射弹簧的压缩动画使用。
    if (this.chargingAt) {
      const progress = this.getChargeProgress()
      this.emit('charge', { progress })
      this.launcherSpringView.scale.y = 1 - progress * 0.35
    } else {
      this.launcherSpringView.scale.y = 1
    }
    // 推进一次性光效：0.4 秒内扩散并淡出，结束后销毁视图。
    if (this.bursts.length) {
      const now = performance.now()
      this.bursts = this.bursts.filter((burst) => {
        const progress = (now - burst.bornAt) / 400
        if (progress >= 1) {
          burst.view.destroy()
          return false
        }
        burst.view.scale.set(0.5 + progress * 1.8)
        burst.view.alpha = 1 - progress
        return true
      })
    }
    const position = this.ball.translation()
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
    this.root.position.set(
      (host.clientWidth - BOARD.width * scale) / 2,
      (host.clientHeight - BOARD.height * scale) / 2
    )
  }

  /**
   * @description 绘制奶油底板、粉色外框和低对比圆点纹理
   * @return {void}
   */
  private createBackdrop(): void {
    const backdrop = new Graphics()
    backdrop.rect(0, 0, BOARD.width, BOARD.height).fill(PALETTE.boardShade)
    backdrop.roundRect(26, 26, BOARD.width - 52, BOARD.height - 52, 44).fill(PALETTE.boardBase)
    backdrop
      .roundRect(26, 26, BOARD.width - 52, BOARD.height - 52, 44)
      .stroke({ width: 4, color: PALETTE.border })
    // 低对比波点让大面积底板不显得空旷，同时不会与任何碰撞体混淆。
    for (let x = 90; x <= BOARD.width - 90; x += 84) {
      for (let y = 90; y <= BOARD.height - 90; y += 84) {
        backdrop
          .circle(x + ((y / 84) % 2) * 42, y, 5)
          .fill({ color: PALETTE.boardLane, alpha: 0.9 })
      }
    }
    this.root.addChild(backdrop)
  }

  /** @description 绘制通道色带与引导箭头，让可通行区域一眼可读 @return {void} */
  private drawPlayfieldZones(): void {
    const zones = new Graphics()
    // 发射通道底色（顶端止于右上圆弧角下沿）。
    zones.roundRect(628, 248, 66, 924, 24).fill({ color: PALETTE.boardLane, alpha: 0.9 })
    // 左侧加班回环色带沿真实通道中心线绘制（外墙与内轨之间约 90px 宽）。
    zones
      .moveTo(95, 868)
      .lineTo(95, 330)
      .quadraticCurveTo(100, 220, 160, 160)
      .quadraticCurveTo(230, 110, 320, 122)
      .stroke({ width: 64, color: PALETTE.boardLane, alpha: 0.9, cap: 'round', join: 'round' })
    // 左右外侧下班道用略深一档的粉色提示风险。
    zones
      .moveTo(80, 912)
      .lineTo(84, 1002)
      .lineTo(150, 1104)
      .stroke({ width: 42, color: PALETTE.boardShade, cap: 'round', join: 'round' })
    zones
      .moveTo(588, 916)
      .lineTo(584, 1002)
      .lineTo(520, 1104)
      .stroke({ width: 42, color: PALETTE.boardShade, cap: 'round', join: 'round' })
    // 拍板下方的落球区。
    zones.poly([250, 1160, 420, 1160, 388, 1236, 282, 1236]).fill({
      color: PALETTE.boardShade,
      alpha: 0.85,
    })
    this.root.addChild(zones)

    const addArrow = (x: number, y: number, rotation = 0) => {
      const arrow = new Graphics().poly([-9, 8, 0, -9, 9, 8]).fill({
        color: PALETTE.primaryHover,
        alpha: 0.5,
      })
      arrow.position.set(x, y)
      arrow.rotation = rotation
      this.root.addChild(arrow)
    }
    // 回环向上、发射通道向上的引导箭头。
    for (const y of [760, 600, 440]) addArrow(100, y)
    for (const y of [920, 700, 480]) addArrow(660, y)
  }

  /**
   * @description 绘制带高光的轨道挡柱
   * @param {number} x 设计坐标 X
   * @param {number} y 设计坐标 Y
   * @param {number} radius 碰撞半径
   * @return {void}
   */
  private drawPost(x: number, y: number, radius: number): void {
    const view = new Graphics()
    view.circle(x + 1, y + 3, radius + 3).fill({ color: PALETTE.primaryActive, alpha: 0.2 })
    view.circle(x, y, radius + 3).fill(PALETTE.white)
    view.circle(x, y, radius).fill(PALETTE.meteor)
    view.circle(x - radius * 0.28, y - radius * 0.32, radius * 0.3).fill({
      color: PALETTE.white,
      alpha: 0.7,
    })
    this.root.addChild(view)
  }

  /**
   * @description 绘制可主动弹射的劳动装置
   * @param {number} x 设计坐标 X
   * @param {number} y 设计坐标 Y
   * @param {number} radius 碰撞半径
   * @param {string} id 装置编号
   * @param {string} labelKey 装置名称 i18n 键
   * @return {Container} 可切换事件状态的装置视图
   */
  private drawBumper(
    x: number,
    y: number,
    radius: number,
    id: string,
    labelKey: string
  ): Container {
    const palettes: Record<string, { outer: number; inner: number }> = {
      farm: PALETTE.farm,
      pond: PALETTE.pond,
      nest: PALETTE.nest,
    }
    const palette = palettes[id] ?? palettes.farm
    const view = new Graphics()
    view.circle(x + 2, y + 5, radius + 12).fill({ color: PALETTE.primaryActive, alpha: 0.14 })
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10
      view
        .circle(x + Math.cos(angle) * (radius + 9), y + Math.sin(angle) * (radius + 9), 7)
        .fill(index % 2 ? PALETTE.white : palette.outer)
    }
    view
      .circle(x, y, radius + 5)
      .fill(PALETTE.white)
      .stroke({ width: 4, color: palette.outer })
    view
      .circle(x, y, radius - 4)
      .fill(palette.outer)
      .stroke({
        width: 5,
        color: PALETTE.white,
      })
    view.circle(x - radius * 0.25, y - radius * 0.28, radius * 0.2).fill({
      color: PALETTE.white,
      alpha: 0.55,
    })
    const container = new Container()
    container.addChild(view)

    const text = new Text({
      text: this.translate(labelKey),
      style: {
        fill: PALETTE_TEXT.white,
        fontSize: 21,
        fontWeight: '800',
        stroke: { color: palette.inner, width: 5, join: 'round' },
      },
    })
    this.localize(text, labelKey)
    text.anchor.set(0.5)
    text.position.set(x, y)
    container.addChild(text)
    this.root.addChild(container)
    return container
  }

  /**
   * @description 绘制成果验收目标牌
   * @param {number} x 设计坐标 X
   * @param {number} y 设计坐标 Y
   * @param {number} width 目标宽度
   * @param {number} height 目标高度
   * @param {number} angle 目标牌倾角，避免形成水平托球面
   * @param {string} labelKey 目标名称 i18n 键
   * @return {Container} 可整体切换状态的目标视图
   */
  private drawTarget(
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
    labelKey: string
  ): Container {
    const container = new Container()
    container.position.set(x, y)
    container.rotation = angle
    const plate = new Graphics()
      .roundRect(-width / 2, -height / 2, width, height, 12)
      .fill(PALETTE.warning)
      .stroke({ width: 4, color: PALETTE.white })
    plate
      .moveTo(-width / 2 + 8, -height / 2 + 10)
      .lineTo(width / 2 - 8, -height / 2 + 10)
      .stroke({
        width: 2,
        color: PALETTE.white,
        alpha: 0.7,
      })
    const text = new Text({
      text: this.translate(labelKey),
      style: {
        fill: '#7a4c12',
        fontSize: 13,
        fontWeight: '800',
        wordWrap: true,
        wordWrapWidth: width - 8,
      },
    })
    this.localize(text, labelKey)
    text.anchor.set(0.5)
    container.addChild(plate, text)
    this.root.addChild(container)
    return container
  }

  /**
   * @description 按传感器职责绘制可读区域，出局和劳动区传感器保持不可见
   * @param {(typeof BOARD.sensors)[number]} sensor 传感器配置
   * @return {void}
   */
  private drawSensor(sensor: (typeof BOARD.sensors)[number]): void {
    if (!('labelKey' in sensor)) return
    if (sensor.id === 'meteor') {
      const portal = new Graphics()
      portal
        .ellipse(sensor.x, sensor.y, sensor.width / 2 + 10, sensor.height / 2 + 10)
        .fill(0xf1eafb)
        .stroke({ width: 5, color: PALETTE.meteor })
      portal.ellipse(sensor.x, sensor.y, sensor.width / 2 - 4, sensor.height / 2 - 4).stroke({
        width: 3,
        color: PALETTE.meteorDeep,
        alpha: 0.7,
      })
      portal
        .moveTo(sensor.x, sensor.y - 15)
        .lineTo(sensor.x + 5, sensor.y - 3)
        .lineTo(sensor.x + 17, sensor.y)
        .lineTo(sensor.x + 5, sensor.y + 4)
        .lineTo(sensor.x, sensor.y + 17)
        .lineTo(sensor.x - 5, sensor.y + 4)
        .lineTo(sensor.x - 17, sensor.y)
        .lineTo(sensor.x - 5, sensor.y - 3)
        .closePath()
        .fill(PALETTE.gold)
      this.root.addChild(portal)
      this.deviceViews.set('meteor', portal)
      this.addLabel(sensor.labelKey, sensor.x, sensor.y + sensor.height / 2 + 22, 13)
      return
    }
    if (sensor.id === 'inspection') {
      const lane = new Graphics()
        .circle(sensor.x, sensor.y, sensor.width / 2 + 5)
        .fill(PALETTE.boardLane)
        .stroke({ width: 5, color: PALETTE.gold })
      lane.circle(sensor.x, sensor.y, sensor.width / 2 - 8).stroke({
        width: 3,
        color: PALETTE.primaryHover,
        alpha: 0.75,
      })
      this.root.addChild(lane)
      this.addLabel(sensor.labelKey, sensor.x, sensor.y, 13)
      return
    }
    if (sensor.id === 'loop') {
      this.addLabel(sensor.labelKey, sensor.x, sensor.y, 13)
      return
    }
    const card = new Graphics()
      .roundRect(
        sensor.x - sensor.width / 2 - 6,
        sensor.y - sensor.height / 2 - 6,
        sensor.width + 12,
        sensor.height + 12,
        14
      )
      .fill(PALETTE.primaryHover)
      .stroke({ width: 4, color: PALETTE.white })
    this.root.addChild(card)
    if (sensor.id === 'event') this.eventCardView = card
    this.addLabel(sensor.labelKey, sensor.x, sensor.y, 15)
  }

  /** @description 绘制萌园园弹珠外观 @return {void} */
  private drawBall(): void {
    const radius = BALANCE.physics.ballRadius
    this.ballView.circle(2, 4, radius + 3).fill({ color: PALETTE.primaryActive, alpha: 0.25 })
    this.ballView
      .circle(0, 0, radius + 2)
      .fill(PALETTE.primary)
      .stroke({ width: 4, color: PALETTE.white })
    this.ballView.circle(-5, -3, 2.5).fill(PALETTE.foreground)
    this.ballView.circle(5, -3, 2.5).fill(PALETTE.foreground)
    this.ballView.moveTo(-5, 5).quadraticCurveTo(0, 9, 5, 5).stroke({
      width: 2,
      color: PALETTE.foreground,
      cap: 'round',
    })
    this.ballView.circle(-10, 3, 3).fill({ color: PALETTE.primaryHover, alpha: 0.9 })
    this.ballView.circle(10, 3, 3).fill({ color: PALETTE.primaryHover, alpha: 0.9 })
  }

  /** @description 绘制可实时压缩的发射弹簧 @return {void} */
  private drawLauncherSpring(): void {
    this.launcherSpringView.moveTo(-25, 0).lineTo(25, 0).stroke({
      width: 8,
      color: PALETTE.gold,
      cap: 'round',
    })
    this.launcherSpringView.moveTo(0, 6)
    for (let index = 0; index < 7; index += 1) {
      this.launcherSpringView.lineTo(index % 2 ? -15 : 15, 14 + index * 8)
    }
    this.launcherSpringView.lineTo(0, 72).stroke({
      width: 6,
      color: PALETTE.primaryHover,
      cap: 'round',
      join: 'round',
    })
    this.launcherSpringView.position.set(BOARD.launcher.x, BOARD.ballStart.y + 28)
  }

  /**
   * @description 在台面坐标中添加居中文案
   * @param {string} labelKey 显示文案 i18n 键
   * @param {number} x 设计坐标 X
   * @param {number} y 设计坐标 Y
   * @param {number} fontSize 字号
   * @return {void}
   */
  private addLabel(labelKey: string, x: number, y: number, fontSize: number): void {
    const text = new Text({
      text: this.translate(labelKey),
      style: {
        fill: PALETTE_TEXT.mutedDark,
        fontSize,
        fontWeight: '800',
        stroke: { color: PALETTE_TEXT.white, width: 4, join: 'round' },
      },
    })
    this.localize(text, labelKey)
    text.anchor.set(0.5)
    text.position.set(x, y)
    this.root.addChild(text)
  }

  /** @description 登记需要随语言切换刷新的 Pixi 文案 @return {void} */
  private localize(text: Text, key: string): void {
    this.localizedTexts.set(text, key)
  }

  /** @description 派发类型安全的引擎事件 @return {void} */
  private emit<K extends keyof EngineEventMap>(event: K, payload: EngineEventMap[K]): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload))
  }

  /** @description 读取 0～1 的当前蓄力比例 @return {number} 蓄力比例 */
  private getChargeProgress(): number {
    if (!this.chargingAt) return 0
    return Math.min(1, (performance.now() - this.chargingAt) / BALANCE.physics.chargeDurationMs)
  }

  /** @description 同步插值端点，避免传送或恢复时从旧位置滑入 @return {void} */
  private syncBallInterpolation(): void {
    const position = this.ball.translation()
    this.previousBallPosition = { x: position.x, y: position.y }
    this.currentBallPosition = { x: position.x, y: position.y }
  }

  /**
   * @description 开关发射通道单向挡片
   * @param {boolean} enabled 是否启用
   * @return {void}
   */
  private setLauncherGate(enabled: boolean): void {
    if (!this.launcherGate) return
    this.launcherGate.collider.setEnabled(enabled)
    this.launcherGate.view.visible = enabled
  }
}
