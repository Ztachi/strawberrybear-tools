import type { DifficultyKey } from './constants'
import { getDifficulty } from './constants'

/** 卡片类型 */
export type CardType = 'normal' | 'star' | 'joker'

/** 卡片数据结构 */
export interface Card {
  id: number
  pattern: string
  type: CardType
  filled: boolean
}

/** 游戏阶段 */
export type Phase = 'define' | 'exchange'

/** 游戏状态 */
export interface GameState {
  phase: Phase
  difficulty: DifficultyKey
  cards: Card[]
  initialSnapshot: Card[]
  clickedCount: number
  clickSelectedId: number | null
  keyboardSelectedId: number | null
  draggingId: number | null
  hoveredId: number | null
}

/** 状态变更回调 */
export type StateChangeCallback = (state: GameState) => void

/** 游戏状态管理 */
class Game {
  private state: GameState = {
    phase: 'define',
    difficulty: 'easy',
    cards: [],
    initialSnapshot: [],
    clickedCount: 0,
    clickSelectedId: null,
    keyboardSelectedId: null,
    draggingId: null,
    hoveredId: null,
  }

  private listeners: StateChangeCallback[] = []

  constructor() {
    this.initCards()
  }

  /** 通知状态变更 */
  private notify() {
    this.listeners.forEach(fn => fn({ ...this.state }))
  }

  /** 订阅状态变更 */
  subscribe(fn: StateChangeCallback) {
    this.listeners.push(fn)
    fn({ ...this.state })
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  /** 获取当前状态 */
  getState(): GameState {
    return { ...this.state }
  }

  /** 获取卡片数组 */
  getCards(): Card[] {
    return this.state.cards
  }

  /** 获取当前难度 */
  getDifficulty(): DifficultyKey {
    return this.state.difficulty
  }

  /** 获取当前阶段 */
  getPhase(): Phase {
    return this.state.phase
  }

  /** 初始化卡片 */
  initCards() {
    const { cols, rows } = getDifficulty(this.state.difficulty)
    const total = cols * rows
    this.state.cards = Array.from({ length: total }, (_, i) => ({
      id: i,
      pattern: '',
      type: 'normal' as CardType,
      filled: false,
    }))
    this.state.phase = 'define'
    this.state.clickedCount = 0
    this.state.clickSelectedId = null
    this.state.keyboardSelectedId = null
    this.state.draggingId = null
    this.state.hoveredId = null
    this.state.initialSnapshot = []
    this.notify()
  }

  /** 设置难度并重置 */
  setDifficulty(key: DifficultyKey) {
    this.state.difficulty = key
    this.initCards()
  }

  /** 定义阶段点击格子 */
  fillCell(index: number) {
    if (this.state.phase !== 'define') return
    if (this.state.cards[index].filled) return

    const total = this.state.cards.length
    const remaining = total - this.state.clickedCount

    if (remaining === 2) {
      this.state.cards[index].pattern = '⭐'
      this.state.cards[index].type = 'star'
      this.state.cards[index].filled = true
      this.state.clickedCount++
      this.notify()
      return
    }

    if (remaining === 1) {
      this.state.cards[index].pattern = '🃏'
      this.state.cards[index].type = 'joker'
      this.state.cards[index].filled = true
      this.state.clickedCount++
      this.notify()
      this.enterExchangePhase()
      return
    }

    const pairIndex = Math.floor(this.state.clickedCount / 2)
    this.state.cards[index].pattern = String(pairIndex + 1)
    this.state.cards[index].type = 'normal'
    this.state.cards[index].filled = true
    this.state.clickedCount++
    this.notify()
  }

  /** 进入交换阶段 */
  private enterExchangePhase() {
    this.state.phase = 'exchange'
    this.state.initialSnapshot = this.state.cards.map(c => ({ ...c }))
    this.notify()
  }

  /** 重置游戏 */
  reset() {
    this.initCards()
  }

  /** 根据索引交换卡片 */
  swapCardsByIndex(idx1: number, idx2: number) {
    if (idx1 === idx2) return
    if (idx1 < 0 || idx2 < 0 || idx1 >= this.state.cards.length || idx2 >= this.state.cards.length) return

    const id1 = this.state.cards[idx1].id
    const id2 = this.state.cards[idx2].id

    const temp = { ...this.state.cards[idx1] }
    this.state.cards[idx1] = { ...this.state.cards[idx2] }
    this.state.cards[idx2] = temp

    this.state.cards[idx1].id = id1
    this.state.cards[idx2].id = id2

    // 交换后清除所有选中
    this.state.clickSelectedId = null
    this.state.keyboardSelectedId = null
    this.notify()
  }

  /** 设置点击选中 */
  setClickSelected(index: number) {
    this.state.clickSelectedId = index
    this.notify()
  }

  /** 清除点击选中 */
  clearClickSelected() {
    this.state.clickSelectedId = null
    this.notify()
  }

  /** 设置键盘选中 */
  setKeyboardSelected(index: number) {
    this.state.keyboardSelectedId = index
    this.notify()
  }

  /** 清除键盘选中 */
  clearKeyboardSelected() {
    this.state.keyboardSelectedId = null
    this.notify()
  }

  /** 设置拖拽中的卡片 */
  setDragging(index: number | null) {
    this.state.draggingId = index
    this.notify()
  }

  /** 获取拖拽中的卡片索引 */
  getDraggingId(): number | null {
    return this.state.draggingId
  }

  /** 设置悬停 */
  setHovered(index: number | null) {
    if (this.state.hoveredId !== index) {
      this.state.hoveredId = index
      this.notify()
    }
  }

  /** 获取悬停ID */
  getHoveredId(): number | null {
    return this.state.hoveredId
  }
}

export const game = new Game()
