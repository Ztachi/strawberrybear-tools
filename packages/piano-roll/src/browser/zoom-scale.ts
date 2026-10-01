import { clamp } from './viewport'

/**
 * 将真实 px/s 映射到倍率均匀的滑块位置。同一倍数变化占相同长度，低倍区域不会挤在左端。
 * @param zoom 控制器的实际缩放值。
 * @param min 一屏全曲对应的实际下限。
 * @param max 实际上限。
 * @return 0–100，端点分别严格对应 min/max；不是另一份缩放状态。
 */
export function timeZoomToSlider(zoom: number, min: number, max: number): number {
  if (!(min > 0 && max > min)) return 0
  return (100 * Math.log(clamp(zoom, min, max) / min)) / Math.log(max / min)
}

/**
 * 将滑块位置还原为控制器的唯一 px/s 值。
 * @param value 0–100 的滑块位置。
 * @param min 一屏全曲对应的实际下限。
 * @param max 实际上限。
 * @return 受相同边界限制的真实缩放值，0/100 不经过浮点指数运算。
 */
export function sliderToTimeZoom(value: number, min: number, max: number): number {
  const position = clamp(value, 0, 100)
  if (position === 0 || max <= min) return min
  if (position === 100) return max
  return min * Math.exp((position / 100) * Math.log(max / min))
}
