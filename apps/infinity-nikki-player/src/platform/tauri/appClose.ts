import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { InjectionKey } from 'vue'
import type { CloseAction } from '@/features/app-close/controller'
export interface AppClosePlatform {
  listen(request: (action?: CloseAction) => void): Promise<() => void>
  hide(): Promise<void>
  quit(): Promise<void>
}
export const APP_CLOSE_PLATFORM: InjectionKey<AppClosePlatform> = Symbol('app-close-platform')
/** 原生层始终拦截关闭，以便首屏加载与异步确认期间也不会先销毁窗口。 */
export const tauriAppClose: AppClosePlatform = {
  async listen(request) {
    const close = await listen('main-window-close-requested', () => request())
    try {
      const quit = await listen('app-quit-requested', () => request('quit'))
      return () => {
        close()
        quit()
      }
    } catch (error) {
      close()
      throw error
    }
  },
  hide: () => invoke('hide_to_tray'),
  quit: () => invoke('quit_application'),
}
