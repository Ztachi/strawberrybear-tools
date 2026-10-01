import { shallowReactive } from 'vue'
import type {
  PianoRollTrackActionsContext,
  PianoRollTrackLabelContext,
  PianoRollTrackToggleContext,
} from '@strawberrybear/piano-roll/browser'

/** 控制器管理 DOM，Vue 继续管理组件树；Teleport 只移动展示位置。 */
export interface PianoTrackHost<Context> {
  id: number
  container: HTMLElement
  context: Context
}

/** 挂载点登记表：响应式 Map + 与卷帘 `render*` 钩子同签名的登记函数。 */
export interface PianoHostRegistry<Context> {
  hosts: Map<HTMLElement, PianoTrackHost<Context>>
  render: (container: HTMLElement, context: Context) => () => void
}

let nextHostId = 0
const hostIds = new WeakMap<HTMLElement, number>()

/**
 * @description: 创建一类挂载点的登记表；同一容器复用稳定 id，避免 Teleport 重建。
 * @return {PianoHostRegistry<Context>} 登记表
 */
export function createPianoHostRegistry<Context>(): PianoHostRegistry<Context> {
  const hosts = shallowReactive(new Map<HTMLElement, PianoTrackHost<Context>>())
  return {
    hosts,
    render(container, context) {
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
    },
  }
}

/** 为虚拟音轨行登记 Vue 挂载点，不创建脱离 ConfigProvider 的独立渲染根。 */
export function usePianoTrackHosts() {
  const labels = createPianoHostRegistry<PianoRollTrackLabelContext>()
  const toggles = createPianoHostRegistry<PianoRollTrackToggleContext>()
  return {
    labels: labels.hosts,
    toggles: toggles.hosts,
    renderLabel: labels.render,
    renderToggle: toggles.render,
  }
}

/** 轨道操作位登记表类型，供编辑器页面使用。 */
export type PianoTrackActionsRegistry = PianoHostRegistry<PianoRollTrackActionsContext>
