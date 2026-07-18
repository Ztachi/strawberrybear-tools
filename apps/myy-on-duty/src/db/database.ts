import Dexie, { type EntityTable } from 'dexie'
import { z } from 'zod'
import type { GameSession, KeyBindings } from '@/game/types'

export interface SettingsRecord {
  id: 'settings'
  volume: number
  muted: boolean
  locale: 'zh-CN' | 'en-US'
  tutorialCompleted: boolean
  keys: KeyBindings
}

export interface CurrentGameRecord {
  id: 'current'
  session: GameSession
  updatedAt: number
}

export interface HistoryRecord {
  id: string
  session: GameSession
}

/** 跨对局累计统计，为后续总体成就保留稳定数据。 */
export interface LifetimeStatsRecord {
  id: 'lifetime'
  games: number
  totalCurrency: number
  totalMaterials: number
  bestCombo: number
  lastPlayedAt: number
}

const settingsSchema = z.object({
  id: z.literal('settings'),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  locale: z.enum(['zh-CN', 'en-US']),
  tutorialCompleted: z.boolean(),
  keys: z.object({ left: z.string(), right: z.string(), launch: z.string() }),
})

const inventoryItemSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  value: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'event']),
  source: z.enum(['farm', 'pond', 'nest', 'meteor']),
})

const saleRecordSchema = z.object({
  timestamp: z.number().nonnegative(),
  items: z.array(inventoryItemSchema),
  baseValue: z.number().int().nonnegative(),
  rating: z.string().min(1),
  multiplier: z.number().positive(),
  earned: z.number().int().nonnegative(),
})

/** 完整对局结构校验，同时把 Vue 响应式 Proxy 转换为可写入 IndexedDB 的纯数据。 */
export const gameSessionSchema: z.ZodType<GameSession> = z.object({
  id: z.string().min(1),
  phase: z.enum(['launcher', 'playing', 'paused', 'inspection', 'ending', 'ended']),
  pausedPhase: z.enum(['launcher', 'playing', 'inspection', 'ending']).optional(),
  startedAt: z.number().nonnegative(),
  endedAt: z.number().nonnegative().optional(),
  elapsedMs: z.number().nonnegative(),
  currency: z.number().int().nonnegative(),
  inventory: z.array(inventoryItemSchema),
  collected: z.array(inventoryItemSchema),
  combo: z.number().int().nonnegative(),
  maxCombo: z.number().int().nonnegative(),
  sales: z.array(saleRecordSchema),
  targets: z.record(z.string(), z.boolean()),
  event: z
    .object({
      id: z.enum([
        'overtime',
        'wanted',
        'inspection',
        'sprint',
        'excuses',
        'rareHarvest',
        'meteorHarvest',
        'rescueReturn',
      ]),
      phase: z.enum(['waiting', 'active']),
      remainingMs: z.number().nonnegative(),
      target: z.enum(['farm', 'pond', 'nest', 'meteor']).optional(),
      progress: z.record(z.string(), z.boolean()).optional(),
      knocked: z.number().int().nonnegative().optional(),
    })
    .nullable(),
  eventCooldownMs: z.number().nonnegative(),
  inspectionCaptureMs: z.number().nonnegative(),
  inspectionCooldownMs: z.number().nonnegative(),
  meteorCaptureMs: z.number().nonnegative(),
  endingMs: z.number().nonnegative(),
  eventHistory: z.array(
    z.enum([
      'overtime',
      'wanted',
      'inspection',
      'sprint',
      'excuses',
      'rareHarvest',
      'meteorHarvest',
      'rescueReturn',
    ])
  ),
  rescueAvailable: z.boolean(),
  rescueCount: z.number().int().nonnegative(),
  stats: z.record(z.string(), z.number().nonnegative()),
  physics: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    vx: z.number().finite(),
    vy: z.number().finite(),
    launched: z.boolean().optional(),
    mainEntered: z.boolean().optional(),
    leftFlipperAngle: z.number().finite().optional(),
    rightFlipperAngle: z.number().finite().optional(),
  }),
  endReason: z.enum(['drain', 'leftOutlane', 'rightOutlane']).optional(),
  finalTitle: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  configVersion: z.string().min(1),
})

/**
 * @description 把已校验数据转换为 IndexedDB 可克隆的 JSON 快照
 * @param {T} value 已通过 Zod 校验的数据
 * @return {T} 不含响应式 Proxy 的纯数据
 */
function toStorageValue<T>(value: T): T {
  // 对局数据契约本身只允许 JSON 字段；序列化可递归剥离 Vue 的嵌套 Proxy。
  return JSON.parse(JSON.stringify(value)) as T
}

/** @description 判断未知值是否为普通记录 @param {unknown} value 值 @return {boolean} 判断结果 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @description 把 1.0.0 的绝对时间戳存档迁移为可冻结的剩余时间结构
 * @param {unknown} value 未校验的历史对局
 * @return {unknown} 待 Zod 复核的数据
 */
