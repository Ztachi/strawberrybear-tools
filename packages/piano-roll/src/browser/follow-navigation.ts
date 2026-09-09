/** 候选横向浏览的净位移达到视口四分之一后才关闭 Follow，避免纵向手势尾部误触。 */
const PAN_VIEWPORT_RATIO = 0.25
/** 滚轮停止后结束未确认的浏览；原生滚动条按住期间不使用该计时器。 */
const WHEEL_IDLE_MS = 200

/** 输入导航只请求坐标变化和 Follow 状态变化，不拥有播放器或视图渲染状态。 */
interface FollowNavigationOptions {
  /** 实际滚动容器，同时承接键盘和原生水平滚动条输入。 */
  viewport: HTMLElement
  /** 左侧轨道或琴键区域；纵向滚轮转交实际滚动容器。 */
  gutter: HTMLElement
  /** 外部权威 Follow 开关。 */
  isFollowing: () => boolean
  /** 同步写入真实滚动坐标；调用方应使用 instant，不能异步平滑滚动。 */
  onScroll: (left: number, top: number) => void
  /** 已确认横向浏览时关闭 Follow。 */
  onSuspend: () => void
  /** 未确认的浏览结束后重新跟随当前位置。 */
  onCatch: () => void
}

/** 每个视图独享的输入导航生命周期。 */
interface FollowNavigation {
  /** 是否暂缓自动平移，等待横向浏览意图确认。 */
  isBrowsing(): boolean
  /** 清空候选、计时器与采样任务；不回调 onCatch，便于外部安全重置。 */
  cancel(): void
  /** 移除监听与所有未完成任务。 */
  destroy(): void
}

/** 一个来源已知的横向浏览手势；起点固定，不累计自动滚动或往返路程。 */
interface Pan {
  source: 'wheel' | 'scrollbar'
  originLeft: number
  currentLeft: number
  width: number
  maxLeft: number
}

/**
 * @description 安装显式输入导航；普通 scroll 通知没有关闭 Follow 的权限。
 * @param options 当前视图元素与同步状态回调。
 * @return 供视图在 seek、缩放、文档变化及销毁时清理的导航控制器。
 */
