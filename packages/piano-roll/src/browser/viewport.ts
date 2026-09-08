/** 将有限数限制到范围内，非法值使用 fallback。 */
export function clamp(value: number, min: number, max: number, fallback = min): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback))
}

/** 缩放前后保持视口锚点对应同一原曲时间。 */
export function zoomScrollLeft(
  scrollLeft: number,
  oldZoom: number,
  newZoom: number,
  anchorX: number
): number {
  return Math.max(0, ((scrollLeft + anchorX) / oldZoom) * newZoom - anchorX)
}

/**
 * 以时间区域实际 clientWidth 计算统一缩放边界，不包含琴键、轨道栏或滚动条。
 * 极短曲允许上限提高至整曲比例；空曲和首次隐藏布局使用有限默认值。
 */
export function timeZoomBounds(
  width: number,
  durationSeconds: number
): { minTimeZoom: number; maxTimeZoom: number } {
  const fit = width > 0 && durationSeconds > 0 ? width / durationSeconds : 0.001
  const minTimeZoom = Number.isFinite(fit) && fit > 0 ? fit : 0.001
  return { minTimeZoom, maxTimeZoom: Math.max(1200, minTimeZoom) }
}

/** 容器宽度改变时保留中心对应的原曲时间；边界由原生滚动容器裁剪。 */
export function resizeScrollLeft(
  scrollLeft: number,
  oldZoom: number,
  newZoom: number,
  oldWidth: number,
  newWidth: number
): number {
  if (oldWidth <= 0) return 0
  return Math.max(0, ((scrollLeft + oldWidth / 2) / oldZoom) * newZoom - newWidth / 2)
}

/**
 * 合并 ResizeObserver 的连续通知，同时限制等待上限，避免持续拖动容器时画面一直不更新。
 * cancel 必须随视图销毁调用，防止延迟任务读取已移除的 DOM。
 */
export function createResizeScheduler(
  callback: () => void,
  delayMs = 60,
  maxWaitMs = 180
): { schedule: () => void; cancel: () => void } {
  let trailing: ReturnType<typeof setTimeout> | undefined
  let maximum: ReturnType<typeof setTimeout> | undefined
  function cancel(): void {
    clearTimeout(trailing)
    clearTimeout(maximum)
    trailing = undefined
    maximum = undefined
  }
  function flush(): void {
    cancel()
    callback()
  }
  return {
    schedule() {
      clearTimeout(trailing)
      trailing = setTimeout(flush, delayMs)
      maximum ??= setTimeout(flush, maxWaitMs)
    },
    cancel,
  }
}

/**
 * 计算 Follow 的目标横向滚动位置。
 *
 * 播放头从曲首进入视口中心后，视口跟随内容而移动，播放头保持在中心；
 * 接近曲尾时固定滚动到最右侧，让播放头自然从中心走到终点。`contentWidth`
 * 缺省时保留旧的安全区行为，便于无 DOM 的调用方使用。
 */
export function followScrollLeft(
  x: number,
  scrollLeft: number,
  width: number,
  contentWidth = Number.POSITIVE_INFINITY
): number | null {
  if (width <= 0 || !Number.isFinite(x) || !Number.isFinite(scrollLeft)) return null
  if (!Number.isFinite(contentWidth)) {
    return x < scrollLeft + 8 || x > scrollLeft + width * 0.8 ? Math.max(0, x - width * 0.25) : null
  }
  const maxScroll = Math.max(0, contentWidth - width)
  const target = Math.min(maxScroll, Math.max(0, x - width / 2))
  return Math.abs(target - scrollLeft) < 1 ? null : target
}

/** 手柄在边缘 36px 内拖动时的平移速度（CSS px/s）。 */
export function dragScrollVelocity(x: number, width: number): number {
  const edge = Math.min(36, width / 3)
  if (edge <= 0) return 0
  if (x < edge) return -clamp((edge - x) / edge, 0, 3) * 360
  if (x > width - edge) return clamp((x - width + edge) / edge, 0, 3) * 360
  return 0
}
