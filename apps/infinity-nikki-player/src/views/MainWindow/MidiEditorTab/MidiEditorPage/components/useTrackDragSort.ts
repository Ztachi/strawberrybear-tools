import { onBeforeUnmount, watchEffect } from 'vue'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import type { PianoRollTrackActionsContext } from '@strawberrybear/piano-roll/browser'
import type { PianoTrackHost } from '@/components/PianoWorkspace/usePianoTrackHosts'

const HOLD_DELAY_MS = 260
const HOLD_MOVE_TOLERANCE_PX = 6
const SETTLE_DURATION_MS = 180

interface TrackDragSortOptions {
  hosts: ReadonlyMap<HTMLElement, PianoTrackHost<PianoRollTrackActionsContext>>
  tracks: () => readonly PianoRollTrack[]
  reorder: (trackId: string, toIndex: number) => void
}

interface TrackRowEntry {
  element: HTMLElement
  id: string
  index: number
}

interface PendingPress {
  pointerId: number
  trackId: string
  startX: number
  startY: number
  timer: number
}

interface ActiveDrag {
  pointerId: number
  trackId: string
  fromIndex: number
  targetIndex: number
  startY: number
  clientY: number
  height: number
  ghost: HTMLElement
  indicator: HTMLElement
}

/** 找出当前实际渲染的虚拟轨道行，并映射到完整文档下标。 */
function renderedRows(gutter: HTMLElement, tracks: readonly PianoRollTrack[]): TrackRowEntry[] {
  const indices = new Map(tracks.map((track, index) => [track.id, index]))
  return Array.from(gutter.querySelectorAll<HTMLElement>('.pr-track'))
    .map((element) => {
      const id = element.dataset.trackId ?? ''
      return { element, id, index: indices.get(id) ?? -1 }
    })
    .filter((row) => row.index >= 0)
    .sort((a, b) => Number.parseFloat(a.element.style.top) - Number.parseFloat(b.element.style.top))
}

/**
 * 为卷帘总览安装桌面端拖拽排序。
 * 拖拽把手立即响应，音轨信息区保留长按入口；轨道行由公共卷帘控制器维护，
 * 因此通过稳定的 actions host 找到对应 gutter，避免复制轨道 DOM。
 */
