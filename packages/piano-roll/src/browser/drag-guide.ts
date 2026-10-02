import type { RenderFrame } from './renderer'

/** 与播放头区分的拖拽落点线；位置标签只出现在标尺内，不遮挡音符或接收指针。 */
export interface DragGuide {
  render(tick: number | null, frame: RenderFrame): void
  hide(): void
  destroy(): void
}

/**
 * @description: 为区域和音符手势创建共用的落点提示，使用同一时间轴处理变速、变拍及滚动。
 * @param {HTMLElement} pane 时间编辑区域
 * @param {HTMLElement} rulerGrid 标尺裁剪层
 * @param {string} gesture 手势来源，区分同一视图中的区域与音符落点
 * @return {DragGuide} 落点渲染及生命周期接口
 */
export function createDragGuide(
  pane: HTMLElement,
  rulerGrid: HTMLElement,
  gesture = 'notes'
): DragGuide {
  const owner = pane.ownerDocument
  const line = owner.createElement('div')
  line.className = 'pr-drag-guide'
  line.dataset.gesture = gesture
  const marker = owner.createElement('div')
  marker.className = 'pr-drag-marker'
  const position = owner.createElement('span')
  position.className = 'pr-drag-position'
  position.dataset.gesture = gesture
  marker.append(position)
  for (const node of [line, marker]) {
    node.setAttribute('aria-hidden', 'true')
    node.hidden = true
  }
  pane.append(line)
  rulerGrid.append(marker)
  const hide = () => {
    line.hidden = marker.hidden = true
  }
  return {
    /**
     * @description: 用实际提交 tick 绘制竖线和小节.拍.tick，标签在视口两端向内避让。
     * @param {number | null} tick 实际落点，null 表示无时间拖拽
     * @param {RenderFrame} frame 当前渲染几何
     * @return 无返回值。
     */
    render(tick, frame) {
      if (tick === null) {
        hide()
        return
      }
      const x = frame.timeline.tickToSeconds(tick) * frame.timeZoom - frame.scrollLeft
      if (x < 0 || x > frame.width) {
        hide()
        return
      }
      line.hidden = marker.hidden = false
      line.dataset.tick = String(tick)
      line.style.left = marker.style.left = `${x}px`
      // 标签宽度约 80px；靠边时仅移标签，不改变真正的对齐竖线。
      const inset = Math.min(40, frame.width / 2)
      position.style.left = `${Math.max(inset, Math.min(frame.width - inset, x)) - x}px`
      const location = frame.timeline.tickToBarPosition(tick)
      position.textContent = `${location.bar}.${location.beat}.${String(Math.round(location.tickInBeat)).padStart(3, '0')}`
    },
    hide,
    destroy() {
      line.remove()
      marker.remove()
    },
  }
}
