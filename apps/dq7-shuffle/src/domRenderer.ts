/**
 * @description: DOM渲染器 - 负责所有DOM操作，全量渲染仅在初始化时调用
 * 性能优化：使用 Map 直接维护 DOM 引用，避免重复查询
 */
import type { Card, Phase } from './game'
import { DIFFICULTIES, getDifficulty, type DifficultyKey } from './constants'
import { t, tf, getLocale } from './i18n'

/** 卡片类型 */
type CardType = 'normal' | 'star' | 'joker'

export class DOMRenderer {
  private board: HTMLElement | null = null
  /** 索引到 DOM 元素的直接映射，避免 querySelector 查询 */
  private cardMap: Map<number, HTMLElement> = new Map()

  constructor() {}

  /**
   * @description: 全量渲染 - 仅在初始化和重置时调用
   */
  fullRender(cards: Card[], phase: Phase, difficulty: DifficultyKey, clickedCount: number) {
    const app = document.getElementById('app')
    if (!app) return

    const locale = getLocale()
    const difficultyConfig = getDifficulty(difficulty)

    app.innerHTML = `
      <div class="container">
        <header class="header">
          <h1 class="title">${t('title')}</h1>
          <div class="difficulty-tabs">
            ${DIFFICULTIES.map(
              (d) => `
              <button
                class="tab ${difficulty === d.key ? 'active' : ''}"
                data-difficulty="${d.key}"
              >
                ${locale === 'en-US' ? d.labelEn : d.label}
              </button>
            `
            ).join('')}
          </div>
        </header>

        <div class="main">
          <div class="board-wrapper">
            <div class="phase-info">
              <span class="phase-label">${t(`phase.${phase}`)}</span>
              ${phase === 'define' ? `<span class="progress">${tf('progress', { current: clickedCount, total: cards.length })}</span>` : ''}
              <div class="interaction-toggle" id="interactionToggle">
                <span class="toggle-label">点击</span>
                <div class="toggle-switch" id="toggleSwitch"></div>
                <span class="toggle-label">拖拽</span>
              </div>
            </div>
            <p class="hint">${t(`hint.${phase}`)}</p>

            <div class="board" id="gameBoard" style="grid-template-columns: repeat(${difficultyConfig.cols}, 1fr); grid-template-rows: repeat(${difficultyConfig.rows}, 1fr);">
              ${cards.map((card, index) => this.renderCard(card, index)).join('')}
            </div>
          </div>

          <div class="control-panel">
            <button class="btn-reset" id="resetBtn">${t('reset')}</button>
          </div>
        </div>
      </div>
    `

    this.board = document.getElementById('gameBoard')
    this.buildCardMap()
  }

  /**
   * @description: 构建索引到 DOM 元素的映射（性能优化关键）
   */
  private buildCardMap() {
    this.cardMap.clear()
    if (!this.board) return

    const cardEls = this.board.querySelectorAll<HTMLElement>('.card')
    cardEls.forEach((card) => {
      const index = Number(card.dataset.index)
      if (!isNaN(index)) {
        this.cardMap.set(index, card)
      }
    })
  }

  /**
   * @description: 渲染单张卡片
   */
  private renderCard(card: Card, index: number): string {
    const isEmpty = !card.filled

    let classes = 'card'
    if (isEmpty) classes += ' empty'
    if (card.type === 'star') classes += ' star'
    if (card.type === 'joker') classes += ' joker'

    const content = card.filled ? `<span class="pattern">${card.pattern}</span>` : ''

    const bgClass = card.type === 'normal' && card.pattern ? `bg-${card.pattern}` : ''

    return `
      <div
        class="${classes} ${bgClass}"
        data-index="${index}"
      >
        <div class="card-inner">
          ${content}
        </div>
      </div>
    `
  }

  /**
   * @description: 获取卡片DOM元素 - O(1) 查找
   */
  getCardElement(index: number): HTMLElement | null {
    return this.cardMap.get(index) ?? null
  }

  /**
   * @description: 更新单张卡片的选中状态
   */
  updateCardSelection(
    index: number,
    state: 'selected' | 'deselected',
    source: 'keyboard' | 'click' = 'click'
  ) {
    const card = this.getCardElement(index)
    if (!card) return

    const className = source === 'keyboard' ? 'keyboard-selected' : 'click-selected'

    if (state === 'selected') {
      // 选中前先清除同类型的其他选中状态
      if (source === 'click') {
        this.board?.querySelector('.click-selected')?.classList.remove('click-selected')
      }
      card.classList.add(className)
    } else {
      card.classList.remove(className)
    }
  }

