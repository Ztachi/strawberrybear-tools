import type { MaterialConfig } from '@/config/balance'

export type DeviceId = 'farm' | 'pond' | 'nest' | 'meteor'
export type EventId =
  | 'overtime'
  | 'wanted'
  | 'inspection'
  | 'sprint'
  | 'excuses'
  | 'rareHarvest'
  | 'meteorHarvest'
  | 'rescueReturn'
export type EndReason = 'drain' | 'leftOutlane' | 'rightOutlane'
export type GamePhase = 'launcher' | 'playing' | 'paused' | 'inspection' | 'ended'

/** 库存中的单项材料。 */
export interface InventoryItem {
  /** 稳定材料编号。 */
  id: string
  /** i18n 文案键。 */
  nameKey: string
  /** 材料基础单价。 */
  value: number
  /** 当前数量。 */
  count: number
  /** 稀有度。 */
  rarity: MaterialConfig['rarity']
  /** 来源装置。 */
  source: DeviceId
}

/** 单次成果验收记录。 */
export interface SaleRecord {
  /** 验收发生时间。 */
  timestamp: number
  /** 本批材料快照。 */
  items: InventoryItem[]
  /** 基础价值。 */
  baseValue: number
  /** 评级代码。 */
  rating: string
  /** 验收倍率。 */
  multiplier: number
  /** 实际收入。 */
  earned: number
}

/** 可完整持久化的一局游戏数据。 */
export interface GameSession {
  /** 对局唯一编号。 */
  id: string
  /** 当前流程阶段。 */
  phase: GamePhase
  /** 开始时间。 */
  startedAt: number
  /** 结束时间。 */
  endedAt?: number
  /** 有效游戏时长（毫秒）。 */
  elapsedMs: number
  /** 已出售所得万象星实。 */
  currency: number
  /** 待售库存。 */
  inventory: InventoryItem[]
  /** 整局累计材料。 */
  collected: InventoryItem[]
  /** 当前与最高连续劳动。 */
  combo: number
  maxCombo: number
  /** 已完成验收。 */
  sales: SaleRecord[]
  /** 三块目标击倒状态。 */
  targets: Record<string, boolean>
  /** 当前随机事件；progress 用于查岗完成度，knocked 用于借口牌计数。 */
  event: {
    id: EventId
    endsAt: number
    target?: DeviceId
    progress?: Record<string, boolean>
    knocked?: number
  } | null
  /** 成果验收通道冷却截止时间戳，冷却结束后三块目标重新升起。 */
  inspectionCooldownUntil?: number
  /** 事件历史，避免连续重复。 */
  eventHistory: EventId[]
  /** 大喵保护是否可用。 */
  rescueAvailable: boolean
  /** 大喵救回次数。 */
  rescueCount: number
  /** 各类表现计数。 */
  stats: Record<string, number>
  /** 物理状态。 */
  physics: { x: number; y: number; vx: number; vy: number }
  /** 最终结算字段。 */
  endReason?: EndReason
  finalTitle?: string
  highlights?: string[]
  configVersion: string
}
