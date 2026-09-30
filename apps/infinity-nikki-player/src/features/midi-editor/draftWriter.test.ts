import { describe, expect, it, vi } from 'vitest'
import { createProject } from '@strawberrybear/midi-editor'
import { createMidiDraftWriter } from './draftWriter'

describe('MIDI 草稿保存队列', () => {
  it('周期草稿先落盘，再保存安装前快照，清理草稿前可等待全部保存结束', async () => {
    let finish!: () => void
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValue(undefined)
    const writer = createMidiDraftWriter(save)
    const oldProject = createProject({ name: '周期草稿' })
    const latest = { ...oldProject, name: '安装前最新修改' }
    const first = writer.write('create', oldProject)
    const last = writer.write('create', latest)
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenLastCalledWith('create', oldProject)
    finish()
    await writer.flush()
    await Promise.all([first, last])
    expect(save).toHaveBeenLastCalledWith('create', latest)
  })

  it('传播当前失败，后续重试不被失败的旧保存阻塞', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('磁盘写入失败'))
      .mockResolvedValue(undefined)
    const writer = createMidiDraftWriter(save)
    const project = createProject()
    await expect(writer.write('create', project)).rejects.toThrow('磁盘写入失败')
    await writer.write('create', project)
    await writer.flush()
    expect(save).toHaveBeenCalledTimes(2)
  })
})
