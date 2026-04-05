/**
 * @description: 入口文件 - 初始化游戏和绑定事件
 */
/// <reference types="vite/client" />
import './style.css'
import { game } from './game'
import { renderer } from './domRenderer'
import type { DifficultyKey } from './constants'

/** 交互模式：true=点击模式, false=拖拽模式 */
const INTERACTION_KEY = 'dq7-interaction-mode'
let isClickMode = localStorage.getItem(INTERACTION_KEY) === 'click'

/** 是否为移动端（通过 touch 事件检测） */
const isMobile =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || (window.navigator?.maxTouchPoints ?? 0) > 0)

/** 当前选中的卡片索引，null 表示没有选中 */
let selectedIndex: number | null = null

/** 拖拽中的卡片索引（移动端拖拽用） */
let dragSourceIndex: number | null = null

/**
 * @description: 初始化游戏
 */
function init() {
  const state = game.getState()
  renderer.fullRender(state.cards, state.phase, state.difficulty, state.clickedCount)
  renderer.updateInteractionToggle(isClickMode)
  if (isClickMode) {
    renderer.disableDraggable()
  }
  bindEvents()
}

/**
 * @description: 切换交互模式
 */
function toggleInteractionMode() {
  isClickMode = !isClickMode
  localStorage.setItem(INTERACTION_KEY, isClickMode ? 'click' : 'drag')
  renderer.updateInteractionToggle(isClickMode)
  clearSelection()

  if (isClickMode) {
    renderer.disableDraggable()
  } else {
    const state = game.getState()
    if (state.phase === 'exchange') {
      renderer.enableDraggable()
    }
  }
}

/**
 * @description: 清除选中状态
 */
function clearSelection() {
  selectedIndex = null
  renderer.clearAllSelections()
}

/**
 * @description: 选择卡片（统一选中逻辑，PC点击和移动端触摸复用）
 * @param {number} index 卡片索引
 */
function selectCard(index: number) {
  if (selectedIndex === null) {
    // 第一次选择
    selectedIndex = index
    renderer.updateCardSelection(index, 'selected', 'click')
  } else if (selectedIndex === index) {
    // 取消选择
    renderer.updateCardSelection(index, 'deselected', 'click')
    selectedIndex = null
  } else {
    // 交换
    game.swapCardsByIndex(selectedIndex, index)
    renderer.swapCardElements(selectedIndex, index)
    selectedIndex = null
  }
}

/**
 * @description: 执行交换（统一交换逻辑，PC拖拽和移动端触摸复用）
 * @param {number} fromIndex 源卡片索引
 * @param {number} toIndex 目标卡片索引
 */
function performSwap(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return
  game.swapCardsByIndex(fromIndex, toIndex)
  renderer.swapCardElements(fromIndex, toIndex)
}

/**
 * @description: 绑定事件
 */
function bindEvents() {
  const app = document.getElementById('app')
  if (!app) return

  if (!isMobile) {
    // PC端事件
    app.addEventListener('mousedown', handleMouseDown)

    // 拖拽事件（仅在拖拽模式下）
    if (!isClickMode) {
      const board = renderer['board']
      if (board) {
        board.addEventListener('dragstart', handleDragStart)
        board.addEventListener('dragend', handleDragEnd)
        board.addEventListener('dragover', handleDragOver)
        board.addEventListener('dragleave', handleDragLeave)
        board.addEventListener('drop', handleDrop)
      }
    }

    // 悬停事件
    app.addEventListener('mouseover', handleMouseOver, { passive: true })
    app.addEventListener('mouseout', handleMouseOut, { passive: true })
  } else {
    // 移动端触摸事件（统一使用触摸选择/交换，不再区分点击模式和拖拽模式）
    setupMobileTouchEvents(app)
  }

  // 键盘事件
  document.addEventListener('keydown', handleKeyDown)

  // 交互模式切换
  const toggleSwitch = document.getElementById('toggleSwitch')
  if (toggleSwitch) {
    toggleSwitch.addEventListener('click', toggleInteractionMode)
  }
}

/**
 * @description: PC端鼠标按下处理（点击模式和拖拽模式统一入口）
 */
function handleMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement

  // 卡片点击
  const cardEl = target.closest('.card')
  if (cardEl) {
    const index = Number(cardEl.getAttribute('data-index'))
    if (isNaN(index)) return

    const state = game.getState()

    // 定义阶段：填充格子
    if (state.phase === 'define') {
      const result = game.fillCell(index)
      if (result) {
        const { cards, clickedCount } = game.getState()
        renderer.fillCard(index, cards[index].pattern, cards[index].type)
        renderer.updatePhaseInfo('define', clickedCount, cards.length)
        if (result === 'complete') {
          renderer.updatePhaseInfo('exchange', clickedCount, cards.length)
          if (!isClickMode) {
            renderer.enableDraggable()
          }
        }
      }
      return
    }

    // 交换阶段：点击模式下使用选择逻辑
    if (!isClickMode) return

    selectCard(index)
    return
  }

  // 难度切换
  const tab = target.closest('.tab')
  if (tab) {
    const key = (tab as HTMLElement).dataset.difficulty
    if (key) {
      game.setDifficulty(key as DifficultyKey)
      clearSelection()
      init()
    }
    return
  }

  // 重置
  const resetBtn = target.closest('#resetBtn')
  if (resetBtn) {
    game.reset()
    clearSelection()
    init()
  }
}

/**
 * @description: 移动端触摸事件处理（统一选择/交换，不走PC的mousedown逻辑）
 */