export function useTrackDragSort(options: TrackDragSortOptions): void {
  const installed = new Map<HTMLElement, () => void>()

  function install(gutter: HTMLElement): () => void {
    const currentWindow = gutter.ownerDocument.defaultView
    const currentRoot = gutter.closest<HTMLElement>('.pr-view')
    if (!currentWindow || !currentRoot) return () => {}
    const ownerWindow = currentWindow
    const root = currentRoot

    let pending: PendingPress | null = null
    let active: ActiveDrag | null = null
    let settling = false
    let suppressClickUntil = 0
    let settleTimer = 0
    let settleFrame = 0

    const reduceMotion = (): boolean =>
      ownerWindow.matchMedia('(prefers-reduced-motion: reduce)').matches

    function clearPending(): void {
      if (!pending) return
      ownerWindow.clearTimeout(pending.timer)
      pending = null
    }

    function clearSettleWork(): void {
      ownerWindow.clearTimeout(settleTimer)
      ownerWindow.cancelAnimationFrame(settleFrame)
      settleTimer = 0
      settleFrame = 0
    }

    function resetRows(): void {
      for (const { element } of renderedRows(gutter, options.tracks())) {
        element.classList.remove(
          'midi-track-drag-source',
          'midi-track-shifting',
          'midi-track-settling'
        )
        element.style.removeProperty('transform')
        element.style.removeProperty('transition')
        element.style.removeProperty('will-change')
      }
    }

    function interruptSettling(): void {
      if (!settling) return
      clearSettleWork()
      root.querySelector('.midi-track-drag-ghost')?.remove()
      root.querySelector('.midi-track-drop-indicator')?.remove()
      delete root.dataset.trackSorting
      resetRows()
      settling = false
    }

    function targetIndexAt(clientY: number, fallback: number): number {
      const rows = renderedRows(gutter, options.tracks())
      if (!rows.length) return fallback
      const gutterTop = gutter.getBoundingClientRect().top
      let target = rows[0]!.index
      for (const row of rows) {
        target = row.index
        const top = gutterTop + Number.parseFloat(row.element.style.top)
        if (clientY < top + row.element.offsetHeight / 2) break
      }
      return target
    }

    function updateIndicator(drag: ActiveDrag, rows: TrackRowEntry[]): void {
      const target = rows.find((row) => row.index === drag.targetIndex)
      if (!target || drag.targetIndex === drag.fromIndex) {
        drag.indicator.hidden = true
        return
      }
      const rootRect = root.getBoundingClientRect()
      const gutterRect = gutter.getBoundingClientRect()
      const targetTop = Number.parseFloat(target.element.style.top)
      const top =
        gutterRect.top -
        rootRect.top +
        targetTop +
        (drag.targetIndex > drag.fromIndex ? target.element.offsetHeight : 0)
      drag.indicator.hidden = false
      drag.indicator.style.transform = `translate3d(0, ${top}px, 0)`
    }

    function updateDrag(clientY: number): void {
      const drag = active
      if (!drag) return
      drag.clientY = clientY
      drag.targetIndex = targetIndexAt(clientY, drag.fromIndex)
      drag.ghost.style.transform = `translate3d(0, ${clientY - drag.startY}px, 0)`

      const rows = renderedRows(gutter, options.tracks())
      for (const row of rows) {
        if (row.id === drag.trackId) continue
        const movingUp = drag.targetIndex < drag.fromIndex
        const shouldShift = movingUp
          ? row.index >= drag.targetIndex && row.index < drag.fromIndex
          : row.index <= drag.targetIndex && row.index > drag.fromIndex
        row.element.classList.toggle('midi-track-shifting', shouldShift)
        row.element.style.transform = shouldShift
          ? `translate3d(0, ${movingUp ? drag.height : -drag.height}px, 0)`
          : ''
      }
      updateIndicator(drag, rows)
    }

    function activate(press: PendingPress): void {
      if (pending !== press || settling || options.tracks().length < 2) return
      const source = renderedRows(gutter, options.tracks()).find(
        (row) => row.id === press.trackId
      )?.element
      const fromIndex = options.tracks().findIndex((track) => track.id === press.trackId)
      if (!source || fromIndex < 0) return

      const rootRect = root.getBoundingClientRect()
      const sourceRect = source.getBoundingClientRect()
      const ghost = source.cloneNode(true) as HTMLElement
      ghost.classList.add('midi-track-drag-ghost')
      ghost.classList.remove('midi-track-drag-source', 'midi-track-shifting', 'midi-track-settling')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
      Object.assign(ghost.style, {
        left: `${sourceRect.left - rootRect.left}px`,
        right: 'auto',
        top: `${sourceRect.top - rootRect.top}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
        transform: 'translate3d(0, 0, 0)',
      })
      const indicator = gutter.ownerDocument.createElement('div')
      indicator.className = 'midi-track-drop-indicator'
      indicator.setAttribute('aria-hidden', 'true')
      indicator.hidden = true
      root.append(indicator, ghost)

      source.classList.add('midi-track-drag-source')
      root.dataset.trackSorting = 'true'
      active = {
        pointerId: press.pointerId,
        trackId: press.trackId,
        fromIndex,
        targetIndex: fromIndex,
        startY: press.startY,
        clientY: press.startY,
        height: sourceRect.height,
        ghost,
        indicator,
      }
      pending = null
      updateDrag(press.startY)
    }

    function settle(captured: ReadonlyMap<string, number>, frames: number): void {
      const run = (): void => {
        if (frames > 0) {
          frames -= 1
          settleFrame = ownerWindow.requestAnimationFrame(run)
          return
        }

        const rows = renderedRows(gutter, options.tracks())
        for (const { element } of rows) {
          element.style.transition = 'none'
          element.style.transform = ''
          element.classList.remove('midi-track-drag-source', 'midi-track-shifting')
        }
        root.querySelector('.midi-track-drag-ghost')?.remove()
        root.querySelector('.midi-track-drop-indicator')?.remove()
        delete root.dataset.trackSorting

        if (reduceMotion()) {
          resetRows()
          settling = false
          return
        }

        for (const row of rows) {
          const previousTop = captured.get(row.id)
          if (previousTop === undefined) continue
          const delta = previousTop - row.element.getBoundingClientRect().top
          if (Math.abs(delta) < 0.5) continue
          row.element.style.transform = `translate3d(0, ${delta}px, 0)`
          row.element.style.willChange = 'transform'
        }
        void gutter.offsetHeight
        for (const { element } of rows) {
          element.style.removeProperty('transition')
          element.classList.add('midi-track-settling')
          element.style.transform = ''
        }
        settleTimer = ownerWindow.setTimeout(() => {
          resetRows()
          settling = false
        }, SETTLE_DURATION_MS + 40)
      }
      settleFrame = ownerWindow.requestAnimationFrame(run)
    }

    function finish(commit: boolean): void {
      clearPending()
      const drag = active
      if (!drag) return
      active = null
      suppressClickUntil = ownerWindow.performance.now() + 420
      settling = true

      const captured = new Map(
        renderedRows(gutter, options.tracks()).map(({ id, element }) => [
          id,
          element.getBoundingClientRect().top,
        ])
      )
      captured.set(drag.trackId, drag.ghost.getBoundingClientRect().top)
      const changed = commit && drag.targetIndex !== drag.fromIndex
      if (changed) options.reorder(drag.trackId, drag.targetIndex)
      settle(captured, changed ? 2 : 0)
    }

    function handlePointerDown(event: PointerEvent): void {
      if (event.button !== 0 || active) return
      interruptSettling()
      const target = event.target instanceof Element ? event.target : null
      const row = target?.closest<HTMLElement>('.pr-track')
      const trackId = row?.dataset.trackId
      if (!target || !row || !trackId || !gutter.contains(row)) return

      const handle = target.closest<HTMLElement>('.track-drag-handle')
      if (!handle && !target.closest('.pr-track-select')) return
      const independentControl = target.closest<HTMLElement>(
        '.pr-track-toggle-host, .pr-track-actions-host'
      )
      if (independentControl && !handle) return

      clearPending()
      const press: PendingPress = {
        pointerId: event.pointerId,
        trackId,
        startX: event.clientX,
        startY: event.clientY,
        timer: 0,
      }
      pending = press
      if (handle) {
        event.preventDefault()
        activate(press)
        return
      }
      press.timer = ownerWindow.setTimeout(() => activate(press), HOLD_DELAY_MS)
    }

    function handlePointerMove(event: PointerEvent): void {
      if (active?.pointerId === event.pointerId) {
        event.preventDefault()
        event.stopPropagation()
        updateDrag(event.clientY)
        return
      }
      if (pending?.pointerId !== event.pointerId) return
      if (
        Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) >
        HOLD_MOVE_TOLERANCE_PX
      )
        clearPending()
    }

    function handlePointerUp(event: PointerEvent): void {
      if (active?.pointerId === event.pointerId) {
        event.preventDefault()
        event.stopPropagation()
        updateDrag(event.clientY)
        finish(true)
        return
      }
      if (pending?.pointerId === event.pointerId) clearPending()
    }

    function handlePointerCancel(event: PointerEvent): void {
      if (active?.pointerId === event.pointerId) finish(false)
      else if (pending?.pointerId === event.pointerId) clearPending()
    }

    function suppressConsumedClick(event: Event): void {
      if (ownerWindow.performance.now() > suppressClickUntil) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || !active) return
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    }

    function handleWindowBlur(): void {
      finish(false)
    }

    gutter.addEventListener('pointerdown', handlePointerDown)
    gutter.addEventListener('click', suppressConsumedClick, true)
    gutter.addEventListener('dblclick', suppressConsumedClick, true)
    ownerWindow.addEventListener('pointermove', handlePointerMove, {
      capture: true,
      passive: false,
    })
    ownerWindow.addEventListener('pointerup', handlePointerUp, true)
    ownerWindow.addEventListener('pointercancel', handlePointerCancel, true)
    ownerWindow.addEventListener('keydown', handleKeyDown, true)
    ownerWindow.addEventListener('blur', handleWindowBlur)

    return () => {
      clearPending()
      clearSettleWork()
      active?.ghost.remove()
      active?.indicator.remove()
      active = null
      settling = false
      delete root.dataset.trackSorting
      resetRows()
      gutter.removeEventListener('pointerdown', handlePointerDown)
      gutter.removeEventListener('click', suppressConsumedClick, true)
      gutter.removeEventListener('dblclick', suppressConsumedClick, true)
      ownerWindow.removeEventListener('pointermove', handlePointerMove, true)
      ownerWindow.removeEventListener('pointerup', handlePointerUp, true)
      ownerWindow.removeEventListener('pointercancel', handlePointerCancel, true)
      ownerWindow.removeEventListener('keydown', handleKeyDown, true)
      ownerWindow.removeEventListener('blur', handleWindowBlur)
    }
  }

  const stopWatching = watchEffect(() => {
    const gutters = new Set<HTMLElement>()
    for (const host of options.hosts.values()) {
      const gutter = host.container.closest<HTMLElement>('.pr-gutter')
      if (gutter) gutters.add(gutter)
    }
    for (const gutter of gutters) {
      if (!installed.has(gutter)) installed.set(gutter, install(gutter))
    }
    for (const [gutter, cleanup] of installed) {
      if (gutters.has(gutter)) continue
      cleanup()
      installed.delete(gutter)
    }
  })

  onBeforeUnmount(() => {
    stopWatching()
    for (const cleanup of installed.values()) cleanup()
    installed.clear()
  })
}
