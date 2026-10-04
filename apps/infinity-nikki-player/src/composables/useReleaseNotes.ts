/** @fileOverview 自动日志弹窗与关于入口共享一个控制器；独立窗口不执行启动提示。 */
import { inject, type InjectionKey } from 'vue'
import {
  createReleaseNotesController,
  type ReleaseNotesController,
} from '@/features/release-notes/controller'
import { tauriReleaseNotes } from '@/platform/tauriReleaseNotes'

export const releaseNotesKey: InjectionKey<ReleaseNotesController> = Symbol('releaseNotes')
const releaseNotes = createReleaseNotesController(tauriReleaseNotes)

/** @return 当前主窗口日志控制器；测试注入与生产实例隔离。 */
export function useReleaseNotes(): ReleaseNotesController {
  return inject(releaseNotesKey, releaseNotes)
}
