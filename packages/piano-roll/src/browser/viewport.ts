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

/** 播放头离开安全范围后移到视口 25% 处；返回 null 表示无需移动。 */
export function followScrollLeft(x: number, scrollLeft: number, width: number): number | null {
  if (width <= 0) return null
  return x < scrollLeft + 8 || x > scrollLeft + width * 0.8 ? Math.max(0, x - width * 0.25) : null
}

/** 手柄在边缘 36px 内拖动时的平移速度（CSS px/s）。 */
export function dragScrollVelocity(x: number, width: number): number {
  const edge = Math.min(36, width / 3)
  if (edge <= 0) return 0
  if (x < edge) return -clamp((edge - x) / edge, 0, 3) * 360
  if (x > width - edge) return clamp((x - width + edge) / edge, 0, 3) * 360
  return 0
}
