import { TIME_ZOOM_CONFIG } from './zoom-config'

/** WebKit 手势事件没有被所有 TypeScript DOM 库声明，使用最小兼容形状避免依赖平台类型。 */
interface WebKitGestureEvent extends Event {
  scale?: number
  clientX?: number
}

export interface GestureZoomOptions {
  /** 手势开始时读取控制器当前缩放，保证中途 pinch 重新建基准。 */
  getZoom: () => number
  /** 时间视口元素；根节点通常还包含左侧轨道栏，锚点必须相对该元素。 */
  viewportElement?: HTMLElement
  /** 相邻采样倍率作用于实际缩放，交由控制器统一 clamp。 */
  onZoom: (scale: number, anchorX: number) => void
  /** 手势是否处于活动状态，用于屏蔽同一手势派发的 Ctrl+wheel。 */
  onActiveChange?: (active: boolean) => void
}

/**
 * 在指定根节点内接入 Safari/WKWebView 的 gesturestart/change/end。
 * preventDefault 只作用于根节点事件，绝不会禁用宿主页面其它区域的缩放。
 */
export function installGestureZoom(
  root: HTMLElement,
  options: GestureZoomOptions
): { isActive: () => boolean; destroy: () => void } {
  let active = false
  let previousScale = 1
  let anchorX = 0

  const start = (event: Event): void => {
    const gesture = event as WebKitGestureEvent
    event.preventDefault()
    const scale = Number.isFinite(gesture.scale) && gesture.scale! > 0 ? gesture.scale! : 1
    const rect = (options.viewportElement ?? root).getBoundingClientRect()
    anchorX = Number.isFinite(gesture.clientX) ? gesture.clientX! - rect.left : rect.width / 2
    previousScale = scale
    active = true
    options.onActiveChange?.(true)
  }
  const change = (event: Event): void => {
    if (!active) return
    event.preventDefault()
    const scale = Number((event as WebKitGestureEvent).scale)
    if (!Number.isFinite(scale) || scale <= 0) return
    // 每一步从控制器已裁剪的真实值继续。越过上下限后的反向手势立即响应，
    // 不必先抵消一个藏在边界外的虚拟缩放量；容器中途 resize 也使用新边界。
    const currentZoom = options.getZoom()
    options.onZoom(currentZoom * (scale / previousScale) ** TIME_ZOOM_CONFIG.gestureExponent, anchorX)
    previousScale = scale
  }
  const end = (event: Event): void => {
    if (!active) return
    event.preventDefault()
    active = false
    options.onActiveChange?.(false)
  }
  const cancelOnBlur = (): void => {
    if (!active) return
    active = false
    options.onActiveChange?.(false)
  }
  root.addEventListener('gesturestart', start, { passive: false })
  root.addEventListener('gesturechange', change, { passive: false })
  root.addEventListener('gestureend', end, { passive: false })
  root.addEventListener('gesturecancel', end, { passive: false })
  root.ownerDocument.defaultView?.addEventListener('blur', cancelOnBlur)
  return {
    isActive: () => active,
    destroy() {
      root.removeEventListener('gesturestart', start)
      root.removeEventListener('gesturechange', change)
      root.removeEventListener('gestureend', end)
      root.removeEventListener('gesturecancel', end)
      root.ownerDocument.defaultView?.removeEventListener('blur', cancelOnBlur)
      if (active) options.onActiveChange?.(false)
      active = false
    },
  }
}
