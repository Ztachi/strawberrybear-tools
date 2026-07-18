import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { BALANCE } from '@/config/balance'
import {
  db,
  finishGame,
  gameSessionSchema,
  loadCurrentGame,
  loadSettings,
  saveCurrentGame,
  saveSettings,
  type SettingsRecord,
} from '@/db/database'
import type { GameSession } from '@/game/types'

const createSession = (): GameSession => ({
  id: 'db-test',
  phase: 'paused',
  pausedPhase: 'playing',
  startedAt: 100,
  elapsedMs: 1200,
  currency: 30,
  inventory: [],
  collected: [],
  combo: 0,
  maxCombo: 0,
  sales: [],
  targets: { week: false, purchase: false, limit: false },
  event: {
    id: 'inspection',
    phase: 'active',
    remainingMs: 5000,
    progress: { farm: true, pond: false, nest: false },
  },
  eventCooldownMs: 0,
  inspectionCaptureMs: 0,
  inspectionCooldownMs: 0,
  meteorCaptureMs: 0,
  endingMs: 0,
  eventHistory: ['inspection'],
  rescueAvailable: true,
  rescueCount: 0,
  stats: {},
  physics: {
    x: 360,
    y: 500,
    vx: 1,
    vy: 2,
    launched: true,
    mainEntered: true,
  },
  configVersion: BALANCE.version,
})

beforeEach(async () => {
  await db.transaction(
    'rw',
    db.settings,
    db.currentGames,
    db.history,
    db.lifetimeStats,
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.currentGames.clear(),
        db.history.clear(),
        db.lifetimeStats.clear(),
      ])
    }
  )
})

describe('本地存档', () => {
  it('可以保存 Vue 响应式设置并读取纯数据', async () => {
    const settings = reactive<SettingsRecord>({
      id: 'settings',
      volume: 0.5,
      muted: true,
      locale: 'en-US',
      tutorialCompleted: true,
      keys: { left: 'KeyQ', right: 'KeyP', launch: 'Space' },
    })
    await expect(saveSettings(settings)).resolves.toBeUndefined()
    expect(await loadSettings()).toEqual({ ...settings })
  })

  it('可以保存响应式完整对局且事件使用剩余时间', async () => {
    const session = reactive(createSession())
    await expect(saveCurrentGame(session)).resolves.toBeUndefined()
    const loaded = await loadCurrentGame()
    expect(loaded?.session.event?.remainingMs).toBe(5000)
    expect(loaded?.session.physics.mainEntered).toBe(true)
  })

  it('完成对局时同一事务写历史并删除当前存档', async () => {
    const session = createSession()
    await saveCurrentGame(session)
    session.phase = 'ended'
    session.endedAt = 2000
    await finishGame(session)
    expect(await db.currentGames.get('current')).toBeUndefined()
    expect((await db.history.get(session.id))?.session.endedAt).toBe(2000)
    expect(await db.lifetimeStats.get('lifetime')).toMatchObject({ games: 1, totalCurrency: 30 })
  })

  it('拒绝负数货币等损坏存档', () => {
    expect(gameSessionSchema.safeParse({ ...createSession(), currency: -1 }).success).toBe(false)
  })
})
