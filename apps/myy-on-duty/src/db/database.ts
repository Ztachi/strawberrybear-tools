import Dexie, { type EntityTable } from 'dexie'
import { z } from 'zod'
import type { GameSession } from '@/game/types'

export interface SettingsRecord {
  id: 'settings'
  volume: number
  muted: boolean
  locale: string
  tutorialCompleted: boolean
  keys: { left: string; right: string; launch: string }
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

const settingsSchema = z.object({
  id: z.literal('settings'),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  locale: z.string(),
  tutorialCompleted: z.boolean(),
  keys: z.object({ left: z.string(), right: z.string(), launch: z.string() }),
})

class GameDatabase extends Dexie {
  settings!: EntityTable<SettingsRecord, 'id'>
  currentGames!: EntityTable<CurrentGameRecord, 'id'>
  history!: EntityTable<HistoryRecord, 'id'>

  constructor() {
    super('myy-on-duty')
    this.version(1).stores({
      settings: 'id',
      currentGames: 'id,updatedAt',
      history: 'id,session.startedAt',
    })
  }
}

export const db = new GameDatabase()

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
  settingsSchema.parse(settings)
  await db.settings.put(structuredClone(settings))
}

/**
 * @description 原子保存当前对局
 * @param {GameSession} session 对局快照
 * @return {Promise<void>} 保存完成
 */
export async function saveCurrentGame(session: GameSession): Promise<void> {
  await db.currentGames.put({
    id: 'current',
    session: structuredClone(session),
    updatedAt: Date.now(),
  })
}

/** @description 完成对局并原子转入历史 @param {GameSession} session 结果 @return {Promise<void>} 完成 */
export async function finishGame(session: GameSession): Promise<void> {
  await db.transaction('rw', db.currentGames, db.history, async () => {
    await db.history.put({ id: session.id, session: structuredClone(session) })
    await db.currentGames.delete('current')
  })
}