function migrateGameSession(value: unknown): unknown {
  if (!isRecord(value)) return value
  const phase = typeof value.phase === 'string' ? value.phase : 'launcher'
  const elapsedMs = typeof value.elapsedMs === 'number' ? value.elapsedMs : 0
  const legacyEvent = isRecord(value.event) ? value.event : null
  const legacyPhysics = isRecord(value.physics) ? value.physics : {}
  const legacyCooldownUntil =
    typeof value.inspectionCooldownUntil === 'number' ? value.inspectionCooldownUntil : 0
  const event = legacyEvent
    ? {
        ...legacyEvent,
        phase: legacyEvent.phase === 'waiting' ? 'waiting' : 'active',
        remainingMs:
          typeof legacyEvent.remainingMs === 'number'
            ? legacyEvent.remainingMs
            : Math.max(0, Number(legacyEvent.endsAt ?? 0) - Date.now()),
      }
    : null
  return {
    ...value,
    pausedPhase:
      phase === 'paused' && value.pausedPhase === undefined
        ? elapsedMs > 0
          ? 'playing'
          : 'launcher'
        : value.pausedPhase,
    event,
    eventCooldownMs: typeof value.eventCooldownMs === 'number' ? value.eventCooldownMs : 0,
    inspectionCaptureMs:
      typeof value.inspectionCaptureMs === 'number' ? value.inspectionCaptureMs : 0,
    inspectionCooldownMs:
      typeof value.inspectionCooldownMs === 'number'
        ? value.inspectionCooldownMs
        : Math.max(0, legacyCooldownUntil - Date.now()),
    meteorCaptureMs: typeof value.meteorCaptureMs === 'number' ? value.meteorCaptureMs : 0,
    endingMs: typeof value.endingMs === 'number' ? value.endingMs : 0,
    physics: {
      ...legacyPhysics,
      launched: legacyPhysics.launched ?? phase !== 'launcher',
      mainEntered: legacyPhysics.mainEntered ?? elapsedMs > 0,
    },
  }
}

class GameDatabase extends Dexie {
  settings!: EntityTable<SettingsRecord, 'id'>
  currentGames!: EntityTable<CurrentGameRecord, 'id'>
  history!: EntityTable<HistoryRecord, 'id'>
  lifetimeStats!: EntityTable<LifetimeStatsRecord, 'id'>

  constructor() {
    super('myy-on-duty')
    this.version(1).stores({
      settings: 'id',
      currentGames: 'id,updatedAt',
      history: 'id,session.startedAt',
    })
    this.version(2).stores({
      settings: 'id',
      currentGames: 'id,updatedAt',
      history: 'id,session.startedAt',
      lifetimeStats: 'id',
    })
  }
}

export const db = new GameDatabase()

/** @description 读取、迁移并校验当前未结束对局 @return {Promise<CurrentGameRecord | null>} 有效存档 */
export async function loadCurrentGame(): Promise<CurrentGameRecord | null> {
  const stored = await db.currentGames.get('current')
  if (!stored) return null
  const parsed = gameSessionSchema.safeParse(migrateGameSession(stored.session))
  if (!parsed.success) return null
  return { id: 'current', session: parsed.data, updatedAt: stored.updatedAt }
}

/** @description 读取并校验全部历史记录 @return {Promise<GameSession[]>} 有效历史对局 */
export async function loadHistory(): Promise<GameSession[]> {
  const stored = await db.history.orderBy('session.startedAt').reverse().toArray()
  return stored.flatMap((record) => {
    const parsed = gameSessionSchema.safeParse(migrateGameSession(record.session))
    return parsed.success ? [parsed.data] : []
  })
}

/** @description 读取并校验设置 @return {Promise<SettingsRecord>} 有效设置 */
export async function loadSettings(): Promise<SettingsRecord> {
  const stored = await db.settings.get('settings')
  const parsed = settingsSchema.safeParse(stored)
  return parsed.success
    ? parsed.data
    : {
        id: 'settings',
        volume: 0.75,
        muted: false,
        locale: 'zh-CN',
        tutorialCompleted: false,
        keys: { left: 'KeyA', right: 'KeyL', launch: 'Space' },
      }
}

/**
 * @description 保存设置
 * @param {SettingsRecord} settings 设置值
 * @return {Promise<void>} 保存完成
 */
export async function saveSettings(settings: SettingsRecord): Promise<void> {
  await db.settings.put(toStorageValue(settingsSchema.parse(settings)))
}

/**
 * @description 原子保存当前对局
 * @param {GameSession} session 对局快照
 * @return {Promise<void>} 保存完成
 */
export async function saveCurrentGame(session: GameSession): Promise<void> {
  const snapshot = toStorageValue(gameSessionSchema.parse(session))
  await db.currentGames.put({
    id: 'current',
    session: snapshot,
    updatedAt: Date.now(),
  })
}

/** @description 完成对局并原子转入历史 @param {GameSession} session 结果 @return {Promise<void>} 完成 */
export async function finishGame(session: GameSession): Promise<void> {
  const snapshot = toStorageValue(gameSessionSchema.parse(session))
  await db.transaction('rw', db.currentGames, db.history, db.lifetimeStats, async () => {
    const previous = await db.lifetimeStats.get('lifetime')
    const totalMaterials = snapshot.collected.reduce((sum, item) => sum + item.count, 0)
    await db.history.put({ id: snapshot.id, session: snapshot })
    await db.lifetimeStats.put({
      id: 'lifetime',
      games: (previous?.games ?? 0) + 1,
      totalCurrency: (previous?.totalCurrency ?? 0) + snapshot.currency,
      totalMaterials: (previous?.totalMaterials ?? 0) + totalMaterials,
      bestCombo: Math.max(previous?.bestCombo ?? 0, snapshot.maxCombo),
      lastPlayedAt: snapshot.endedAt ?? Date.now(),
    })
    await db.currentGames.delete('current')
  })
}
