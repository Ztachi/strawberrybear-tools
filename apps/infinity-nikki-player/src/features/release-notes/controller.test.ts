import { describe, expect, it, vi } from 'vitest'
import { createReleaseNotesController, type ReleaseNotesLaunch } from './controller'

const launch: ReleaseNotesLaunch = {
  currentVersion: '1.3.1',
  historyVersions: ['1.3.1', '1.3.0', '1.2.0', '1.1.4', '1.0.0'],
  updateVersions: ['1.3.1', '1.3.0', '1.2.0', '1.1.4'],
}

describe('更新日志启动与手动入口', () => {
  it('写盘失败仍能查看和关闭日志，不在本次运行重复弹出', async () => {
    const controller = createReleaseNotesController({
      load: async () => launch,
      acknowledge: async () => {
        throw new Error('磁盘只读')
      },
    })
    await expect(controller.start()).rejects.toThrow('磁盘只读')
    expect(controller.open.value).toBe(true)
    controller.close()
    await controller.showHistory()
    expect(controller.versions.value).toEqual(launch.historyVersions)
  })

  it('读取故障恢复后，手动入口可重新加载完整历史', async () => {
    let available = false
    const controller = createReleaseNotesController({
      load: async () => {
        if (!available) throw new Error('IPC 暂时不可用')
        return launch
      },
      acknowledge: async () => {},
    })
    await expect(controller.start()).rejects.toThrow('IPC 暂时不可用')
    expect(controller.open.value).toBe(false)
    available = true
    await controller.showHistory()
    expect(controller.open.value).toBe(true)
    expect(controller.versions.value).toEqual(launch.historyVersions)
  })

  it('升级范围只自动打开一次，关闭后手动入口始终展示完整记录', async () => {
    const controller = createReleaseNotesController({
      load: async () => launch,
      acknowledge: async () => {},
    })
    await Promise.all([controller.start(), controller.start()])
    expect(controller.open.value).toBe(true)
    expect(controller.versions.value).toEqual(['1.3.1', '1.3.0', '1.2.0', '1.1.4'])
    controller.close()
    await controller.start()
    expect(controller.open.value).toBe(false)
    await controller.showHistory()
    expect(controller.versions.value).toEqual(['1.3.1', '1.3.0', '1.2.0', '1.1.4', '1.0.0'])
    expect(controller.mode.value).toBe('history')
  })

  it('首次安装建立基线但不弹窗', async () => {
    const acknowledge = vi.fn(async () => {})
    const controller = createReleaseNotesController({
      load: async () => ({ ...launch, updateVersions: [] }),
      acknowledge,
    })
    await controller.start()
    expect(controller.open.value).toBe(false)
    expect(acknowledge).toHaveBeenCalledOnce()
  })

  it('启动数据迟到不会把已打开的完整记录切换成升级范围', async () => {
    let resolve!: (value: ReleaseNotesLaunch) => void
    const controller = createReleaseNotesController({
      load: () =>
        new Promise((done) => {
          resolve = done
        }),
      acknowledge: async () => {},
    })
    const starting = controller.start()
    const opening = controller.showHistory()
    resolve(launch)
    await Promise.all([starting, opening])
    expect(controller.mode.value).toBe('history')
    expect(controller.versions.value).toEqual(launch.historyVersions)
  })
})
