import type { PianoRollDocument } from './core'
import type {
  PianoRollLabels,
  PianoRollPlugin,
  PianoRollTrackToggleContext,
  PianoRollTransport,
} from './browser/types'
import type { PianoRollThemeInput } from './browser/theme'

/** Vue 适配层公共输入；时间单位一律为原曲秒。 */
export interface PianoRollProps {
  /** 不可变标准 MIDI 文档，由 app 完成原始 DTO 适配。 */
  document: PianoRollDocument
  /** 权威源播放时钟。组件不拥有音频播放。 */
  transport: PianoRollTransport
  /** 独立总览或详情实例；浮层组合属于宿主。 */
  variant?: 'overview' | 'editor'
  /** 选中的标准轨道 ID。 */
  selectedTrackId?: string | null
  /** 每原曲秒像素数，可选受控初值。 */
  timeZoom?: number
  /** 每 MIDI 半音像素高度。 */
  pitchZoom?: number
  /** 文案本地化，默认中文。 */
  labels?: Partial<PianoRollLabels>
  /** 语义主题 token 的局部覆盖；默认浅粉色，更新时保留视口和实例。 */
  theme?: PianoRollThemeInput
  /** 实例生命周期插件，在 mount 时安装。 */
  plugins?: readonly PianoRollPlugin[]
  /** 是否显示公共包的原生工具栏控件；宿主可关闭后通过 toolbar 插槽接入自己的 UI 组件。 */
  showToolbarControls?: boolean
  /** 宿主使用自己的 UI 组件渲染音轨启用开关。 */
  renderTrackToggle?: (
    container: HTMLElement,
    context: PianoRollTrackToggleContext
  ) => void | (() => void)
}
