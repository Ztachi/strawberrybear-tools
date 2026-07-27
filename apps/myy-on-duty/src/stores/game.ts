import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import { BALANCE } from '@/config/balance'
import { BOARD } from '@/config/board'
import { finishGame, loadCurrentGame, saveCurrentGame } from '@/db/database'
import { GameEngine } from '@/game/engine/GameEngine'
import { playSfx } from '@/game/engine/audio'
import {
  addMaterial,
  calculateResult,
  drawMaterial,
  inventoryValue,
  selectEvent,
  settleInspection,
} from '@/game/systems/rules'
import type { DeviceId, EndReason, GameSession, KeyBindings, RunningPhase } from '@/game/types'

interface FeedbackMessage {
  /** i18n 文案键。 */
  key: string
  /** 文案插值；以 Key 结尾的字段由视图继续翻译。 */
  params?: Record<string, string | number>
}

/** @description 创建一局干净的初始数据 @return {GameSession} 初始对局 */
function createSession(): GameSession {
  return {
    id: nanoid(),
    phase: 'launcher',
    startedAt: Date.now(),
    elapsedMs: 0,
    currency: 0,
    inventory: [],
    collected: [],
    combo: 0,
    maxCombo: 0,
    sales: [],
    targets: { week: false, purchase: false, limit: false },
    event: null,
    eventCooldownMs: 0,
    inspectionCaptureMs: 0,
    inspectionCooldownMs: 0,
    meteorCaptureMs: 0,
    endingMs: 0,
    eventHistory: [],
    rescueAvailable: true,
    rescueCount: 0,
    stats: {},
    physics: {
      x: 656,
      y: 1100,
      vx: 0,
      vy: 0,
      launched: false,
      mainEntered: false,
    },
    configVersion: BALANCE.version,
  }
}