export function installFollowNavigation(options: FollowNavigationOptions): FollowNavigation {
  const { viewport, gutter } = options
  const window = viewport.ownerDocument.defaultView
  if (!window) throw new Error('钢琴卷帘导航需要有效的浏览器文档')
  let pan: Pan | undefined
  let idle: number | undefined
  let frame: number | undefined
  let destroyed = false

  /** 清理先于外部回调，避免 onCatch / onSuspend 再次进入导航时读到旧候选。 */
  function cancel(): void {
    window!.clearTimeout(idle)
    if (frame !== undefined) window!.cancelAnimationFrame(frame)
    idle = undefined
    frame = undefined
    pan = undefined
  }

  /** 仅未确认的候选结束后恢复平移；显式 cancel 本身不触发外部状态。 */
  function finish(): void {
    const wasBrowsing = pan !== undefined
    cancel()
    if (wasBrowsing && options.isFollowing()) options.onCatch()
  }

  /**
   * 只验证候选的布局与开关，不能用未归因的 DOM 坐标确认用户浏览。
   * @return 仍然有效的候选；布局或开关变化后返回 undefined。
   */
  function validatePanGeometry(): Pan | undefined {
    if (!pan) return undefined
    const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    if (pan.width !== viewport.clientWidth || pan.maxLeft !== maxLeft || !options.isFollowing()) {
      finish()
      return undefined
    }
    return pan
  }

  /**
   * 只在自己的滚轮写入后或已按住原生滚动条时读取实际位移。
   * @return 是否仍有待确认的候选。
   */
  function sample(): boolean {
    const current = validatePanGeometry()
    if (!current) return false
    current.currentLeft = Math.min(current.maxLeft, Math.max(0, viewport.scrollLeft))
    if (Math.abs(current.currentLeft - current.originLeft) >= current.width * PAN_VIEWPORT_RATIO) {
      cancel()
      options.onSuspend()
      return false
    }
    return true
  }

  /**
   * 捕获固定起点；不会用后续 transport 或程序平移修改起点。
   * @param source 正在处理的显式输入来源。
   * @return 无返回值。
   */
  function begin(source: Pan['source']): void {
    cancel()
    const width = viewport.clientWidth
    const maxLeft = Math.max(0, viewport.scrollWidth - width)
    if (!options.isFollowing() || width <= 0 || maxLeft <= 0) return
    const left = Math.min(maxLeft, Math.max(0, viewport.scrollLeft))
    pan = { source, originLeft: left, currentLeft: left, width, maxLeft }
  }

  /**
   * 横向滚轮由这里同步写入，纵向滚轮不获得关闭 Follow 的权限。
   * @param event 浏览器滚轮事件。
   * @return 无返回值。
   */
  function onWheel(event: WheelEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return
    const lineScale = event.deltaMode === 1 ? 16 : 1
    const dx = event.deltaX * (event.deltaMode === 2 ? viewport.clientWidth : lineScale)
    const dy = event.deltaY * (event.deltaMode === 2 ? viewport.clientHeight : lineScale)
    if (dx === 0 && dy === 0) return
    const horizontal = event.shiftKey || Math.abs(dx) > Math.abs(dy)
    if (!horizontal) {
      finish()
      // 含横向噪声的纵向事件由我们只写 Y；纯纵向事件保留浏览器原生滚动。
      if (event.currentTarget === gutter || dx !== 0) {
        event.preventDefault()
        options.onScroll(viewport.scrollLeft, viewport.scrollTop + dy)
      }
      return
    }

    event.preventDefault()
    const distance = event.shiftKey && dx === 0 ? dy : dx
    if (pan?.source !== 'wheel') begin('wheel')
    else if (!validatePanGeometry()) begin('wheel')
    const left = pan?.currentLeft ?? viewport.scrollLeft
    options.onScroll(left + distance, viewport.scrollTop)
    if (!sample()) return
    window!.clearTimeout(idle)
    idle = window!.setTimeout(finish, WHEEL_IDLE_MS)
  }

  /**
   * 左右方向键代表明确横向导航，实际移动后即可关闭 Follow；上下键保留原生行为。
   * @param event 滚动容器上的键盘事件。
   * @return 无返回值。
   */
  function onKeyDown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.target !== viewport ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      finish()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const wasBrowsing = pan !== undefined
    cancel()
    const before = viewport.scrollLeft
    options.onScroll(before + (event.key === 'ArrowLeft' ? -40 : 40), viewport.scrollTop)
    if (viewport.scrollLeft !== before && options.isFollowing()) options.onSuspend()
    else if (wasBrowsing && options.isFollowing()) options.onCatch()
  }

  /** 原生滚动条只在确实按下后采样，普通滚动和自动跟随不会启动该循环。 */
  function sampleScrollbar(): void {
    frame = undefined
    if (destroyed || pan?.source !== 'scrollbar' || !sample()) return
    frame = window!.requestAnimationFrame(sampleScrollbar)
  }

  /**
   * 识别原生水平滚动条入口，不夺取浏览器默认拖动或 pointer capture。
   * @param event 实际滚动容器上的指针按下事件。
   * @return 无返回值。
   */
  function onPointerDown(event: PointerEvent): void {
    if (
      event.defaultPrevented ||
      event.target !== viewport ||
      event.button !== 0 ||
      event.pointerType === 'touch'
    )
      return
    if (viewport.scrollWidth <= viewport.clientWidth) return
    const rect = viewport.getBoundingClientRect()
    const x = event.clientX - rect.left - viewport.clientLeft
    const y = event.clientY - rect.top - viewport.clientTop
    const nativeHeight = viewport.offsetHeight - viewport.clientHeight - viewport.clientTop * 2
    const configuredHeight = Number.parseFloat(
      window!.getComputedStyle(viewport, '::-webkit-scrollbar').height
    )
    const strip =
      nativeHeight > 0
        ? nativeHeight
        : Number.isFinite(configuredHeight) && configuredHeight > 0
          ? configuredHeight
          : 12
    const hasVertical = viewport.scrollHeight > viewport.clientHeight
    const corner = hasVertical && viewport.offsetWidth === viewport.clientWidth ? strip : 0
    // overlay scrollbar 不占 clientHeight，使用其可见底部带；右下角留给纵向滚动条。
    const bottom = nativeHeight > 0 ? viewport.clientHeight + nativeHeight : viewport.clientHeight
    if (x < 0 || x >= viewport.clientWidth - corner || y < bottom - strip || y > bottom) return
    begin('scrollbar')
    if (pan) frame = window!.requestAnimationFrame(sampleScrollbar)
  }

  /**
   * 窗口级释放确认原生滚动条的最终位置；取消和失焦直接结束候选，不授权关闭 Follow。
   * @param event 窗口的释放、取消或失焦通知。
   * @return 无返回值。
   */
  function onPointerEnd(event: Event): void {
    if (event.type === 'blur' || event.type === 'pointercancel') {
      finish()
      return
    }
    if (pan?.source !== 'scrollbar') return
    if (sample()) finish()
  }

  viewport.addEventListener('wheel', onWheel, { passive: false })
  gutter.addEventListener('wheel', onWheel, { passive: false })
  viewport.addEventListener('keydown', onKeyDown)
  viewport.addEventListener('pointerdown', onPointerDown)
  for (const name of ['pointerup', 'mouseup', 'pointercancel', 'blur']) {
    window.addEventListener(name, onPointerEnd)
  }

  return {
    isBrowsing: () => pan !== undefined,
    cancel,
    destroy() {
      destroyed = true
      cancel()
      viewport.removeEventListener('wheel', onWheel)
      gutter.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('keydown', onKeyDown)
      viewport.removeEventListener('pointerdown', onPointerDown)
      for (const name of ['pointerup', 'mouseup', 'pointercancel', 'blur']) {
        window!.removeEventListener(name, onPointerEnd)
      }
    },
  }
}
