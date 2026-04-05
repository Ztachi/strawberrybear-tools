/**
 * @description: 游戏状态管理
 */
import { getDifficulty, type DifficultyKey } from './constants'

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
  clickedCount: number
  hoveredId: number | null
  draggingId: number | null
}

/** 游戏类 */
class Game {
  private state: GameState = {
    phase: 'define',
    difficulty: 'easy',
    cards: [],
    clickedCount: 0,
    hoveredId: null,
    draggingId: null,
  }

  constructor() {
    this.initCards()
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

  /** 获取悬停ID */
  getHoveredId(): number | null {
    return this.state.hoveredId
  }

  /** 获取拖拽中的卡片索引 */
  getDraggingId(): number | null {
    return this.state.draggingId
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
    this.state.hoveredId = null
    this.state.draggingId = null
  }

  /** 设置难度并重置 */
  setDifficulty(key: DifficultyKey) {
    this.state.difficulty = key
    this.initCards()
  }

  /** 定义阶段点击格子 */
  fillCell(index: number): 'filled' | 'star' | 'joker' | 'complete' | null {
    if (this.state.phase !== 'define') return null
    if (this.state.cards[index].filled) return null

    const total = this.state.cards.length
    const remaining = total - this.state.clickedCount

    if (remaining === 2) {
      this.state.cards[index].pattern = '⭐'
      this.state.cards[index].type = 'star'
      this.state.cards[index].filled = true
      this.state.clickedCount++
      return 'star'
    }

    if (remaining === 1) {
      this.state.cards[index].pattern = '🃏'
      this.state.cards[index].type = 'joker'
      this.state.cards[index].filled = true
      this.state.clickedCount++
      this.state.phase = 'exchange'
      return 'complete'
    }

    const pairIndex = Math.floor(this.state.clickedCount / 2)
    this.state.cards[index].pattern = String(pairIndex + 1)
    this.state.cards[index].type = 'normal'
    this.state.cards[index].filled = true
    this.state.clickedCount++
    return 'filled'
  }

  /**
   * @description: 根据索引交换卡片
   * @param {number} idx1 索引1
   * @param {number} idx2 索引2
   * @return {boolean} 是否交换成功
   */
  swapCardsByIndex(idx1: number, idx2: number): boolean {
    if (idx1 === idx2) return false
    if (idx1 < 0 || idx2 < 0 || idx1 >= this.state.cards.length || idx2 >= this.state.cards.length)
      return false

    // 交换整个卡片对象（包括 id）
    const temp = this.state.cards[idx1]
    this.state.cards[idx1] = this.state.cards[idx2]
    this.state.cards[idx2] = temp

    return true
  }

  /** 设置悬停 */
  setHovered(index: number | null) {
    this.state.hoveredId = index
  }

  /** 设置拖拽中的卡片 */
  setDragging(index: number | null) {
    this.state.draggingId = index
  }

  /** 重置游戏 */
  reset() {
    this.initCards()
  }
}

export const game = new Game()
