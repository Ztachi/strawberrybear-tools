import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import { BALANCE } from '@/config/balance'
import { db, finishGame, saveCurrentGame } from '@/db/database'
import { GameEngine } from '@/game/engine/GameEngine'
import {
  addMaterial,
  calculateResult,
  drawMaterial,
  inventoryValue,
  selectEvent,
  settleInspection,
} from '@/game/systems/rules'
import type { DeviceId, EndReason, GameSession } from '@/game/types'

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
    eventHistory: [],
    rescueAvailable: true,
    rescueCount: 0,
    stats: {},
    physics: { x: 654, y: 1100, vx: 0, vy: 0 },
    configVersion: BALANCE.version,
  }
}

export const useGameStore = defineStore('game', () => {
  const session = ref<GameSession | null>(null)
  const engine = ref<GameEngine | null>(null)
  const lastComboHitAt = ref(0)
  const lastDeviceHitAt = new Map<DeviceId, number>()
  const eventReadyAt = ref(0)
  const feedback = ref('')
  const reportOpen = ref(false)
  const timerId = ref<number>()
  const autoSaveId = ref<number>()
  const pendingResume = ref(false)
  /** 暂停开始时刻，用于恢复时顺延事件与冷却截止时间。 */
  const pausedAt = ref(0)

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
   * @return {Promise<void>} 启动完成
   */
  async function start(host: HTMLElement, resume = false): Promise<void> {
    clearTimers()
    const saved = resume ? await db.currentGames.get('current') : null
    session.value = saved?.session ?? createSession()
    const gameEngine = markRaw(new GameEngine())
    engine.value = gameEngine
    await gameEngine.init(host)
    if (saved) {
      gameEngine.restore(saved.session.physics)
      gameEngine.setPaused(true)
      session.value.phase = 'paused'
      pendingResume.value = true
    }
    if (saved) applyEventSideEffects()
    gameEngine.on('launched', () => {
      if (!session.value) return
      session.value.phase = 'playing'
    })
    gameEngine.on('bumper', ({ device }) => handleDeviceHit(device))
    gameEngine.on('target', ({ id }) => handleTarget(id))
    gameEngine.on('excuse', ({ index }) => handleExcuse(index))
    gameEngine.on('sensor', ({ id }) => {
      if (id === 'meteor') handleMeteor()
      else if (id === 'event') triggerEvent()
      else if (id === 'inspection') void inspectInventory()
      else if (id === 'drain' || id === 'leftOutlane' || id === 'rightOutlane') void handleExit(id)
    })
    timerId.value = window.setInterval(tick, 100)
    autoSaveId.value = window.setInterval(() => void save(), BALANCE.rules.autoSaveMs)
  }

  /** @description 推进玩法计时、连击、事件和验收冷却 @return {void} */
  function tick(): void {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    current.elapsedMs += 100
    if (current.combo && Date.now() - lastComboHitAt.value > BALANCE.rules.comboTimeoutMs) {
      current.combo = 0
    }
    if (current.event && Date.now() >= current.event.endsAt) endEvent()
    // 验收冷却结束后三块目标同时升起，开始下一轮验收。
    if (current.inspectionCooldownUntil && Date.now() >= current.inspectionCooldownUntil) {
      current.inspectionCooldownUntil = undefined
      current.targets = { week: false, purchase: false, limit: false }
      for (const id of Object.keys(current.targets)) engine.value?.setTargetDown(id, false)
    }
  }

  /** @description 结束当前事件并清理其物理副作用 @return {void} */
  function endEvent(): void {
    const current = session.value
    if (!current?.event) return
    if (current.event.id === 'excuses') engine.value?.clearExcuses()
    current.event = null
    engine.value?.setBumperBoost({})
    eventReadyAt.value = Date.now() + BALANCE.events.sprint.cooldownMs
  }

  /** @description 按当前事件重建装置弹力等物理副作用（用于恢复存档） @return {void} */
  function applyEventSideEffects(): void {
    const current = session.value
    const event = current?.event
    if (!current || !event) return
    if (event.id === 'sprint') {
      const boost = BALANCE.physics.sprintMultiplier
      engine.value?.setBumperBoost({ farm: boost, pond: boost, nest: boost })
    }
    if (event.id === 'wanted' && event.target) {
      const boost: Partial<Record<DeviceId, number>> = {}
      for (const device of ['farm', 'pond', 'nest'] as const) {
        if (device !== event.target) boost[device] = BALANCE.physics.rejectMultiplier
      }
      engine.value?.setBumperBoost(boost)
    }
    if (event.id === 'excuses') engine.value?.raiseExcuses()
    // 恢复已倒下的目标牌状态，保证物理和存档一致。
    for (const [id, down] of Object.entries(current.targets)) {
      engine.value?.setTargetDown(id, down)
    }
  }

  /** @description 处理劳动装置有效命中 @param {DeviceId} device 装置 @return {void} */
  function handleDeviceHit(device: DeviceId): void {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    const now = Date.now()
    if (now - (lastDeviceHitAt.get(device) ?? 0) < BALANCE.rules.hitDebounceMs) return
    lastDeviceHitAt.set(device, now)
    const event = current.event
    if (event?.id === 'wanted' && event.target !== device && device !== 'meteor') {
      feedback.value = 'event.feedback.rejected'
      return
    }
    const boosted =
      (event?.id === 'rareHarvest' && device !== 'meteor') ||
      (event?.id === 'meteorHarvest' && device === 'meteor')
    const material = drawMaterial(device, boosted)
    const amount = event?.id === 'wanted' && event.target === device ? 2 : 1
    current.inventory = addMaterial(current.inventory, material, device, amount)
    current.collected = addMaterial(current.collected, material, device, amount)
    feedback.value = `${material.nameKey} +${amount}`
    if (device !== 'meteor') {
      current.combo += 1
      current.maxCombo = Math.max(current.maxCombo, current.combo)
      lastComboHitAt.value = now
    }
    if (material.id === 'giantMeteor' || material.id === 'honeyMeteor') {
      current.stats.special = (current.stats.special ?? 0) + 1
    }
    // 暖暖查岗：三个装置各命中一次后事件提前完成。
    if (event?.id === 'inspection' && event.progress && device !== 'meteor') {
      event.progress[device] = true
      if (['farm', 'pond', 'nest'].every((key) => event.progress?.[key])) {
        current.stats.inspectionEvents = (current.stats.inspectionEvents ?? 0) + 1
        endEvent()
      }
    }
    // 陨星丰收：完成一次抽取后事件立即结束。
    if (event?.id === 'meteorHarvest' && device === 'meteor') endEvent()
  }

  /** @description 处理陨星坑：捕获、掉落材料并弹回台面 @return {void} */
  function handleMeteor(): void {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    handleDeviceHit('meteor')
    // 短暂捕获后向台面中上部弹出，方向避开落口与陨星坑入口。
    engine.value?.setPaused(true)
    window.setTimeout(() => {
      if (!session.value || session.value.phase !== 'playing') return
      engine.value?.restore({
        x: 300,
        y: 320,
        vx: -4,
        vy: -BALANCE.physics.meteorImpulse * 0.4,
      })
      engine.value?.setPaused(false)
    }, 400)
  }

  /** @description 借口连发：击倒指定借口牌 @param {number} index 借口牌下标 @return {void} */
  function handleExcuse(index: number): void {
    const current = session.value
    const event = current?.event
    if (!current || event?.id !== 'excuses') return
    engine.value?.knockExcuse(index)
    event.knocked = (event.knocked ?? 0) + 1
    current.stats.excuses = (current.stats.excuses ?? 0) + 1
    // 三块借口牌全部粉碎后事件提前结束。
    if (event.knocked >= 3) {
      current.stats.excuseEvents = (current.stats.excuseEvents ?? 0) + 1
      endEvent()
    }
  }

  /** @description 击倒验收目标 @param {string} id 目标编号 @return {void} */
  function handleTarget(id: string): void {
    const current = session.value
    if (!current || current.targets[id] || current.phase !== 'playing') return
    current.targets[id] = true
    current.stats.targets = (current.stats.targets ?? 0) + 1
    engine.value?.setTargetDown(id, true)
  }

  /** @description 完成当前库存的成果验收 @return {Promise<void>} 结算完成 */
  async function inspectInventory(): Promise<void> {
    const current = session.value
    // 通道只在三目标倒下、有待售材料且不在冷却时开启。
    if (
      !current ||
      current.phase !== 'playing' ||
      !allTargetsDown.value ||
      !current.inventory.length ||
      current.inspectionCooldownUntil
    ) {
      return
    }
    current.phase = 'inspection'
    engine.value?.setPaused(true)
    const sale = settleInspection(current.inventory)
    // 结算结果先固定到内存并立即保存，刷新后不会重新抽倍率或重复出售。
    current.sales.push(sale)
    current.currency += sale.earned
    current.inventory = []
    current.stats.inspections = (current.stats.inspections ?? 0) + 1
    // 事件计时同步顺延验收捕获时长，符合「验收期间暂停事件计时」。
    if (current.event) current.event.endsAt += 1200
    feedback.value = `inspection.result:${sale.rating}:${sale.earned}`
    await save()
    window.setTimeout(() => {
      if (!session.value || session.value.phase === 'ended') return
      // 通道关闭进入冷却；目标保持倒下，冷却结束由 tick 统一升起。
      session.value.inspectionCooldownUntil = Date.now() + BALANCE.rules.inspectionCooldownMs
      session.value.phase = 'playing'
      // 将萌园园弹回台面中上部继续游戏。
      engine.value?.restore({ x: 360, y: 300, vx: 2, vy: -BALANCE.physics.inspectionImpulse * 0.4 })
      engine.value?.setPaused(false)
    }, 1200)
  }

  /** @description 命中事件牌后选择并启动事件 @return {void} */
  function triggerEvent(): void {
    const current = session.value
    if (!current || current.phase !== 'playing' || current.event || Date.now() < eventReadyAt.value)
      return
    const id = selectEvent(current)
    const target =
      id === 'wanted'
        ? (['farm', 'pond', 'nest'][Math.floor(Math.random() * 3)] as DeviceId)
        : undefined
    current.event = {
      id,
      endsAt: Date.now() + BALANCE.events[id].durationMs,
      target,
      // 暖暖查岗需要跟踪三个装置的首次命中。
      progress: id === 'inspection' ? { farm: false, pond: false, nest: false } : undefined,
      knocked: id === 'excuses' ? 0 : undefined,
    }
    current.eventHistory.push(id)
    current.stats[`event:${id}`] = (current.stats[`event:${id}`] ?? 0) + 1
    if (id === 'rescueReturn') {
      // 大喵重新上岗立即生效并结束，不占用事件时长。
      current.rescueAvailable = true
      current.event = null
      eventReadyAt.value = Date.now() + BALANCE.events.rescueReturn.cooldownMs
      feedback.value = 'game.event.rescueReturn'
      return
    }
    applyEventSideEffects()
  }

  /** @description 处理中央落口或外侧下班道 @param {EndReason} reason 出口 @return {Promise<void>} 完成 */
  async function handleExit(reason: EndReason): Promise<void> {
    const current = session.value
    if (!current || current.phase !== 'playing') return
    if (reason !== 'drain' && current.rescueAvailable) {
      // 大喵只保护左右外侧下班道，消耗后把萌园园弹回台面中部偏上。
      current.rescueAvailable = false
      current.rescueCount += 1
      feedback.value = 'game.rescue.message'
      engine.value?.restore({
        x: 360,
        y: 480,
        vx: reason === 'leftOutlane' ? 4 : -4,
        vy: -BALANCE.physics.rescueImpulse * 0.6,
      })
      return
    }
    current.phase = 'ended'
    current.endReason = reason
    current.endedAt = Date.now()
    endEvent()
    // 剩余待售材料按基础价值 ×1.0 结算后再计算称号。
    const leftoverValue = inventoryValue(current.inventory)
    current.stats.leftoverValue = leftoverValue
    current.currency += leftoverValue
    current.inventory = []
    const result = calculateResult(current)
    current.finalTitle = result.title
    current.highlights = result.highlights
    current.physics = engine.value?.getSnapshot() ?? current.physics
    engine.value?.setPaused(true)
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
    pausedAt.value = Date.now()
    current.phase = 'paused'
    engine.value?.setPaused(true)
    await save()
  }

  /** @description 恢复对局（恢复倒计时由视图层负责展示） @return {void} */
  function resume(): void {
    const current = session.value
    if (!current || current.phase !== 'paused') return
    pendingResume.value = false
    // 暂停期间事件与冷却计时冻结，恢复时按暂停时长整体顺延截止时间。
    if (pausedAt.value) {
      const frozenMs = Date.now() - pausedAt.value
      if (current.event) current.event.endsAt += frozenMs
      if (current.inspectionCooldownUntil) current.inspectionCooldownUntil += frozenMs
      if (eventReadyAt.value) eventReadyAt.value += frozenMs
      pausedAt.value = 0
    }
    // 发射前暂停恢复后仍处于发射状态，进入主场后才恢复计时。
    current.phase = current.elapsedMs > 0 ? 'playing' : 'launcher'
    engine.value?.setPaused(false)
  }

  /** @description 销毁引擎与定时器 @return {void} */
  function dispose(): void {
    void save()
    clearTimers()
    engine.value?.destroy()
    engine.value = null
  }

  /** @description 清理所有持有的周期定时器 @return {void} */
  function clearTimers(): void {
    if (timerId.value) window.clearInterval(timerId.value)
    if (autoSaveId.value) window.clearInterval(autoSaveId.value)
    timerId.value = undefined
    autoSaveId.value = undefined
  }

  return {
    session,
    feedback,
    reportOpen,
    pendingResume,
    inventoryCount,
    inventoryEstimate,
    start,
    save,
    pause,
    resume,
    dispose,
  }
})