function setupMobileTouchEvents(app: HTMLElement) {
  app.addEventListener(
    'touchstart',
    (e) => {
      const touch = e.touches[0]
      const target = document.elementFromPoint(touch.clientX, touch.clientY)
      if (!target) return

      // 难度切换
      const tab = target.closest('.tab')
      if (tab) {
        const key = (tab as HTMLElement).dataset.difficulty
        if (key) {
          game.setDifficulty(key as DifficultyKey)
          clearSelection()
          init()
        }
        return
      }

      // 重置按钮
      const resetBtn = target.closest('#resetBtn')
      if (resetBtn) {
        game.reset()
        clearSelection()
        init()
        return
      }

      // 交互模式切换
      const toggleSwitch = target.closest('#toggleSwitch')
      if (toggleSwitch) {
        toggleInteractionMode()
        return
      }

      // 卡片
      const cardEl = target.closest('.card') as HTMLElement
      if (!cardEl) return

      const index = Number(cardEl.getAttribute('data-index'))
      if (isNaN(index)) return

      const state = game.getState()

      // 定义阶段：填充格子
      if (state.phase === 'define') {
        const result = game.fillCell(index)
        if (result) {
          const { cards, clickedCount } = game.getState()
          renderer.fillCard(index, cards[index].pattern, cards[index].type)
          renderer.updatePhaseInfo('define', clickedCount, cards.length)
          if (result === 'complete') {
            renderer.updatePhaseInfo('exchange', clickedCount, cards.length)
          }
        }
        return
      }

      // 交换阶段：记录拖拽源
      dragSourceIndex = index
      cardEl.classList.add('dragging')
    },
    { passive: true }
  )

  app.addEventListener(
    'touchmove',
    (e) => {
      if (dragSourceIndex === null) return
      e.preventDefault()

      const touch = e.touches[0]
      const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)
      const cardEl = targetEl?.closest('.card') as HTMLElement

      // 清除之前的 hover 状态
      document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

      if (cardEl && Number(cardEl.getAttribute('data-index')) !== dragSourceIndex) {
        cardEl.classList.add('drag-over')
      }
    },
    { passive: false }
  )

  app.addEventListener(
    'touchend',
    (e) => {
      if (dragSourceIndex === null) return

      const touch = e.changedTouches[0]
      const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)
      const targetCard = targetEl?.closest('.card') as HTMLElement

      // 清除拖拽状态
      document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'))
      document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

      if (targetCard) {
        const toIndex = Number(targetCard.getAttribute('data-index'))
        if (!isNaN(toIndex) && dragSourceIndex !== toIndex) {
          performSwap(dragSourceIndex, toIndex)
        }
      }

      dragSourceIndex = null
    },
    { passive: true }
  )

  app.addEventListener('touchcancel', () => {
    document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'))
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
    dragSourceIndex = null
  })
}

/**
 * @description: 拖拽开始
 */
function handleDragStart(e: DragEvent) {
  const cardEl = (e.target as HTMLElement).closest('.card') as HTMLElement
  if (!cardEl) return

  const index = Number(cardEl.getAttribute('data-index'))
  if (isNaN(index)) return

  // 拖拽时清除选中状态
  clearSelection()

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  cardEl.classList.add('dragging')
  game.setDragging(index)
}

/**
 * @description: 拖拽结束
 */
function handleDragEnd(e: DragEvent) {
  const cardEl = (e.target as HTMLElement).closest('.card')
  cardEl?.classList.remove('dragging')
  game.setDragging(null)
}

/**
 * @description: 拖拽经过
 */
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  const cardEl = (e.target as HTMLElement).closest('.card')
  if (!cardEl || cardEl.classList.contains('dragging')) return
  cardEl.classList.add('drag-over')
}

/**
 * @description: 拖拽离开
 */
function handleDragLeave(e: DragEvent) {
  const cardEl = (e.target as HTMLElement).closest('.card')
  cardEl?.classList.remove('drag-over')
}

/**
 * @description: 拖拽释放
 */
function handleDrop(e: DragEvent) {
  e.preventDefault()
  const targetCard = (e.target as HTMLElement).closest('.card') as HTMLElement
  if (!targetCard) return
  targetCard.classList.remove('drag-over')

  const fromIndex = game.getDraggingId()
  const toIndex = Number(targetCard.getAttribute('data-index'))

  if (fromIndex !== null && !isNaN(toIndex) && fromIndex !== toIndex) {
    performSwap(fromIndex, toIndex)
  }
  game.setDragging(null)
}

/**
 * @description: 键盘事件
 */
function handleKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    e.preventDefault()

    const state = game.getState()
    if (state.phase !== 'exchange') return

    const hoveredId = state.hoveredId
    if (hoveredId === null) return

    // 空格键选择逻辑
    if (selectedIndex === null) {
      selectedIndex = hoveredId
      renderer.updateCardSelection(hoveredId, 'selected', 'keyboard')
    } else if (selectedIndex === hoveredId) {
      renderer.updateCardSelection(hoveredId, 'deselected', 'keyboard')
      selectedIndex = null
    } else {
      performSwap(selectedIndex, hoveredId)
      selectedIndex = null
    }
  }
}

/**
 * @description: 鼠标悬停
 */
function handleMouseOver(e: MouseEvent) {
  const cardEl = (e.target as HTMLElement).closest('.card')
  if (cardEl) {
    const index = Number(cardEl.getAttribute('data-index'))
    if (!isNaN(index)) {
      game.setHovered(index)
    }
  }
}

/**
 * @description: 鼠标离开
 */
function handleMouseOut() {
  game.setHovered(null)
}

// 启动游戏
init()