  /**
   * @description: 交换两张卡片在DOM中的位置，并同步 data-index
   * 使用 insertBefore 进行高效的 DOM 移动
   */
  swapCardElements(fromIndex: number, toIndex: number) {
    const fromCard = this.cardMap.get(fromIndex)
    const toCard = this.cardMap.get(toIndex)
    if (!fromCard || !toCard) return

    const parent = fromCard.parentElement
    if (!parent || parent !== toCard.parentElement) return

    // 1. 获取两个元素在 DOM 中的实际位置
    const fromNext = fromCard.nextSibling
    const toNext = toCard.nextSibling

    // 2. 高效交换：使用 CSS transform 而非真的移动 DOM
    // 这样可以避免触发重排重绘，性能更好
    // 但考虑到需要保持 grid 顺序，我们使用 insertBefore 交换

    if (fromNext === toCard) {
      // 紧邻且 from 在前：to -> from
      parent.insertBefore(fromCard, toCard)
    } else if (toNext === fromCard) {
      // 紧邻且 to 在前：from -> to
      parent.insertBefore(toCard, fromCard)
    } else {
      // 不相邻：同时移动两个
      parent.insertBefore(fromCard, toNext)
      parent.insertBefore(toCard, fromNext)
    }

    // 3. 同步更新 Map 和 data-index
    this.cardMap.set(fromIndex, toCard)
    this.cardMap.set(toIndex, fromCard)
    fromCard.dataset.index = String(toIndex)
    toCard.dataset.index = String(fromIndex)

    // 4. 清除两种选中状态
    fromCard.classList.remove('click-selected', 'keyboard-selected')
    toCard.classList.remove('click-selected', 'keyboard-selected')
  }

  /**
   * @description: 填充卡片内容（定义阶段）
   */
  fillCard(index: number, pattern: string, type: CardType) {
    const card = this.getCardElement(index)
    if (!card) return

    card.classList.remove('empty')
    if (type === 'star') card.classList.add('star')
    if (type === 'joker') card.classList.add('joker')
    if (type === 'normal' && pattern) card.classList.add(`bg-${pattern}`)

    const inner = card.querySelector('.card-inner')
    if (inner) {
      inner.innerHTML = `<span class="pattern">${pattern}</span>`
    }
  }

  /**
   * @description: 更新阶段信息
   */
  updatePhaseInfo(phase: Phase, clickedCount: number, total: number) {
    const phaseLabel = document.querySelector('.phase-label')
    const progress = document.querySelector('.progress')
    const hint = document.querySelector('.hint')

    if (phaseLabel) phaseLabel.textContent = t(`phase.${phase}`)
    if (progress && phase === 'define') {
      progress.textContent = tf('progress', { current: clickedCount, total })
    }
    if (hint) hint.textContent = t(`hint.${phase}`)
  }

  /**
   * @description: 给所有卡片添加 draggable 属性（进入交换阶段时调用）
   */
  enableDraggable() {
    if (!this.board) return
    const cards = this.board.querySelectorAll<HTMLElement>('.card')
    cards.forEach((card) => {
      card.setAttribute('draggable', 'true')
    })
  }

  /**
   * @description: 移除所有卡片的 draggable 属性
   */
  disableDraggable() {
    if (!this.board) return
    const cards = this.board.querySelectorAll<HTMLElement>('.card')
    cards.forEach((card) => {
      card.removeAttribute('draggable')
    })
  }

  /**
   * @description: 更新交互模式开关的显示
   */
  updateInteractionToggle(isClickMode: boolean) {
    const toggleSwitch = document.getElementById('toggleSwitch')
    if (toggleSwitch) {
      toggleSwitch.classList.toggle('click-mode', isClickMode)
    }
  }

  /**
   * @description: 清除所有卡片的选中状态
   */
  clearAllSelections() {
    if (!this.board) return
    const cards = this.board.querySelectorAll<HTMLElement>('.card')
    cards.forEach((card) => {
      card.classList.remove('click-selected', 'keyboard-selected')
    })
  }
}

export const renderer = new DOMRenderer()
