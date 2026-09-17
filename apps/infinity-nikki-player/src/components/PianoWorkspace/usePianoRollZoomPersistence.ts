import { nextTick, ref, watch, type Ref } from 'vue'
import type { PianoRollViewport } from '@strawberrybear/piano-roll/browser'

/**
 * 钢琴卷帘的视图缩放偏好。按 MIDI 文件名隔离，避免不同曲目的时长或音域互相影响。
 * 这里只保存 UI 视图状态，不写入播放器、预览音频或游戏内按键模拟配置。
 */
export interface PianoRollZoomPreferences {
  overviewTimeZoom?: number
  editorTimeZoom?: number
  editorPitchZoom?: number
}

const STORAGE_PREFIX = 'infinity-nikki-player:piano-roll-zoom:v1:'

function storageKey(filename: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(filename)}`
}

function readPreferenceValue(value: unknown, min: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : undefined
}

/** 读取单曲的卷帘缩放偏好；localStorage 不可用或内容损坏时安全回退到默认值。 */
export function readPianoRollZoomPreferences(filename: string): PianoRollZoomPreferences {
  if (!filename || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey(filename))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const value = parsed as Record<string, unknown>
    return {
      overviewTimeZoom: readPreferenceValue(value.overviewTimeZoom, 0.001),
      editorTimeZoom: readPreferenceValue(value.editorTimeZoom, 0.001),
      editorPitchZoom: readPreferenceValue(value.editorPitchZoom, 8),
    }
  } catch {
    return {}
  }
}

/** 写入单曲的卷帘缩放偏好；存储配额或隐私模式限制不应影响播放器。 */
export function writePianoRollZoomPreferences(
  filename: string,
  preferences: PianoRollZoomPreferences
): void {
  if (!filename || typeof window === 'undefined') return
  try {
    const next = Object.fromEntries(
      Object.entries(preferences).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value)
      )
    )
    const key = storageKey(filename)
    if (Object.keys(next).length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // 缩放偏好是可选体验，localStorage 失败时继续使用当前会话状态。
  }
}

/**
 * 提供总览和详情两个独立实例使用的缩放状态，并在用户操作后保存。
 * filename 变化时只恢复对应歌曲的值，不会重置其它播放器状态。
 */
export function usePianoRollZoomPersistence(filename: Readonly<Ref<string>>) {
  const overviewTimeZoom = ref<number | undefined>()
  const editorTimeZoom = ref<number | undefined>()
  const editorPitchZoom = ref<number | undefined>()
  let restoring = false

  function load(nextFilename: string): void {
    restoring = true
    const saved = readPianoRollZoomPreferences(nextFilename)
    overviewTimeZoom.value = saved.overviewTimeZoom
    editorTimeZoom.value = saved.editorTimeZoom
    editorPitchZoom.value = saved.editorPitchZoom
    // 路由切换时控制器可能在同一轮同步回传旧视口，等绑定新 props 后再允许保存。
    void nextTick(() => {
      restoring = false
    })
  }

  function persist(): void {
    if (restoring) return
    writePianoRollZoomPreferences(filename.value, {
      overviewTimeZoom: overviewTimeZoom.value,
      editorTimeZoom: editorTimeZoom.value,
      editorPitchZoom: editorPitchZoom.value,
    })
  }

  function persistOverview(viewport: Readonly<PianoRollViewport>): void {
    // viewport-change 也会在滚动时触发；缩放没有变化时无需写入存储。
    if (overviewTimeZoom.value === viewport.timeZoom) return
    overviewTimeZoom.value = viewport.timeZoom
    persist()
  }

  function persistEditor(viewport: Readonly<PianoRollViewport>): void {
    if (editorTimeZoom.value === viewport.timeZoom && editorPitchZoom.value === viewport.pitchZoom)
      return
    editorTimeZoom.value = viewport.timeZoom
    editorPitchZoom.value = viewport.pitchZoom
    persist()
  }

  watch(filename, load, { immediate: true })

  return {
    overviewTimeZoom,
    editorTimeZoom,
    editorPitchZoom,
    persistOverview,
    persistEditor,
  }
}
