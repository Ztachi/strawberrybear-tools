import { BALANCE, type MaterialConfig } from '@/config/balance'
import type { DeviceId, EventId, GameSession, InventoryItem, SaleRecord } from '@/game/types'

/**
 * @description 按权重抽取一项配置
 * @param {T[]} items 候选项
 * @param {(item: T) => number} getWeight 权重读取器
 * @param {number} random 0 到 1 的随机数
 * @return {T} 命中项
 */
export function weightedPick<T>(
  items: T[],
  getWeight: (item: T) => number,
  random = Math.random()
): T {
  const total = items.reduce((sum, item) => sum + getWeight(item), 0)
  let cursor = random * total
  for (const item of items) {
    cursor -= getWeight(item)
    if (cursor <= 0) return item
  }
  return items.at(-1) as T
}

/**
 * @description 从装置材料池抽取材料
 * @param {DeviceId} device 装置编号
 * @param {boolean} boosted 是否使用丰收概率
 * @param {number} random 随机数
 * @return {MaterialConfig} 材料配置
 */
export function drawMaterial(
  device: DeviceId,
  boosted: boolean,
  random = Math.random()
): MaterialConfig {
  const pool = BALANCE.materials[device]
  return weightedPick(pool, (item) => (boosted ? item.harvestWeight : item.normalWeight), random)
}

/**
 * @description 将材料累加进库存并保持稳定结构
 * @param {InventoryItem[]} inventory 当前库存
 * @param {MaterialConfig} material 材料配置
 * @param {DeviceId} source 来源
 * @param {number} amount 数量
 * @return {InventoryItem[]} 新库存
 */
export function addMaterial(
  inventory: InventoryItem[],
  material: MaterialConfig,
  source: DeviceId,
  amount = 1
): InventoryItem[] {
  const existing = inventory.find((item) => item.id === material.id)
  if (existing) {
    return inventory.map((item) =>
      item.id === material.id ? { ...item, count: item.count + amount } : item
    )
  }
  return [...inventory, { ...material, count: amount, source }]
}

/** @description 计算库存基础价值 @param {InventoryItem[]} items 库存 @return {number} 价值 */
export function inventoryValue(items: InventoryItem[]): number {
  return items.reduce((sum, item) => sum + item.value * item.count, 0)
}

/**
 * @description 生成一次不可重复计算的验收结果
 * @param {InventoryItem[]} items 待售材料
 * @param {number} random 随机数
 * @return {SaleRecord} 销售记录
 */
export function settleInspection(items: InventoryItem[], random = Math.random()): SaleRecord {
  const result = weightedPick(BALANCE.acceptance, (item) => item.weight, random)
  const baseValue = inventoryValue(items)
  return {
    timestamp: Date.now(),
    items: structuredClone(items),
    baseValue,
    rating: result.rating,
    multiplier: result.multiplier,
    earned: Math.round(baseValue * result.multiplier),
  }
}

/**
 * @description 选择不与上一事件相同的随机事件
 * @param {GameSession} session 当前对局
 * @param {number} random 随机数
 * @return {EventId} 事件编号
 */
export function selectEvent(session: GameSession, random = Math.random()): EventId {
  const previous = session.eventHistory.at(-1)
  const candidates = Object.entries(BALANCE.events)
    .filter(([id]) => id !== previous)
    .filter(([id]) => id !== 'rescueReturn' || !session.rescueAvailable)
  return weightedPick(candidates, ([, config]) => config.weight, random)[0] as EventId
}

/**
 * @description 按配置曲线线性插值得到时长分
 * @param {number} seconds 有效时长秒数
 * @return {number} 0 到 100 的时长分
 */
export function durationScore(seconds: number): number {
  const curve = BALANCE.title.durationCurve
  if (seconds <= curve[0][0]) return (seconds / curve[0][0]) * curve[0][1]
  for (let index = 1; index < curve.length; index += 1) {
    const previous = curve[index - 1]
    const current = curve[index]
    if (seconds <= current[0]) {
      const progress = (seconds - previous[0]) / (current[0] - previous[0])
      return previous[1] + (current[1] - previous[1]) * progress
    }
  }
  return 100
}

/**
 * @description 计算本局称号及核心亮点
 * @param {GameSession} session 已结束对局
 * @return {{title: string, highlights: string[]}} 结果
 */
export function calculateResult(session: GameSession): { title: string; highlights: string[] } {
  const { weights } = BALANCE.title
  const currency = Math.min(100, (session.currency / BALANCE.title.currencyMax) * 100)
  const technique = Math.min(
    100,
    session.maxCombo * 1.5 + session.sales.length * 10 + (session.stats.loop ?? 0) * 4
  )
  const special = Math.min(100, (session.stats.special ?? 0) * 25)
  const score =
    currency * weights.currency +
    durationScore(session.elapsedMs / 1000) * weights.duration +
    technique * weights.technique +
    special * weights.special
  const title = BALANCE.title.ranges.find((range) => score >= range.min)?.key ?? 'escapeHelper'
  const highlights = [
    `report.highlight.combo:${session.maxCombo}`,
    `report.highlight.sales:${session.sales.length}`,
    `report.highlight.currency:${session.currency}`,
  ]
  return { title, highlights }
}
