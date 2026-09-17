/** 后台或可见但被遮挡的窗口仍需读取音频位置、检测曲终。 */
const BACKGROUND_SAMPLE_INTERVAL_MS = 250

/**
 * @description 按显示帧提供预览进度采样机会；音乐时间始终由调用方读取 AudioContext。
 * 可见页面优先使用 RAF；250ms 内无帧则低频兜底，不能仅依赖 visibilityState 判断遮挡。
 * RAF 与兜底计时器竞争同一个采样机会，正常绘制时不会重复发布。
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
      // 两者只允许一个胜出；使迟到的 RAF／计时器失效，避免恢复前台时重建第二个循环。
      cancelScheduled()
      const sampledGeneration = generation
      sample()
      // sample 内可能触发曲终、暂停或切歌；旧循环不能在清理之后继续排队。
      if (active && sampledGeneration === generation) schedule()
    }
    if (!background) frame = window.requestAnimationFrame(tick)
    timer = window.setTimeout(tick, BACKGROUND_SAMPLE_INTERVAL_MS)
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
