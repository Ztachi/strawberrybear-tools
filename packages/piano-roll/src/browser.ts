import { createView } from './browser/controller'
import type { PianoRollView, PianoRollViewOptions } from './browser/types'

export * from './browser/types'
export { sliderToTimeZoom, timeZoomToSlider } from './browser/zoom-scale'
export {
  applyPianoRollTheme,
  defaultPianoRollTheme,
  pianoRollThemeVariables,
  resolvePianoRollTheme,
} from './browser/theme'
export type {
  PianoRollTheme,
  PianoRollThemeColors,
  PianoRollThemeInput,
  PianoRollThemeMetrics,
} from './browser/theme'

/** 创建只读多轨总览；container 的 CSS 高度决定可见视口，内容可双向滚动。 */
export function createTracksOverview(options: PianoRollViewOptions): PianoRollView {
  return createView('overview', options)
}

/** 创建只读单轨钢琴卷帘；名字为后续编辑能力保留，本版不修改任何音符。 */
export function createPianoRollEditor(options: PianoRollViewOptions): PianoRollView {
  return createView('editor', options)
}
