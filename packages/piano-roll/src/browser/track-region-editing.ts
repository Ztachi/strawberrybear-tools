import type { PianoRollTimeline } from '../core'
import { getTrackTimeRange, type RenderFrame } from './renderer'
import type { PianoRollEditingOptions } from './types'
import { dragScrollVelocity } from './viewport'

/** 区域手势所需的控制器端口；试听时长和工程数据仍由宿主拥有。 */
export interface TrackRegionHost {
  pane: HTMLElement
  scroll: HTMLElement
  timeline(): PianoRollTimeline
  options(): PianoRollEditingOptions | undefined
  label(): string
  geometry(): { timeZoom: number; width: number }
  /** 只延长临时浏览空间并预览区域，不提交工程或历史。 */
  preview(trackId: string | null, endTick?: number, extentTick?: number): void
}

/** 总览区域手势层；控制器统一驱动渲染和生命周期。 */
export interface TrackRegionEditing {
  isDragging(): boolean
  render(frame: RenderFrame): void
  reset(): void
  destroy(): void
}

/**
 * @description: 为总览安装音轨区域右边缘手势，松手提交一次，边缘拖动持续扩展浏览空间。
 * @param {TrackRegionHost} host 控制器坐标、只读配置及预览端口
 * @return {TrackRegionEditing} 区域句柄渲染、取消和销毁接口
 */