export const useGameStore = defineStore('game', () => {
  const session = ref<GameSession | null>(null)
  const engine = ref<GameEngine | null>(null)
  const feedback = ref<FeedbackMessage | null>(null)
  const reportOpen = ref(false)
  const pendingResume = ref(false)
  const launchState = ref<'ready' | 'traveling' | 'entered'>('ready')
  const physicsDiagnostic = ref({ x: BOARD.ballStart.x, y: BOARD.ballStart.y, speed: 0 })
  const unstickCount = ref(0)
  const lastDeviceHitAt = new Map<DeviceId, number>()
  let timerId: number | undefined
  let autoSaveId: number | undefined
  let feedbackId: number | undefined
  let lastTickAt = 0
  let ballInLaborZone = false
  let finishInProgress = false
  /** 最近一次经过回环低位传感器的时间，用于判定完整通过而非倒滚。 */
  let loopLowEnteredAt = 0

  const inventoryCount = computed(
    () => session.value?.inventory.reduce((sum, item) => sum + item.count, 0) ?? 0
  )
  const inventoryEstimate = computed(() => inventoryValue(session.value?.inventory ?? []))
  const allTargetsDown = computed(
    () => !!session.value && Object.values(session.value.targets).every(Boolean)
  )

  /**
   * @description 启动新局或恢复存档并连接游戏引擎
   * @param {HTMLElement} host 画布容器
   * @param {boolean} resume 是否恢复
   * @param {KeyBindings} keyBindings PC 按键映射
   * @param {(key: string) => string} translate 游戏画布标签翻译器
   * @return {Promise<void>} 启动完成
   */
  async function start(
    host: HTMLElement,
    resume = false,
    keyBindings?: KeyBindings,
    translate?: (key: string) => string
  ): Promise<void> {
    clearTimers()
    lastDeviceHitAt.clear()
    finishInProgress = false
    reportOpen.value = false
    unstickCount.value = 0
    physicsDiagnostic.value = { x: BOARD.ballStart.x, y: BOARD.ballStart.y, speed: 0 }
    const saved = resume ? await loadCurrentGame() : null
    session.value = saved?.session ?? createSession()
    launchState.value = saved?.session.physics.mainEntered
      ? 'entered'
      : saved?.session.physics.launched
        ? 'traveling'
        : 'ready'
    const gameEngine = markRaw(new GameEngine(keyBindings, translate))
    engine.value = gameEngine
    await gameEngine.init(host)

    if (saved) {
      const savedPhase = saved.session.phase
      const runningPhase: RunningPhase =
        savedPhase === 'paused'
          ? (saved.session.pausedPhase ?? (saved.session.elapsedMs > 0 ? 'playing' : 'launcher'))
          : savedPhase === 'ended'
            ? 'launcher'
            : savedPhase
      gameEngine.restore(saved.session.physics)
      gameEngine.setPaused(true)
      gameEngine.setInputEnabled(runningPhase !== 'ending')
      session.value.pausedPhase = runningPhase
      session.value.phase = 'paused'
      pendingResume.value = true
    }

    applyEventSideEffects()
    updateEventCard()
    syncTargetViews()
    updateInspectionGate()
    gameEngine.on('launched', () => {
      const current = session.value
      if (!current || current.phase !== 'launcher') return
      current.phase = 'playing'
      current.stats.launches = (current.stats.launches ?? 0) + 1
      updateEventCard()
    })
    gameEngine.on('launcher', ({ state }) => {
      launchState.value = state
    })
    if (import.meta.env.DEV) {
      let lastDiagnosticAt = 0
      gameEngine.on('physics', ({ x, y, vx, vy }) => {
        const now = performance.now()
        if (now - lastDiagnosticAt < 100) return
        lastDiagnosticAt = now
        physicsDiagnostic.value = { x, y, speed: Math.hypot(vx, vy) }
      })
      gameEngine.on('unstuck', () => {
        unstickCount.value += 1
      })
    }
    gameEngine.on('bumper', ({ device }) => handleDeviceHit(device))
    gameEngine.on('target', ({ id }) => handleTarget(id))
    gameEngine.on('excuse', ({ index }) => handleExcuse(index))
    gameEngine.on('sensor', ({ id, entered }) => {
      if (id === 'laborZone') handleLaborZone(entered)
      if (!entered) return
      if (id === 'meteor') handleMeteor()
      else if (id === 'event') triggerEvent()
      else if (id === 'inspection') void inspectInventory()
      else if (id === 'loopLow') loopLowEnteredAt = performance.now()
      else if (id === 'loop') handleLoop()
      else if (id === 'drain' || id === 'leftOutlane' || id === 'rightOutlane') {
        void handleExit(id)
      }
    })
    lastTickAt = performance.now()
    timerId = window.setInterval(tick, BALANCE.rules.logicTickMs)
    autoSaveId = window.setInterval(() => void save(), BALANCE.rules.autoSaveMs)
  }

  /** @description 推进所有可冻结的玩法计时状态 @return {void} */
  function tick(): void {
    const now = performance.now()
    const deltaMs = Math.min(250, Math.max(0, now - lastTickAt))
    lastTickAt = now
    const current = session.value
    if (!current || current.phase === 'paused' || current.phase === 'ended') return

    if (current.phase === 'inspection') {
      current.inspectionCaptureMs = Math.max(0, current.inspectionCaptureMs - deltaMs)
      if (current.inspectionCaptureMs === 0) finishInspectionCapture()
      return
    }

    if (current.phase === 'ending') {
      current.endingMs = Math.max(0, current.endingMs - deltaMs)
      if (current.endingMs === 0) void finalizeGame()
      return
    }

    if (current.phase !== 'playing') return
    current.elapsedMs += deltaMs
    if (
      current.combo &&
      current.elapsedMs - (current.stats.lastComboAtMs ?? 0) > BALANCE.rules.comboTimeoutMs
    ) {
      current.combo = 0
    }

    if (current.meteorCaptureMs > 0) {
      current.meteorCaptureMs = Math.max(0, current.meteorCaptureMs - deltaMs)
      if (current.meteorCaptureMs === 0) finishMeteorCapture()
    }

    if (current.event) {
      current.event.remainingMs = Math.max(0, current.event.remainingMs - deltaMs)
      if (current.event.remainingMs === 0) endEvent(current.event.phase === 'active')
    } else if (current.eventCooldownMs > 0) {
      const previous = current.eventCooldownMs
      current.eventCooldownMs = Math.max(0, current.eventCooldownMs - deltaMs)
      if (previous > 0 && current.eventCooldownMs === 0) updateEventCard()
    }

    if (current.inspectionCooldownMs > 0) {
      const previous = current.inspectionCooldownMs
      current.inspectionCooldownMs = Math.max(0, current.inspectionCooldownMs - deltaMs)
      if (previous > 0 && current.inspectionCooldownMs === 0) {
        current.targets = { week: false, purchase: false, limit: false }
        syncTargetViews()
        updateInspectionGate()
      }
    }
  }

  /**
   * @description 显示短时玩法反馈
   * @param {string} key i18n 文案键
   * @param {Record<string, string | number>} params 插值参数
   * @return {void}
   */
  function showFeedback(key: string, params?: Record<string, string | number>): void {
    feedback.value = { key, params }
    window.clearTimeout(feedbackId)
    feedbackId = window.setTimeout(() => {
      feedback.value = null
    }, 1600)
  }

  /**
   * @description 结束当前事件并清理其物理副作用
   * @param {boolean} completed 是否按事件目标完成
   * @return {void}
   */
  function endEvent(completed = false): void {
    const current = session.value
    const activeEvent = current?.event
    if (!current || !activeEvent) return
    const id = activeEvent.id
    clearEventSideEffects()
    current.event = null
    current.eventCooldownMs = BALANCE.events[id].cooldownMs
    updateEventCard()
    if (completed) {
      current.stats[`eventCompleted:${id}`] = (current.stats[`eventCompleted:${id}`] ?? 0) + 1
    }
  }

  /** @description 清理事件创建的所有物理状态 @return {void} */
  function clearEventSideEffects(): void {
    engine.value?.clearExcuses()
    engine.value?.setOvertimeGate(false)
    engine.value?.setBumperBoost({})
    engine.value?.setSprintBoost(false)
    engine.value?.setEventVisuals()
  }

  /** @description 按当前事件重建物理副作用，用于继续游戏 @return {void} */
  function applyEventSideEffects(): void {
    clearEventSideEffects()
    const event = session.value?.event
    if (!event) return
    if (event.id === 'overtime' && event.phase === 'active') engine.value?.setOvertimeGate(true)
    if (event.id === 'sprint') {
      const boost = BALANCE.physics.sprintMultiplier
      engine.value?.setBumperBoost({ farm: boost, pond: boost, nest: boost })
      engine.value?.setSprintBoost(true)
    }
    if (event.id === 'wanted' && event.target) {
      const boost: Partial<Record<DeviceId, number>> = {}
      for (const device of ['farm', 'pond', 'nest'] as const) {
        if (device !== event.target) boost[device] = BALANCE.physics.rejectMultiplier
      }
      engine.value?.setBumperBoost(boost)
    }
    if (event.id === 'excuses') engine.value?.raiseExcuses()
    engine.value?.setEventVisuals(event.id, event.target, event.progress)
  }

  /** @description 同步事件牌亮起、执行和冷却视觉状态 @return {void} */
  function updateEventCard(): void {
    const current = session.value
    engine.value?.setEventCardAvailable(
      !!current && !current.event && current.eventCooldownMs === 0 && current.phase === 'playing'
    )
  }

  /** @description 同步三块目标牌的碰撞与视觉状态 @return {void} */
  function syncTargetViews(): void {
    const current = session.value
    if (!current) return
    for (const [id, down] of Object.entries(current.targets)) {
      engine.value?.setTargetDown(id, down)
    }
  }

  /** @description 根据目标、库存与冷却状态同步验收通道门 @return {void} */
  function updateInspectionGate(): void {
    const current = session.value
    const open =
      !!current &&
      allTargetsDown.value &&
      current.inventory.length > 0 &&
      current.inspectionCooldownMs === 0 &&
      current.phase !== 'inspection' &&
      current.phase !== 'ending' &&
      current.phase !== 'ended'
    engine.value?.setInspectionOpen(open)
  }

  /** @description 处理劳动装置有效命中 @param {DeviceId} device 装置 @return {void} */
  function handleDeviceHit(device: DeviceId): void {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    const now = performance.now()
    if (now - (lastDeviceHitAt.get(device) ?? 0) < BALANCE.rules.hitDebounceMs) return
    lastDeviceHitAt.set(device, now)
    const event = current.event
    if (event?.id === 'wanted' && event.target !== device && device !== 'meteor') {
      showFeedback('game.feedback.rejected')
      return
    }
    const boosted =
      (event?.id === 'rareHarvest' && device !== 'meteor') ||
      (event?.id === 'meteorHarvest' && device === 'meteor')
    const material = drawMaterial(device, boosted)
    const amount = event?.id === 'wanted' && event.target === device ? 2 : 1
    current.inventory = addMaterial(current.inventory, material, device, amount)
    current.collected = addMaterial(current.collected, material, device, amount)
    showFeedback(
      material.id === 'giantMeteor' ? 'game.feedback.giantMaterial' : 'game.feedback.material',
      { materialKey: material.nameKey, amount }
    )
    updateInspectionGate()
    if (device !== 'meteor') {
      current.combo += 1
      current.maxCombo = Math.max(current.maxCombo, current.combo)
      current.stats.lastComboAtMs = current.elapsedMs
    }
    if (material.id === 'giantMeteor' || material.id === 'honeyMeteor') {
      current.stats.special = (current.stats.special ?? 0) + 1
    }
    if (event?.id === 'inspection' && event.progress && device !== 'meteor') {
      event.progress[device] = true
      engine.value?.setEventVisuals(event.id, event.target, event.progress)
      if (['farm', 'pond', 'nest'].every((key) => event.progress?.[key])) {
        current.stats.inspectionEvents = (current.stats.inspectionEvents ?? 0) + 1
        endEvent(true)
      }
    }
    if (event?.id === 'meteorHarvest' && device === 'meteor') endEvent(true)
  }

  /** @description 处理陨星坑捕获、掉落与弹回 @return {void} */
  function handleMeteor(): void {
    const current = session.value
    if (!current || current.phase !== 'playing' || current.meteorCaptureMs > 0) return
    handleDeviceHit('meteor')
    current.meteorCaptureMs = BALANCE.rules.meteorCaptureMs
    engine.value?.setPaused(true)
  }

  /** @description 完成陨星坑捕获：从坑口带光效向下方弹出弹珠 @return {void} */
  function finishMeteorCapture(): void {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    engine.value?.setPaused(false)
    engine.value?.ejectBall({
      x: 380,
      y: 285,
      vx: -3,
      vy: BALANCE.physics.meteorImpulse * 0.5,
    })
  }

  /** @description 借口连发：击倒指定借口牌 @param {number} index 借口牌下标 @return {void} */
  function handleExcuse(index: number): void {
    const current = session.value
    const event = current?.event
    if (!current || current.phase !== 'playing' || event?.id !== 'excuses') return
    engine.value?.knockExcuse(index)
    event.knocked = (event.knocked ?? 0) + 1
    current.stats.excuses = (current.stats.excuses ?? 0) + 1
    if (event.knocked >= 3) {
      current.stats.excuseEvents = (current.stats.excuseEvents ?? 0) + 1
      endEvent(true)
    }
  }

  /** @description 击倒验收目标 @param {string} id 目标编号 @return {void} */
  function handleTarget(id: string): void {
    const current = session.value
    if (
      !current ||
      current.phase !== 'playing' ||
      current.targets[id] ||
      current.inspectionCooldownMs > 0
    ) {
      return
    }
    current.targets[id] = true
    current.stats.targets = (current.stats.targets ?? 0) + 1
    engine.value?.setTargetDown(id, true)
    if (allTargetsDown.value) {
      current.stats.targetRounds = (current.stats.targetRounds ?? 0) + 1
      showFeedback('inspection.ready')
    }
    updateInspectionGate()
  }

  /** @description 完成当前库存的成果验收 @return {Promise<void>} 结算完成 */
  async function inspectInventory(): Promise<void> {
    const current = session.value
    if (
      !current ||
      current.phase !== 'playing' ||
      !allTargetsDown.value ||
      !current.inventory.length ||
      current.inspectionCooldownMs > 0
    ) {
      return
    }
    current.phase = 'inspection'
    current.inspectionCaptureMs = BALANCE.rules.inspectionCaptureMs
    engine.value?.setInspectionOpen(false)
    engine.value?.setPaused(true)
    const sale = settleInspection(current.inventory)
    // 整批材料与收入写入同一份当前对局记录；单次 IndexedDB put 保证记录级原子性。
    current.sales.push(sale)
    current.currency += sale.earned
    current.inventory = []
    current.stats.inspections = (current.stats.inspections ?? 0) + 1
    current.stats.bestMultiplier = Math.max(current.stats.bestMultiplier ?? 0, sale.multiplier)
    showFeedback('inspection.result', {
      ratingKey: `inspection.rating.${sale.rating}`,
      earned: sale.earned,
    })
    playSfx('inspection')
    await save()
  }

  /** @description 结束验收反馈、进入冷却并把弹珠送回主台面 @return {void} */
  function finishInspectionCapture(): void {
    const current = session.value
    if (!current || current.phase !== 'inspection') return
    current.inspectionCaptureMs = 0
    current.inspectionCooldownMs = BALANCE.rules.inspectionCooldownMs
    current.phase = 'playing'
    engine.value?.setPaused(false)
    // 从验收口袋上方带光效向左上抛出，而不是跨台面瞬移。
    engine.value?.ejectBall({
      x: 540,
      y: 665,
      vx: -6,
      vy: -BALANCE.physics.inspectionImpulse * 0.55,
    })
    updateInspectionGate()
  }

  /** @description 命中事件牌后选择并启动事件 @return {void} */
  function triggerEvent(): void {
    const current = session.value
    if (!current || current.phase !== 'playing' || current.event || current.eventCooldownMs > 0) {
      return
    }
    const id = selectEvent(current)
    const target =
      id === 'wanted'
        ? (['farm', 'pond', 'nest'][Math.floor(Math.random() * 3)] as DeviceId)
        : undefined
    const overtimeActive = id === 'overtime' && ballInLaborZone
    current.event = {
      id,
      phase: id === 'overtime' && !overtimeActive ? 'waiting' : 'active',
      remainingMs:
        id === 'overtime' && !overtimeActive
          ? (BALANCE.events.overtime.waitTimeoutMs ?? BALANCE.events.overtime.durationMs)
          : BALANCE.events[id].durationMs,
      target,
      progress: id === 'inspection' ? { farm: false, pond: false, nest: false } : undefined,
      knocked: id === 'excuses' ? 0 : undefined,
    }
    current.eventHistory.push(id)
    current.stats[`event:${id}`] = (current.stats[`event:${id}`] ?? 0) + 1
    showFeedback(`game.event.${id}`)
    playSfx('event')
    updateEventCard()
    if (id === 'rescueReturn') {
      current.rescueAvailable = true
      current.stats['eventCompleted:rescueReturn'] =
        (current.stats['eventCompleted:rescueReturn'] ?? 0) + 1
      current.event = null
      current.eventCooldownMs = BALANCE.events.rescueReturn.cooldownMs
      updateEventCard()
      return
    }
    applyEventSideEffects()
  }

  /**
   * @description 跟踪弹珠是否进入劳动区，并启动等待中的强制加班
   * @param {boolean} entered 是否进入区域
   * @return {void}
   */
  function handleLaborZone(entered: boolean): void {
    ballInLaborZone = entered
    const event = session.value?.event
    if (!entered || event?.id !== 'overtime' || event.phase !== 'waiting') return
    event.phase = 'active'
    event.remainingMs = BALANCE.events.overtime.durationMs
    engine.value?.setOvertimeGate(true)
  }

  /** @description 记录完整通过左侧加班回环；倒滚或从顶部落入不计数 @return {void} */
  function handleLoop(): void {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    // 只有先经过低位传感器再到达顶部出口才算完整通过。
    if (!loopLowEnteredAt || performance.now() - loopLowEnteredAt > 4000) return
    loopLowEnteredAt = 0
    current.stats.loop = (current.stats.loop ?? 0) + 1
    showFeedback('game.feedback.loop', { count: current.stats.loop })
  }

  /** @description 处理中央落口或外侧下班道 @param {EndReason} reason 出口 @return {Promise<void>} 完成 */
  async function handleExit(reason: EndReason): Promise<void> {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    if (reason !== 'drain' && current.rescueAvailable) {
      current.rescueAvailable = false
      current.rescueCount += 1
      current.stats.rescueAtMs = current.elapsedMs
      showFeedback('game.rescue.message')
      playSfx('rescue')
      // 从坠落一侧的下半场带光效上抛回主场，出球点避开事件牌感应区与小动物窝碰撞体。
      engine.value?.ejectBall({
        x: reason === 'leftOutlane' ? 240 : 430,
        y: 800,
        vx: reason === 'leftOutlane' ? 2 : -2,
        vy: -BALANCE.physics.rescueImpulse * 0.6,
      })
      return
    }
    current.phase = 'ending'
    current.endReason = reason
    current.endingMs = BALANCE.rules.endingAnimationMs
    clearEventSideEffects()
    current.event = null
    engine.value?.setInputEnabled(false)
    updateEventCard()
    showFeedback(`game.end.${reason}`)
    playSfx('end')
  }

  /** @description 完成下班结算、称号计算和历史落库 @return {Promise<void>} 完成 */
  async function finalizeGame(): Promise<void> {
    const current = session.value
    if (!current || current.phase !== 'ending' || finishInProgress) return
    finishInProgress = true
    current.phase = 'ended'
    current.endedAt = Date.now()
    current.physics = engine.value?.getSnapshot() ?? current.physics
    engine.value?.setPaused(true)
    const leftoverValue = inventoryValue(current.inventory)
    current.stats.leftoverCount = current.inventory.reduce((sum, item) => sum + item.count, 0)
    current.stats.leftoverValue = leftoverValue
    current.stats.inspectionIncome = current.sales.reduce((sum, sale) => sum + sale.earned, 0)
    current.currency += leftoverValue
    current.inventory = []
    if (current.stats.rescueAtMs !== undefined) {
      current.stats.rescueSurvivalMs = Math.max(0, current.elapsedMs - current.stats.rescueAtMs)
    }
    const result = calculateResult(current)
    current.finalTitle = result.title
    current.highlights = result.highlights
    await finishGame(current)
    reportOpen.value = true
  }

  /** @description 保存当前对局物理和业务快照 @return {Promise<void>} 保存完成 */
  async function save(): Promise<void> {
    if (!session.value || session.value.phase === 'ended') return
    session.value.physics = engine.value?.getSnapshot() ?? session.value.physics
    await saveCurrentGame(session.value)
  }

  /** @description 暂停并保存当前对局 @return {Promise<void>} 暂停完成 */
  async function pause(): Promise<void> {
    const current = session.value
    if (!current || current.phase === 'ended' || current.phase === 'paused') return
    current.pausedPhase = current.phase
    current.phase = 'paused'
    engine.value?.setPaused(true)
    await save()
  }

  /** @description 恢复对局（恢复倒计时由视图层负责展示） @return {void} */
  function resume(): void {
    const current = session.value
    if (!current || current.phase !== 'paused') return
    const target = current.pausedPhase ?? (current.elapsedMs > 0 ? 'playing' : 'launcher')
    current.phase = target
    current.pausedPhase = undefined
    pendingResume.value = false
    engine.value?.setInputEnabled(target !== 'ending')
    // 验收与陨星捕获依靠 Store 计时结束，期间 Rapier 必须继续冻结。
    engine.value?.setPaused(target === 'inspection' || current.meteorCaptureMs > 0)
    applyEventSideEffects()
    updateInspectionGate()
    updateEventCard()
    lastTickAt = performance.now()
  }

  /** @description 开始发射蓄力 @return {void} */
  function beginCharge(): void {
    if (session.value?.phase === 'launcher') engine.value?.beginCharge()
  }

  /** @description 释放发射蓄力 @return {void} */
  function releaseCharge(): void {
    if (session.value?.phase === 'launcher') engine.value?.releaseCharge()
  }

  /** @description 同步调试面板可实时生效的物理参数 @return {void} */
  function syncBalance(): void {
    engine.value?.syncBalance()
  }

  /** @description 运行中切换语言时同步 Pixi 台面文案 @return {void} */
  function setTranslator(translate: (key: string) => string): void {
    engine.value?.setTranslator(translate)
  }

  /** @description 销毁引擎与定时器 @return {void} */
  function dispose(): void {
    void save()
    clearTimers()
    window.clearTimeout(feedbackId)
    engine.value?.destroy()
    engine.value = null
  }

  /** @description 清理所有周期定时器 @return {void} */
  function clearTimers(): void {
    if (timerId) window.clearInterval(timerId)
    if (autoSaveId) window.clearInterval(autoSaveId)
    timerId = undefined
    autoSaveId = undefined
  }

  return {
    session,
    feedback,
    reportOpen,
    pendingResume,
    launchState,
    physicsDiagnostic,
    unstickCount,
    inventoryCount,
    inventoryEstimate,
    start,
    save,
    pause,
    resume,
    beginCharge,
    releaseCharge,
    syncBalance,
    setTranslator,
    dispose,
  }
})
