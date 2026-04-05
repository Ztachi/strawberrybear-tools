import { game } from './game'
import { DIFFICULTIES, getDifficulty, type DifficultyKey } from './constants'
import { t, tf, getLocale } from './i18n'

/** 渲染整个应用 */
export function render() {
  const app = document.getElementById('app')
  if (!app) return

  const state = game.getState()
  const locale = getLocale()
  const difficultyConfig = getDifficulty(state.difficulty)

  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1 class="title">${t('title')}</h1>
        <div class="difficulty-tabs">
          ${DIFFICULTIES.map(d => `
            <button
              class="tab ${state.difficulty === d.key ? 'active' : ''}"
              data-difficulty="${d.key}"
            >
              ${locale === 'en-US' ? d.labelEn : d.label}
            </button>
          `).join('')}
        </div>
      </header>

      <div class="main">
        <div class="board-wrapper">
          <div class="phase-info">
            <span class="phase-label">${t(`phase.${state.phase}`)}</span>
            ${state.phase === 'define' ? `<span class="progress">${tf('progress', { current: state.clickedCount, total: state.cards.length })}</span>` : ''}
          </div>
          <p class="hint">${t(`hint.${state.phase}`)}</p>

          <div class="board" id="gameBoard" style="grid-template-columns: repeat(${difficultyConfig.cols}, 1fr); grid-template-rows: repeat(${difficultyConfig.rows}, 1fr);">
            ${state.cards.map((card, index) => renderCard(card, index, state)).join('')}
          </div>
        </div>

        <div class="control-panel">
          <button class="btn-reset" id="resetBtn">${t('reset')}</button>
        </div>
      </div>
    </div>
  `
}

/** 渲染单张卡片 */
function renderCard(
  card: ReturnType<typeof game.getCards>[number],
  index: number,
  state: ReturnType<typeof game.getState>
): string {
  const isClickSelected = state.clickSelectedId === index
  const isKeyboardSelected = state.keyboardSelectedId === index
  const isEmpty = !card.filled

  let classes = 'card'
  if (isEmpty) classes += ' empty'
  if (isClickSelected) classes += ' click-selected'
  if (isKeyboardSelected) classes += ' keyboard-selected'
  if (card.type === 'star') classes += ' star'
  if (card.type === 'joker') classes += ' joker'

  const content = card.filled ? `<span class="pattern">${card.pattern}</span>` : ''

  // 不同数字不同背景色
  const bgClass = card.type === 'normal' && card.pattern ? `bg-${card.pattern}` : ''

  return `
    <div
      class="${classes} ${bgClass}"
      data-index="${index}"
      draggable="true"
    >
      <div class="card-inner">
        ${content}
      </div>
    </div>
  `
}

/** 绑定全局事件 */
let eventsBound = false

export function bindEvents() {
  if (eventsBound) return
  eventsBound = true

  const app = document.getElementById('app')
  if (!app) return

  // 点击事件
  app.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement

    // 卡片点击
    const cardEl = target.closest('.card')
    if (cardEl) {
      const index = Number((cardEl as HTMLElement).dataset.index)
      if (isNaN(index)) return

      const state = game.getState()

      if (state.phase === 'define') {
        game.fillCell(index)
        render()
        return
      }

      // 交换阶段 - 点击交换
      const prevSelected = state.clickSelectedId

      // 清除之前的选中样式
      if (prevSelected !== null && prevSelected !== index) {
        const prevCard = document.querySelector(`.card[data-index="${prevSelected}"]`)
        prevCard?.classList.remove('click-selected')
      }

      if (prevSelected === index) {
        // 点击同一张，取消选中
        game.clearClickSelected()
      } else if (prevSelected !== null) {
        // 不同卡，交换
        game.swapCardsByIndex(prevSelected, index)
        render()
      } else {
        // 选中
        game.setClickSelected(index)
        cardEl.classList.add('click-selected')
      }
      return
    }

    // 难度切换
    const tab = target.closest('.tab')
    if (tab) {
      const key = (tab as HTMLElement).dataset.difficulty as DifficultyKey
      game.setDifficulty(key)
      render()
      return
    }

    // 重置
    const resetBtn = target.closest('#resetBtn')
    if (resetBtn) {
      game.reset()
      render()
      return
    }
  })

  // 原生拖拽事件
  app.addEventListener('dragstart', (e: DragEvent) => {
    const cardEl = (e.target as HTMLElement).closest('.card') as HTMLElement
    if (!cardEl) return

    const index = Number(cardEl.dataset.index)
    if (isNaN(index)) return

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    }

    cardEl.classList.add('dragging')
    game.setDragging(index)
  })

  app.addEventListener('dragend', (e: DragEvent) => {
    const cardEl = (e.target as HTMLElement).closest('.card')
    cardEl?.classList.remove('dragging')
    game.setDragging(null)
  })

  app.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    const cardEl = (e.target as HTMLElement).closest('.card')
    if (!cardEl || cardEl.classList.contains('dragging')) return
    cardEl.classList.add('drag-over')
  })

  app.addEventListener('dragleave', (e: DragEvent) => {
    const cardEl = (e.target as HTMLElement).closest('.card')
    cardEl?.classList.remove('drag-over')
  })

  app.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    const targetCard = (e.target as HTMLElement).closest('.card') as HTMLElement
    if (!targetCard) return
    targetCard.classList.remove('drag-over')

    const fromIndex = game.getDraggingId()
    const toIndex = Number(targetCard.dataset.index)

    if (fromIndex !== null && !isNaN(toIndex) && fromIndex !== toIndex) {
      game.swapCardsByIndex(fromIndex, toIndex)
      game.setDragging(null)
      render()
    }
  })

  // 键盘事件（空格/回车）- 仅在交换阶段
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()

      const state = game.getState()
      if (state.phase !== 'exchange') return

      const hoveredId = state.hoveredId
      if (hoveredId === null) return

      const prevSelected = state.keyboardSelectedId

      // 清除之前的键盘选中样式
      if (prevSelected !== null && prevSelected !== hoveredId) {
        const prevCard = document.querySelector(`.card[data-index="${prevSelected}"]`)
        prevCard?.classList.remove('keyboard-selected')
      }

      if (prevSelected === hoveredId) {
        // 同一张，取消选中
        game.clearKeyboardSelected()
      } else if (prevSelected !== null) {
        // 不同卡，交换
        game.swapCardsByIndex(prevSelected, hoveredId)
        render()
      } else {
        // 选中
        game.setKeyboardSelected(hoveredId)
        const card = document.querySelector(`.card[data-index="${hoveredId}"]`)
        card?.classList.add('keyboard-selected')
      }
    }
  })

  // 悬停事件 - 仅更新状态，不触发 render
  app.addEventListener('mouseover', (e: MouseEvent) => {
    const cardEl = (e.target as HTMLElement).closest('.card')
    if (!cardEl) return
    const index = Number((cardEl as HTMLElement).dataset.index)
    if (!isNaN(index)) {
      game.setHovered(index)
    }
  })

  app.addEventListener('mouseout', (e: MouseEvent) => {
    const cardEl = (e.target as HTMLElement).closest('.card')
    if (!cardEl) return
    game.setHovered(null)
  })
}
