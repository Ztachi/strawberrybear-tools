import type { MidiProject } from '@strawberrybear/midi-editor'

/**
 * 串行保存草稿，防止周期保存的旧快照晚于安装前的最终快照落盘。
 * @param save 草稿持久化端口，失败必须保留给调用方处理
 * @returns 串行保存及等待队列落盘的动作
 */
export function createMidiDraftWriter(save: (key: string, project: MidiProject) => Promise<void>) {
  let pending = Promise.resolve()
  function write(key: string, project: MidiProject): Promise<void> {
    // 旧保存失败不能永久阻塞后续重试，但当前失败仍由返回的 Promise 传播。
    const task = pending.catch(() => {}).then(() => save(key, project))
    pending = task
    return task
  }
  return {
    write,
    /** 删除草稿前等待旧保存结束，避免已经保存的项目又出现旧草稿。 */
    flush: (): Promise<void> => pending,
  }
}
