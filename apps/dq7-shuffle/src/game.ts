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
  hoveredId: number | null
  draggingId: number | null
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
    hoveredId: null,
    draggingId: null,
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
    this.state.hoveredId = null
    this.state.draggingId = null
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
      // 最后两格自动填充特殊卡
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
      // 全部填满，进入交换阶段
      this.enterExchangePhase()
      return
    }

    // 普通卡片，成对填充
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

  /** 交换两张卡片 */
  swapCards(id1: number, id2: number) {
    if (id1 === id2) return
    const idx1 = this.state.cards.findIndex(c => c.id === id1)
    const idx2 = this.state.cards.findIndex(c => c.id === id2)
    if (idx1 === -1 || idx2 === -1) return

    const temp = { ...this.state.cards[idx1] }
    this.state.cards[idx1] = { ...this.state.cards[idx2] }
    this.state.cards[idx2] = temp

    // 保持 id 不变，只交换数据
    this.state.cards[idx1].id = id1
    this.state.cards[idx2].id = id2
    this.notify()
  }

  /** 点击选中/交换 */
  handleClick(id: number) {
    if (this.state.phase !== 'exchange') return

    if (this.state.clickSelectedId === null) {
      // 第一次点击，选中
      this.state.clickSelectedId = id
    } else if (this.state.clickSelectedId === id) {
      // 点击同一张，取消选中
      this.state.clickSelectedId = null
    } else {
      // 第二次点击，交换
      this.swapCards(this.state.clickSelectedId, id)
      this.state.clickSelectedId = null
    }
    this.notify()
  }

  /** 键盘悬停选中/交换 */
  handleKeyboard(id: number) {
    if (this.state.phase !== 'exchange') return

    if (this.state.keyboardSelectedId === null) {
      // 第一次按空格，选中
      this.state.keyboardSelectedId = id
    } else if (this.state.keyboardSelectedId === id) {
      // 同一张卡，取消选中
      this.state.keyboardSelectedId = null
    } else {
      // 与悬停卡交换
      this.swapCards(this.state.keyboardSelectedId, id)
      this.state.keyboardSelectedId = null
    }
    this.notify()
  }

  /** 设置悬停卡片 */
  setHovered(id: number | null) {
    if (this.state.hoveredId !== id) {
      this.state.hoveredId = id
      this.notify()
    }
  }

  /** 设置拖拽中的卡片 */
  setDragging(id: number | null) {
    this.state.draggingId = id
    this.notify()
  }

  /** 获取点击选中ID */
  getClickSelectedId(): number | null {
    return this.state.clickSelectedId
  }

  /** 获取键盘选中ID */
  getKeyboardSelectedId(): number | null {
    return this.state.keyboardSelectedId
  }

  /** 获取悬停ID */
  getHoveredId(): number | null {
    return this.state.hoveredId
  }

  /** 获取拖拽ID */
  getDraggingId(): number | null {
    return this.state.draggingId
  }
}

export const game = new Game()
