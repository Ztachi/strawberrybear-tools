import type { ComponentOptionsMixin, DefineComponent } from 'vue'
import type { PianoRollProps } from './vue-props'
import type { PianoRollViewport } from './browser/types'
export type { PianoRollProps } from './vue-props'

/** Vue 事件使用标准轨道 ID 和原曲秒，预览事件不代表音频定位提交。 */
export type PianoRollEmits = {
  'select-track': (trackId: string) => void
  'open-editor': (trackId: string) => void
  'toggle-track': (trackId: string) => void
  'seek-preview': (seconds: number | null) => void
  seek: (seconds: number) => void
  'follow-change': (enabled: boolean) => void
  'viewport-change': (viewport: Readonly<PianoRollViewport>) => void
}

declare const PianoRoll: DefineComponent<
  PianoRollProps,
  object,
  object,
  object,
  object,
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  PianoRollEmits
>
export default PianoRoll
