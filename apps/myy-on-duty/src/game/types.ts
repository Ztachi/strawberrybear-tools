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
export type GamePhase = 'launcher' | 'playing' | 'paused' | 'inspection' | 'ending' | 'ended'
export type RunningPhase = Exclude<GamePhase, 'paused' | 'ended'>

/** PC 输入使用 KeyboardEvent.code，避免键盘布局改变业务按键。 */
export interface KeyBindings {
  /** 左拍板按键。 */
  left: string
  /** 右拍板按键。 */
  right: string
  /** 发射蓄力按键。 */
  launch: string
}

/** 可恢复的实时物理快照。 */
export interface PhysicsSnapshot {
  /** 弹珠设计坐标与 Rapier 线速度。 */
  x: number
  y: number
  vx: number
  vy: number
  /** 是否已经离开发射弹簧、是否已经进入主台面。 */
  launched?: boolean
  mainEntered?: boolean
  /** 左右拍板角度，用于暂停后视觉与碰撞状态一致。 */
  leftFlipperAngle?: number
  rightFlipperAngle?: number
}

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
  /** 暂停前阶段，保证发射、验收捕获和结束动画能恢复到正确状态。 */
  pausedPhase?: RunningPhase
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
  /** 当前随机事件；所有计时保存剩余毫秒，关闭页面后不会继续流逝。 */
  event: {
    id: EventId
    phase: 'waiting' | 'active'
    remainingMs: number
    target?: DeviceId
    progress?: Record<string, boolean>
    knocked?: number
  } | null
  /** 事件牌冷却剩余时间。 */
  eventCooldownMs: number
  /** 成果验收捕获反馈与冷却的剩余时间。 */
  inspectionCaptureMs: number
  inspectionCooldownMs: number
  /** 陨星坑短暂捕获剩余时间。 */
  meteorCaptureMs: number
  /** 下班掉出画面的剩余动画时间。 */
  endingMs: number
  /** 事件历史，避免连续重复。 */
  eventHistory: EventId[]
  /** 大喵保护是否可用。 */
  rescueAvailable: boolean
  /** 大喵救回次数。 */
  rescueCount: number
  /** 各类表现计数。 */
  stats: Record<string, number>
  /** 物理状态。 */
  physics: PhysicsSnapshot
  /** 最终结算字段。 */
  endReason?: EndReason
  finalTitle?: string
  highlights?: string[]
  configVersion: string
}
