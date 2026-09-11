/** @fileOverview 安装保护、取消、迟到事件与多个入口的状态一致性回归。 */
import { describe, expect, it, vi } from 'vitest'
import {
  createUpdaterController,
  initialUpdateState,
  type UpdaterAdapter,
  type UpdateSnapshot,
} from './controller'

/** 构造实例级适配器；不访问真实 Tauri 或用户目录。 */
function fixture() {
  let state: UpdateSnapshot = {
    ...initialUpdateState(),
    revision: 0,
    phase: 'available',
    targetVersion: '1.2.1',
    currentVersion: '1.2.0',
  }
  let listener: (state: UpdateSnapshot) => void = () => {}
  let resume = () => {}
  const notify = vi.fn()
  const unlisten = vi.fn()
  const removeResume = vi.fn()
  const update = (values: Partial<UpdateSnapshot>) => {
    state = { ...state, ...values, revision: state.revision + 1 }
    listener(state)
    return state
  }
  const adapter: UpdaterAdapter = {
    getState: vi.fn(async () => state),
    subscribe: vi.fn(async (callback) => {
      listener = callback
      return unlisten
    }),
    onResume: vi.fn((callback) => {
      resume = callback
      return removeResume
    }),
    check: vi.fn(async () => update({ phase: 'upToDate', targetVersion: null })),
    download: vi.fn(async () =>
      update({ phase: 'ready', downloadedBytes: 100, contentLength: 100 })
    ),
    cancel: vi.fn(async () =>
      update({ phase: 'available', downloadedBytes: 0, contentLength: null })
    ),
    install: vi.fn(async () => update({ phase: 'installing' })),
    openDownload: vi.fn(async () => {}),
    exportDiagnostics: vi.fn(async () => null),
  }
  const controller = createUpdaterController(adapter, notify)
  return {
    controller,
    adapter,
    update,
    notify,
    unlisten,
    removeResume,
    resume: () => resume(),
    send: (next: UpdateSnapshot) => listener(next),
  }
}

describe('更新界面协调者', () => {
  it('订阅先于读取，迟到快照不能覆盖较新的事件', async () => {
    const f = fixture()
    let resolve!: (state: UpdateSnapshot) => void
    f.adapter.getState = vi.fn(
      () =>
        new Promise<UpdateSnapshot>((done) => {
          resolve = done
        })
    )
    const task = f.controller.start()
    await Promise.resolve()
    const newest = f.update({ phase: 'ready' })
    resolve({ ...newest, revision: 0, phase: 'checking' })
    await task
    expect(f.controller.state.value.phase).toBe('ready')
    f.controller.dispose()
    expect(f.unlisten).toHaveBeenCalledOnce()
    expect(f.removeResume).toHaveBeenCalledOnce()
  })

  it.each([false, '保存失败'])('取消或保存失败后保留下载包：%s', async (result) => {
    const f = fixture()
    await f.controller.start()
    const prepare = vi.fn(async () => {
      if (typeof result === 'string') throw new Error(result)
      return result
    })
    f.controller.setPrepareInstall(prepare)
    await f.controller.downloadAndInstallUpdate()
    expect(f.controller.state.value.phase).toBe('ready')
    expect(f.adapter.install).not.toHaveBeenCalled()
    f.controller.setPrepareInstall(async () => true)
    await f.controller.downloadAndInstallUpdate()
    expect(f.adapter.download).toHaveBeenCalledOnce()
    expect(f.adapter.install).toHaveBeenCalledOnce()
  })

  it('未挂载编辑保护时不安装，重复点击只确认及安装一次', async () => {
    const f = fixture()
    await f.controller.start()
    await f.controller.downloadAndInstallUpdate()
    expect(f.adapter.install).not.toHaveBeenCalled()
    const prepare = vi.fn(async () => true)
    f.controller.setPrepareInstall(prepare)
    await Promise.all([
      f.controller.downloadAndInstallUpdate(),
      f.controller.downloadAndInstallUpdate(),
    ])
    expect(prepare).toHaveBeenCalledOnce()
    expect(f.adapter.install).toHaveBeenCalledOnce()
    expect(f.notify).not.toHaveBeenCalledWith('installedTitle')
  })

  it('签名失败不能进入安装，恢复事件不干扰下载', async () => {
    const f = fixture()
    await f.controller.start()
    f.controller.setPrepareInstall(async () => true)
    f.update({ phase: 'downloading', contentLength: null, downloadedBytes: 50 })
    f.resume()
    expect(f.adapter.check).not.toHaveBeenCalled()
    expect(f.controller.progress.value).toBeNull()
    f.update({ phase: 'available' })
    f.adapter.download = vi.fn(async () =>
      f.update({
        phase: 'error',
        lastError: { stage: 'download', code: 'signature', message: '签名错误', source: 'github' },
      })
    )
    await f.controller.downloadAndInstallUpdate()
    expect(f.adapter.install).not.toHaveBeenCalled()
    expect(f.controller.lastError.value?.code).toBe('signature')
  })

  it('取消后迟到的下载返回值不能触发安装，并可重新下载', async () => {
    const f = fixture()
    await f.controller.start()
    f.controller.setPrepareInstall(async () => true)
    let resolve!: (state: UpdateSnapshot) => void
    f.adapter.download = vi.fn(() => {
      f.update({ phase: 'downloading' })
      return new Promise<UpdateSnapshot>((done) => {
        resolve = done
      })
    })
    const task = f.controller.downloadAndInstallUpdate()
    await f.controller.cancelDownload()
    resolve({ ...initialUpdateState(), revision: 1, phase: 'ready' })
    await task
    expect(f.controller.state.value.phase).toBe('available')
    expect(f.adapter.install).not.toHaveBeenCalled()
    f.adapter.download = vi.fn(async () => f.update({ phase: 'ready' }))
    await f.controller.downloadAndInstallUpdate()
    expect(f.adapter.install).toHaveBeenCalledOnce()
  })

  it('全部来源失败如实反馈，后台失败保持静默', async () => {
    const f = fixture()
    await f.controller.start()
    f.adapter.check = vi.fn(async () =>
      f.update({
        phase: 'error',
        lastError: { stage: 'check', code: 'network', message: '断网', source: 'github' },
      })
    )
    await f.controller.checkUpdate()
    expect(f.notify).toHaveBeenLastCalledWith('checkFailed')
    expect(f.notify).not.toHaveBeenCalledWith('noUpdateTitle')
    f.notify.mockClear()
    await f.controller.checkUpdate({ silent: true })
    expect(f.notify).not.toHaveBeenCalled()
  })
})
