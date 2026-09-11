/** @fileOverview 更新界面的状态订阅与安装前编辑保护，网络及重试统一由原生层负责。 */
import { computed, readonly, ref, shallowRef } from 'vue'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error'
export type UpdateSource = 'mirror' | 'github'
export interface UpdateError {
  stage: string
  code: string
  message: string
  source: UpdateSource | null
}
export interface InstallReceipt {
  fromVersion: string
  targetVersion: string
  executablePath: string
  attemptedAt: number
  outcome: 'pending' | 'applied' | 'notApplied'
}
export interface UpdateSnapshot {
  revision: number
  phase: UpdatePhase
  currentVersion: string
  targetVersion: string | null
  source: UpdateSource | null
  downloadedBytes: number
  contentLength: number | null
  lastCheckedAt: number | null
  lastError: UpdateError | null
  lastInstall: InstallReceipt | null
}

/** 测试注入独立适配器，不能改变真实更新器的全局运行方式。 */
export interface UpdaterAdapter {
  getState(): Promise<UpdateSnapshot>
  subscribe(listener: (state: UpdateSnapshot) => void): Promise<() => void>
  onResume(listener: () => void): () => void
  check(reason: 'manual' | 'resume'): Promise<UpdateSnapshot>
  download(): Promise<UpdateSnapshot>
  cancel(): Promise<UpdateSnapshot>
  install(): Promise<UpdateSnapshot>
  openDownload(source: UpdateSource): Promise<void>
  exportDiagnostics(): Promise<string | null>
}

/** @returns 没有作出检查结论的初始状态。 */
export function initialUpdateState(): UpdateSnapshot {
  return {
    revision: -1,
    phase: 'idle',
    currentVersion: '',
    targetVersion: null,
    source: null,
    downloadedBytes: 0,
    contentLength: null,
    lastCheckedAt: null,
    lastError: null,
    lastInstall: null,
  }
}

/**
 * 创建唯一的界面协调者。下载成功后才请求保存；拒绝保存或安装失败都保留下载包。
 * @param adapter 原生接口或测试实例
 * @param notify 主动操作的反馈，后台事件仅更新状态
 * @returns 可供多个更新入口共享的控制器
 */
