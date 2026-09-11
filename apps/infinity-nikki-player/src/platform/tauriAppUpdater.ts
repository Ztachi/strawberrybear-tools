/** @fileOverview 更新器的 Tauri 适配器，所有更新策略与周期计时由 Rust 统一执行。 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { UpdaterAdapter, UpdateSnapshot } from '@/features/app-updater/controller'

export const tauriAppUpdater: UpdaterAdapter = {
  getState: () => invoke<UpdateSnapshot>('get_update_state'),
  subscribe: (listener) =>
    listen<UpdateSnapshot>('app-update-state', ({ payload }) => listener(payload)),
  onResume(listener) {
    let disposed = false
    let removeNativeFocus: (() => void) | undefined
    void getCurrentWindow()
      .onFocusChanged(({ payload }) => {
        if (payload && !disposed) listener()
      })
      .then((unlisten) => {
        if (disposed) unlisten()
        else removeNativeFocus = unlisten
      })
      .catch((error: unknown) => {
        console.warn('监听原生窗口焦点失败，保留页面焦点恢复检查：', error)
      })
    window.addEventListener('online', listener)
    window.addEventListener('focus', listener)
    return () => {
      disposed = true
      removeNativeFocus?.()
      window.removeEventListener('online', listener)
      window.removeEventListener('focus', listener)
    }
  },
  check: (reason) => invoke<UpdateSnapshot>('check_app_update', { reason }),
  download: () => invoke<UpdateSnapshot>('download_app_update'),
  cancel: () => invoke<UpdateSnapshot>('cancel_app_update'),
  install: () => invoke<UpdateSnapshot>('install_app_update'),
  openDownload: (source) => invoke('open_manual_update_download', { source }),
  exportDiagnostics: () => invoke<string | null>('export_update_diagnostics'),
}
