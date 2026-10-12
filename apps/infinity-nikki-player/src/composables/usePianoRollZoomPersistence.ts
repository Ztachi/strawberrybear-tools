import { computed, nextTick } from 'vue'
import type { PianoRollViewport } from '@strawberrybear/piano-roll/browser'
import { preferenceNumber, preferenceValues, useUiPreferences } from './useUiPreferences'

/**
 * 所有钢琴卷帘共用的缩放偏好；切换曲目、项目或音轨继续沿用用户选择。
 * 这里只保存 UI 视图状态，不写入播放器、预览音频或游戏内按键模拟配置。
 */
export interface PianoRollZoomPreferences {
  overviewTimeZoom?: number
  editorTimeZoom?: number
  editorPitchZoom?: number
}

const STORAGE_KEY = 'infinity-nikki-player:piano-roll-zoom:v2'

function normalizeZoom(value: unknown): PianoRollZoomPreferences {
  const saved = preferenceValues(value)
  return {
    overviewTimeZoom: preferenceNumber(saved.overviewTimeZoom, 0.001, Number.MAX_VALUE),
    editorTimeZoom: preferenceNumber(saved.editorTimeZoom, 0.001, Number.MAX_VALUE),
    editorPitchZoom: preferenceNumber(saved.editorPitchZoom, 8, 36),
  }
}

/** 读取全局卷帘缩放偏好；localStorage 不可用或内容损坏时安全回退到默认值。 */
export function readPianoRollZoomPreferences(): PianoRollZoomPreferences {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return normalizeZoom(JSON.parse(raw))
  } catch {
    return {}
  }
}

/** 写入全局卷帘缩放偏好；存储配额或隐私模式限制不应影响播放器。 */
export function writePianoRollZoomPreferences(preferences: PianoRollZoomPreferences): void {
  if (typeof window === 'undefined') return
  try {
    const next = Object.fromEntries(
      Object.entries(normalizeZoom(preferences)).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value)
      )
    )
    if (Object.keys(next).length === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 缩放偏好是可选体验，localStorage 失败时继续使用当前会话状态。
  }
}

/**
 * 提供总览和详情两个独立实例使用的缩放状态，并在用户操作后保存。
 * 使用固定偏好键，内容身份不会进入配置的存储逻辑。
 */
export function usePianoRollZoomPersistence() {
  const saved = useUiPreferences(STORAGE_KEY, normalizeZoom)
  const overviewTimeZoom = computed(() => saved.value.overviewTimeZoom)
  const editorTimeZoom = computed(() => saved.value.editorTimeZoom)
  const editorPitchZoom = computed(() => saved.value.editorPitchZoom)
  // 装配完成后再接受视口回报，避免初始默认值覆盖保存的选择。
  let restoring = true
  void nextTick(() => {
    restoring = false
  })

  function persistOverview(viewport: Readonly<PianoRollViewport>): void {
    // viewport-change 也会在滚动时触发；缩放没有变化时无需写入存储。
    if (restoring || overviewTimeZoom.value === viewport.timeZoom) return
    saved.value = { ...saved.value, overviewTimeZoom: viewport.timeZoom }
  }

  function persistEditor(viewport: Readonly<PianoRollViewport>): void {
    if (
      restoring ||
      (editorTimeZoom.value === viewport.timeZoom && editorPitchZoom.value === viewport.pitchZoom)
    )
      return
    saved.value = {
      ...saved.value,
      editorTimeZoom: viewport.timeZoom,
      editorPitchZoom: viewport.pitchZoom,
    }
  }

  return {
    overviewTimeZoom,
    editorTimeZoom,
    editorPitchZoom,
    persistOverview,
    persistEditor,
  }
}
