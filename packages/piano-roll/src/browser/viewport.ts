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

/** 同一帧中内容和播放头的横向投影，均使用 CSS 像素。 */
export interface PlaybackViewportProjection {
  /** 网格、音符、标尺共同减去的内容偏移，保留亚像素精度。 */
  scrollLeft: number
  /** 播放头在当前视口中的位置；手动模式下允许落在视口外。 */
  playheadX: number
}

/**
 * @description 自动模式直接确定三段播放画面，手动模式保留用户视口，不反推或吸附播放头。
 * @param x 播放时间对应的完整内容坐标。
 * @param width 实际时间视口宽度。
 * @param contentWidth 完整曲目的逻辑宽度，不使用原生滚动条取整后的 scrollWidth。
 * @param scrollLeft 手动模式的实际浏览位置；自动模式不依赖此值。
 * @param follow 是否由自动播放控制横向视口。
 * @return 本帧内容与播放头共同使用的投影。
 */
export function projectPlaybackViewport(
  x: number,
  width: number,
  contentWidth: number,
  scrollLeft: number,
  follow: boolean
): PlaybackViewportProjection {
  if (!follow) return { scrollLeft, playheadX: x - scrollLeft }
  const middle = width / 2
  const maximum = Math.max(0, contentWidth - width)
  // 全曲已在一屏内时没有居中平移阶段；开头和曲尾都保持内容边界固定。
  if (maximum === 0 || x <= middle) return { scrollLeft: 0, playheadX: x }
  if (x >= maximum + middle) return { scrollLeft: maximum, playheadX: x - maximum }
  // 居中阶段的指针是常量。内容自行平移，不再用会取整、延迟更新的 DOM 偏移反算指针。
  return { scrollLeft: x - middle, playheadX: middle }
}

/** 手柄在边缘 36px 内拖动时的平移速度（CSS px/s）。 */
export function dragScrollVelocity(x: number, width: number): number {
  const edge = Math.min(36, width / 3)
  if (edge <= 0) return 0
  if (x < edge) return -clamp((edge - x) / edge, 0, 3) * 360
  if (x > width - edge) return clamp((x - width + edge) / edge, 0, 3) * 360
  return 0
}
