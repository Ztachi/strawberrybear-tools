/** 后台无需逐帧更新界面，但仍需检测曲终以维持自动下一曲。 */
const BACKGROUND_SAMPLE_INTERVAL_MS = 250

/**
 * @description 按显示帧提供预览进度采样机会；音乐时间始终由调用方读取 AudioContext。
 * 可见页面避免独立定时器与绘制帧错拍，隐藏页面使用低频计时器继续检测曲终。
 * @param sample 读取并发布一次权威音频位置；允许在回调内停止本次采样。
 * @return 取消所有待执行回调及可见性监听的清理函数。
 */
export function startPreviewProgress(sample: () => void): () => void {
  let active = true
  let generation = 0
  let frame: number | undefined
  let timer: number | undefined

  function cancelScheduled(): void {
    // 已进入事件队列的旧回调也必须失效，防止切歌或切换可见性后重建旧循环。
    generation += 1
    if (frame !== undefined) window.cancelAnimationFrame(frame)
    if (timer !== undefined) window.clearTimeout(timer)
    frame = undefined
    timer = undefined
  }

  function schedule(): void {
    const request = generation
    const background = window.document.visibilityState === 'hidden'
    const tick = (): void => {
      if (!active || request !== generation) return
      frame = undefined
      timer = undefined
      sample()
      // sample 内可能触发曲终、暂停或切歌；旧循环不能在清理之后继续排队。
      if (active && request === generation) schedule()
    }
    if (background) timer = window.setTimeout(tick, BACKGROUND_SAMPLE_INTERVAL_MS)
    else frame = window.requestAnimationFrame(tick)
  }

  function onVisibilityChange(): void {
    if (!active) return
    cancelScheduled()
    schedule()
  }

  window.document.addEventListener('visibilitychange', onVisibilityChange)
  schedule()
  return (): void => {
    active = false
    cancelScheduled()
    window.document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