export function installTrackRegionEditing(host: TrackRegionHost): TrackRegionEditing {
  const owner = host.pane.ownerDocument
  const window = owner.defaultView!
  const layer = owner.createElement('div')
  layer.className = 'pr-region-handles'
  host.pane.append(layer)
  const handles = new Map<string, HTMLButtonElement>()
  let drag: {
    button: HTMLButtonElement
    pointerId: number
    trackId: string
    startX: number
    clientX: number
    scrollLeft: number
    timeZoom: number
    originalEnd: number
    endTick: number
    minimum: number
    altKey: boolean
    moved: boolean
    lastFrame: number
    raf: number
  } | null = null

  /**
   * @description: 根据抓取偏移计算边界；区域不能缩到音符尾端之前。
   * @return 无返回值。
   */
  function updateBoundary(): void {
    if (!drag) return
    const timeline = host.timeline()
    const geometry = host.geometry()
    const seconds =
      timeline.tickToSeconds(drag.originalEnd) +
      (drag.clientX - drag.startX + host.scroll.scrollLeft - drag.scrollLeft) / drag.timeZoom
    const tick = timeline.secondsToTick(Math.max(0, seconds))
    const snap = host.options()?.snapTicks
    drag.endTick = Math.max(
      drag.minimum,
      Math.round(drag.altKey || !snap ? tick : snap(tick, 'nearest'))
    )
    // 额外留出半屏供下一帧自动滚动；它不属于音轨长度，也不进入保存/导出。
    const extent = timeline.secondsToTick(
      (host.scroll.scrollLeft + geometry.width * 1.5) / drag.timeZoom
    )
    host.preview(drag.trackId, drag.endTick, Math.max(drag.endTick, extent))
  }

  /**
   * @description: 接近视口边缘时滚动并继续增加可编辑范围，不受原曲末尾限制。
   * @param {number} timestamp 当前动画帧时间
   * @return 无返回值。
   */
  function autoScroll(timestamp: number): void {
    if (!drag) return
    const elapsed = Math.min(0.05, Math.max(0, (timestamp - drag.lastFrame) / 1000))
    drag.lastFrame = timestamp
    if (drag.moved) {
      updateBoundary()
      const rect = host.scroll.getBoundingClientRect()
      const velocity = dragScrollVelocity(drag.clientX - rect.left, host.scroll.clientWidth)
      if (velocity) {
        host.scroll.scrollLeft += velocity * elapsed
        updateBoundary()
      }
    }
    drag.raf = window.requestAnimationFrame(autoScroll)
  }

  /**
   * @description: 结束拖拽，取消时不修改文档；提交时仅发出一次区域长度意图。
   * @param {boolean} commit 是否提交预览边界
   * @return 无返回值。
   */
  function finish(commit: boolean): void {
    const current = drag
    if (!current) return
    drag = null
    window.cancelAnimationFrame(current.raf)
    if (current.button.hasPointerCapture(current.pointerId))
      current.button.releasePointerCapture(current.pointerId)
    if (commit && current.moved && current.endTick !== current.originalEnd) {
      host.options()?.onIntent({
        type: 'resize-track-region',
        trackId: current.trackId,
        endTick: current.endTick,
      })
    }
    // Vue 宿主先应用意图并回传文档，再收回临时浏览空间，避免松手时横向视口跳回旧曲尾。
    window.queueMicrotask(() => host.preview(null))
  }

  /**
   * @description: 从右侧句柄抓取区域，不让点击冒泡到选轨、开详情或画笔入口。
   * @param {PointerEvent} event 抓取事件
   * @param {HTMLButtonElement} button 区域句柄
   * @return 无返回值。
   */
  function begin(event: PointerEvent, button: HTMLButtonElement): void {
    if (event.button !== 0 || !host.options()?.enabled || drag) return
    event.preventDefault()
    event.stopPropagation()
    const trackId = button.dataset.trackId!
    const originalEnd = Number(button.dataset.endTick)
    const minimum = Number(button.dataset.minimum)
    const geometry = host.geometry()
    button.setPointerCapture(event.pointerId)
    drag = {
      button,
      pointerId: event.pointerId,
      trackId,
      startX: event.clientX,
      clientX: event.clientX,
      scrollLeft: host.scroll.scrollLeft,
      timeZoom: geometry.timeZoom,
      originalEnd,
      endTick: originalEnd,
      minimum,
      altKey: event.altKey,
      moved: false,
      lastFrame: window.performance.now(),
      raf: 0,
    }
    drag.raf = window.requestAnimationFrame(autoScroll)
  }

  /**
   * @description: 创建具有键盘操作和指针捕获的区域句柄。
   * @param {string} trackId 稳定音轨 ID
   * @return {HTMLButtonElement} 可复用的句柄
   */
  function makeHandle(trackId: string): HTMLButtonElement {
    const button = owner.createElement('button')
    button.type = 'button'
    button.className = 'pr-region-resize'
    button.dataset.trackId = trackId
    button.setAttribute('role', 'slider')
    button.addEventListener('pointerdown', (event) => begin(event, button))
    button.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      drag.clientX = event.clientX
      drag.altKey = event.altKey
      drag.moved ||= Math.abs(event.clientX - drag.startX) >= 3
      if (drag.moved) updateBoundary()
    })
    button.addEventListener('pointerup', (event) => {
      if (drag?.pointerId !== event.pointerId) return
      updateBoundary()
      finish(true)
    })
    button.addEventListener('pointercancel', () => finish(false))
    button.addEventListener('lostpointercapture', () => finish(false))
    for (const type of ['click', 'dblclick', 'contextmenu'])
      button.addEventListener(type, (event) => event.stopPropagation())
    button.addEventListener('keydown', (event) => {
      if (!host.options()?.enabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      const end = Number(button.dataset.endTick)
      const step = Math.max(1, Math.round(host.options()!.defaultDurationTicks))
      const target = Math.max(
        Number(button.dataset.minimum),
        end + (event.key === 'ArrowRight' ? step : -step)
      )
      if (target !== end)
        host.options()?.onIntent({ type: 'resize-track-region', trackId, endTick: target })
    })
    layer.append(button)
    return button
  }

  const cancel = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !drag) return
    event.preventDefault()
    finish(false)
  }
  window.addEventListener('keydown', cancel)

  return {
    isDragging: () => drag !== null,
    /**
     * @description: 与 Canvas 共用本帧几何定位可见区域的右侧句柄。
     * @param {RenderFrame} frame 同一帧的行布局和时间轴
     * @return 无返回值。
     */
    render(frame: RenderFrame): void {
      const active = new Set<string>()
      if (host.options()?.enabled) {
        for (const row of frame.rows) {
          active.add(row.track.id)
          let button = handles.get(row.track.id)
          if (!button) {
            button = makeHandle(row.track.id)
            handles.set(row.track.id, button)
          }
          const range = getTrackTimeRange(row.track, frame.index, frame.timeline.durationTicks)
          const end = drag?.trackId === row.track.id ? drag.endTick : range.endTick
          const right = frame.timeline.tickToSeconds(end) * frame.timeZoom - frame.scrollLeft
          const minimum = Math.max(
            (row.track.startTick ?? 0) + 1,
            frame.index.getTimeRange(row.track.id)?.endTick ?? 0
          )
          button.dataset.endTick = String(end)
          button.dataset.minimum = String(minimum)
          button.setAttribute('aria-label', `${host.label()}: ${row.track.name}`)
          button.setAttribute('aria-valuemin', String(minimum))
          button.setAttribute('aria-valuenow', String(end))
          button.style.setProperty(
            '--pr-region-color',
            row.track.color ?? 'var(--pr-primary,#e36f86)'
          )
          button.style.left = `${Math.max(0, right - 12)}px`
          button.style.top = `${row.top - frame.scrollTop + 3}px`
          button.style.height = `${Math.max(12, row.height - 9)}px`
          button.hidden = right < 0 || right > frame.width + 1
        }
      }
      for (const [id, button] of handles) {
        // 捕获期间保留 DOM，即使临时滚出视口也不丢失松手事件。
        if (!active.has(id) && drag?.button !== button) {
          button.remove()
          handles.delete(id)
        }
      }
    },
    reset: () => finish(false),
    destroy(): void {
      finish(false)
      window.removeEventListener('keydown', cancel)
      layer.remove()
      handles.clear()
    },
  }
}