export function createUpdaterController(
  adapter: UpdaterAdapter,
  notify: (key: string) => void = () => {}
) {
  const state = shallowRef(initialUpdateState())
  const uiError = shallowRef<UpdateError | null>(null)
  const isPreparing = ref(false)
  let preparation: (() => Promise<boolean>) | undefined
  let startTask: Promise<void> | undefined
  let flow: Promise<void> | undefined
  let checkTask: Promise<UpdateSnapshot> | undefined
  let generation = 0
  let disposeListeners: (() => void) | undefined
  const isChecking = computed(() => state.value.phase === 'checking')
  const isDownloading = computed(() => state.value.phase === 'downloading')
  const isInstalling = computed(() => state.value.phase === 'installing')
  const isBusy = computed(
    () => isChecking.value || isDownloading.value || isInstalling.value || isPreparing.value
  )
  const hasUpdate = computed(() => state.value.targetVersion !== null)
  const lastError = computed(() => uiError.value ?? state.value.lastError)
  const progress = computed(() =>
    state.value.contentLength && state.value.contentLength > 0
      ? Math.min(100, Math.floor((state.value.downloadedBytes / state.value.contentLength) * 100))
      : null
  )

  /** @param next 原生快照；拒绝比已处理事件更旧的 IPC 返回值。 */
  function accept(next: UpdateSnapshot) {
    if (next.revision >= state.value.revision) state.value = next
  }

  /** @param error IPC 或编辑保存错误；不能把异常转成“没有更新”。 */
  function fail(error: unknown) {
    uiError.value =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as UpdateError)
        : { stage: 'client', code: 'operationFailed', message: String(error), source: null }
    notify('installFailed')
  }

  /** @returns 订阅完成；先监听再读取快照，防止错过启动检查。 */
  function start(): Promise<void> {
    if (startTask) return startTask
    const currentGeneration = ++generation
    startTask = (async () => {
      const unlisten = await adapter.subscribe(accept)
      if (currentGeneration !== generation) {
        unlisten()
        return
      }
      const removeResume = adapter.onResume(() => {
        void checkUpdate({ silent: true, reason: 'resume' })
      })
      disposeListeners = () => {
        unlisten()
        removeResume()
      }
      const next = await adapter.getState()
      if (currentGeneration === generation) accept(next)
    })().catch((error: unknown) => {
      disposeListeners?.()
      disposeListeners = undefined
      startTask = undefined
      uiError.value = {
        stage: 'client',
        code: 'operationFailed',
        message: String(error),
        source: null,
      }
    })
    return startTask
  }

  /** 页面销毁时释放订阅；不取消已经由原生层管理的下载。 */
  function dispose() {
    generation++
    disposeListeners?.()
    disposeListeners = undefined
    startTask = undefined
  }

  /** @param options 手动操作给真实反馈，恢复网络时静默检查。 */
  async function checkUpdate(
    options: { silent?: boolean; notifyNoUpdate?: boolean; reason?: 'manual' | 'resume' } = {}
  ) {
    if (checkTask) return checkTask
    if (isBusy.value || state.value.phase === 'ready') return state.value
    uiError.value = null
    try {
      checkTask ??= adapter.check(options.reason ?? 'manual').finally(() => {
        checkTask = undefined
      })
      const next = await checkTask
      accept(next)
      if (!options.silent) {
        if (next.phase === 'error') notify('checkFailed')
        else if (next.phase === 'upToDate') notify('noUpdateTitle')
        else if (next.phase === 'available') notify('availableTitle')
      }
      return next
    } catch (error) {
      uiError.value = {
        stage: 'check',
        code: 'operationFailed',
        message: String(error),
        source: null,
      }
      if (!options.silent) notify('checkFailed')
      return state.value
    }
  }

  /** @param prepare 当前编辑页面的保存/丢弃/取消确认；返回解绑函数。 */
  function setPrepareInstall(prepare: () => Promise<boolean>) {
    preparation = prepare
    return () => {
      if (preparation === prepare) preparation = undefined
    }
  }

  /** 多个入口重复点击只产生一次下载与保存确认。 */
  async function downloadAndInstallUpdate(): Promise<void> {
    if (flow) return flow
    if (!hasUpdate.value || isBusy.value) return
    const currentGeneration = generation
    uiError.value = null
    flow = (async () => {
      if (state.value.phase !== 'ready') accept(await adapter.download())
      if (currentGeneration !== generation) return
      if (state.value.phase === 'error') {
        notify('installFailed')
        return
      }
      if (state.value.phase !== 'ready') return
      isPreparing.value = true
      // 未挂载主窗口时不能绕过编辑保护调用安装器。
      if (!preparation || !(await preparation()) || currentGeneration !== generation) return
      accept(await adapter.install())
    })()
      .catch(fail)
      .finally(() => {
        isPreparing.value = false
        flow = undefined
      })
    return flow
  }

  /** 取消只作用于下载；不能在保存确认或安装过程中取消。 */
  async function cancelDownload() {
    if (!isDownloading.value) return
    generation++
    try {
      accept(await adapter.cancel())
    } catch (error) {
      fail(error)
    }
  }

  /** @param source 手动下载线路；优先指向已知目标的版本发布页。 */
  async function openReleasePage(source: UpdateSource = 'github') {
    try {
      await adapter.openDownload(source)
    } catch (error) {
      fail(error)
    }
  }

  /** 用户主动导出，不自动上传；取消文件对话框不产生提示。 */
  async function exportDiagnostics() {
    try {
      if (await adapter.exportDiagnostics()) notify('diagnosticsExported')
    } catch (error) {
      fail(error)
    }
  }

  return {
    state: readonly(state),
    isChecking,
    isDownloading,
    isInstalling,
    isPreparing: readonly(isPreparing),
    isBusy,
    hasUpdate,
    lastError,
    progress,
    start,
    dispose,
    checkUpdate,
    downloadAndInstallUpdate,
    cancelDownload,
    setPrepareInstall,
    openReleasePage,
    exportDiagnostics,
  }
}

export type AppUpdaterController = ReturnType<typeof createUpdaterController>
