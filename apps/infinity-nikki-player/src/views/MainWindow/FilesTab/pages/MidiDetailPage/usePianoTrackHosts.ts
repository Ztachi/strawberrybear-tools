import { shallowReactive } from 'vue'
import type {
  PianoRollTrackLabelContext,
  PianoRollTrackToggleContext,
} from '@strawberrybear/piano-roll/browser'

/** 控制器管理 DOM，Vue 继续管理组件树；Teleport 只移动展示位置。 */
export interface PianoTrackHost<Context> {
  id: number
  container: HTMLElement
  context: Context
}

/** 为虚拟音轨行登记 Vue 挂载点，不创建脱离 ConfigProvider 的独立渲染根。 */
export function usePianoTrackHosts() {
  const labels = shallowReactive(new Map<HTMLElement, PianoTrackHost<PianoRollTrackLabelContext>>())
  const toggles = shallowReactive(
    new Map<HTMLElement, PianoTrackHost<PianoRollTrackToggleContext>>()
  )
  const hostIds = new WeakMap<HTMLElement, number>()
  let nextHostId = 0

  function register<Context>(
    hosts: Map<HTMLElement, PianoTrackHost<Context>>,
    container: HTMLElement,
    context: Context
  ): () => void {
    let id = hostIds.get(container)
    if (id === undefined) {
      id = nextHostId++
      hostIds.set(container, id)
    }
    const entry = { id, container, context }
    hosts.set(container, entry)
    return () => {
      // 旧行的异步清理不能移除同一 DOM 上更新后的控件。
      if (hosts.get(container) === entry) hosts.delete(container)
    }
  }

  return {
    labels,
    toggles,
    renderLabel: (container: HTMLElement, context: PianoRollTrackLabelContext): (() => void) =>
      register(labels, container, context),
    renderToggle: (container: HTMLElement, context: PianoRollTrackToggleContext): (() => void) =>
      register(toggles, container, context),
  }
}
