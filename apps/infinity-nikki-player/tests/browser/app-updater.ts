/** 独立页面注入测试适配器，不注入真实 Tauri 更新对象或全局模拟开关。 */
import { createApp } from 'vue'
import { mockIPC } from '@tauri-apps/api/mocks'
import {
  createUpdaterController,
  initialUpdateState,
  type UpdateSnapshot,
  type UpdaterAdapter,
} from '@/features/app-updater/controller'
import { appUpdaterKey } from '@/composables/useAppUpdater'
import { i18n } from '@/i18n'
import Fixture from './app-updater.vue'
import '@/style.css'

const params = new URLSearchParams(location.search)
i18n.global.locale.value = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN'
const scenario = params.get('scenario') ?? 'available'
let state: UpdateSnapshot = {
  ...initialUpdateState(),
  revision: 0,
  phase: 'available',
  currentVersion: '1.2.0',
  targetVersion: '1.2.1',
  lastCheckedAt: Date.now(),
}
if (scenario === 'error')
  state = {
    ...state,
    phase: 'error',
    targetVersion: null,
    lastError: { stage: 'check', code: 'network', message: '断网', source: 'github' },
  }
if (scenario === 'notApplied')
  state.lastInstall = {
    fromVersion: '1.2.0',
    targetVersion: '1.2.1',
    executablePath: '/fixture/old.app',
    attemptedAt: Date.now() - 60000,
    outcome: 'notApplied',
  }
if (scenario === 'unknownLength')
  state = { ...state, phase: 'downloading', source: 'mirror', downloadedBytes: 1048576 }
let listener = (_state: UpdateSnapshot) => {}
let finishDownload: ((state: UpdateSnapshot) => void) | undefined
const calls: string[] = []
// 使用官方事件模拟验证真实关于弹窗，白名单外的原生命令一律失败。
mockIPC(
  (command) => {
    if (command === 'plugin:app|version') {
      calls.push('version')
      return '1.2.0'
    }
    throw new Error(`界面验收不允许原生命令：${command}`)
  },
  { shouldMockEvents: true }
)
function update(values: Partial<UpdateSnapshot>) {
  state = { ...state, ...values, revision: state.revision + 1 }
  listener(state)
  return state
}
const adapter: UpdaterAdapter = {
  getState: async () => state,
  subscribe: async (callback) => {
    listener = callback
    return () => {}
  },
  onResume: () => () => {},
  check: async () => {
    calls.push('check')
    return update(scenario === 'error' ? {} : { phase: 'available' })
  },
  download: () => {
    calls.push('download')
    update({
      phase: 'downloading',
      downloadedBytes: 3000000,
      contentLength: 10000000,
      source: 'mirror',
      lastError: null,
    })
    return new Promise((resolve) => {
      finishDownload = resolve
    })
  },
  cancel: async () => {
    calls.push('cancel')
    const next = update({ phase: 'available', downloadedBytes: 0, contentLength: null })
    finishDownload?.(next)
    return next
  },
  install: async () => {
    calls.push('install')
    return update({ phase: 'installing' })
  },
  openDownload: async (source) => {
    calls.push(`manual:${source}`)
  },
  exportDiagnostics: async () => {
    calls.push('export')
    return '/fixture/diagnostics.zip'
  },
}
const controller = createUpdaterController(adapter)
controller.setPrepareInstall(async () => {
  calls.push('prepare')
  return false
})
declare global {
  interface Window {
    updaterFixture: { complete(): void; calls: string[] }
  }
}
window.updaterFixture = {
  calls,
  complete: () => {
    const next = update({ phase: 'ready', downloadedBytes: 10000000 })
    finishDownload?.(next)
  },
}
await controller.start()
createApp(Fixture).use(i18n).provide(appUpdaterKey, controller).mount('#app')
