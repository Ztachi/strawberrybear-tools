/** @fileOverview 多个更新入口共享原生状态；测试通过组件依赖注入独立控制器。 */
import { inject, type InjectionKey } from 'vue'
import {
  createUpdaterController,
  type AppUpdaterController,
} from '@/features/app-updater/controller'
import { tauriAppUpdater } from '@/platform/tauriAppUpdater'
import { feedback } from '@/lib/feedback'
import { i18n } from '@/i18n'

export const appUpdaterKey: InjectionKey<AppUpdaterController> = Symbol('appUpdater')

const appUpdater = createUpdaterController(tauriAppUpdater, (key) => {
  const message = i18n.global.t(`updater.${key}`)
  if (key === 'checkFailed' || key === 'installFailed') feedback.error(message)
  else feedback.info(message)
})

/** @returns 当前应用的更新器；测试实例不会污染真实流程。 */
export function useAppUpdater(): AppUpdaterController {
  return inject(appUpdaterKey, appUpdater)
}
