import type { PianoRollView, PianoRollViewport } from '@strawberrybear/piano-roll/browser'

/** 窗口快照只恢复导航；过期 IPC 中的缩放不得覆盖最新全局配置。 */
export function restorePianoRollNavigation(
  view: PianoRollView | null | undefined,
  saved: PianoRollViewport | undefined,
  preferences: { timeZoom?: number; pitchZoom?: number }
): void {
  if (!view) return
  if (saved) {
    const current = view.getViewport()
    view.restoreViewport({
      ...saved,
      timeZoom: preferences.timeZoom ?? current.timeZoom,
      pitchZoom: preferences.pitchZoom ?? current.pitchZoom,
    })
  } else {
    // 首次挂载也显式应用保存值，避免控制器的初始缩放范围截断用户选择。
    if (preferences.timeZoom !== undefined) view.setTimeZoom(preferences.timeZoom)
    if (preferences.pitchZoom !== undefined) view.setPitchZoom(preferences.pitchZoom)
  }
}
