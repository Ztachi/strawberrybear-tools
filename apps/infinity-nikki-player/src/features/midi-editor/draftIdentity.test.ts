import { describe, expect, it, vi } from 'vitest'
import { createProject, type MidiProject } from '@strawberrybear/midi-editor'
import {
  loadScopedMidiDraft,
  midiDraftKey,
  midiEditorEntry,
  sameMidiEditorEntry,
} from './draftIdentity'

/** 模拟原生草稿文件端口，验证实际读写及迁移，不替换草稿归属逻辑。 */
function draftFiles(entries: [string, MidiProject][] = []) {
  const files = new Map(entries)
  const port = {
    loadDraft: async (key: string) => files.get(key) ?? null,
    saveDraft: vi.fn(async (key: string, project: MidiProject) => {
      files.set(key, project)
    }),
    deleteDraft: vi.fn(async (key: string) => {
      files.delete(key)
    }),
  }
  return { files, port }
}

describe('MIDI 草稿入口', () => {
  it('新建、每个项目、每首歌曲及每个项目副本各自有稳定的安全键', async () => {
    const entries = [
      { kind: 'create' },
      { kind: 'edit', id: 'A' },
      { kind: 'edit', id: 'B' },
      { kind: 'copy', id: 'A' },
      { kind: 'copy', id: 'B' },
      { kind: 'song', filename: 'A.mid' },
      { kind: 'song', filename: 'B.mid' },
      { kind: 'song', filename: '中文歌曲🎹'.repeat(40) + '.mid' },
    ] as const
    const keys = await Promise.all(entries.map(midiDraftKey))
    expect(new Set(keys).size).toBe(entries.length)
    for (let index = 0; index < entries.length; index++) {
      expect(keys[index]).toMatch(/^[a-zA-Z0-9_-]+$/)
      expect(keys[index]!.length).toBeLessThan(100)
      expect(await midiDraftKey(entries[index]!)).toBe(keys[index])
    }
  })

  it('路由入口快照不随查询参数变化，独立窗口还原能区分歌曲 A/B', () => {
    const query = { from: 'A.mid' }
    const entry = midiEditorEntry({ name: 'midi-editor-create', params: {}, query })
    query.from = 'B.mid'
    expect(entry).toEqual({ kind: 'song', filename: 'A.mid' })
    expect(sameMidiEditorEntry(entry, { kind: 'song', filename: 'B.mid' })).toBe(false)
    expect(sameMidiEditorEntry(entry, { kind: 'song', filename: 'A.mid' })).toBe(true)
  })

  it('旧歌曲草稿迁移到歌曲 A，空白新建和歌曲 B 都不会加载它', async () => {
    const draft = createProject({ name: 'A 改编' })
    draft.source = { filename: 'A.mid' }
    const { files, port } = draftFiles([['create', draft]])
    const project = createProject()
    expect(await loadScopedMidiDraft(port, { kind: 'create' }, project)).toBeNull()
    expect(files.has('create')).toBe(false)
    expect(await loadScopedMidiDraft(port, { kind: 'song', filename: 'B.mid' }, project)).toBeNull()
    expect(await loadScopedMidiDraft(port, { kind: 'song', filename: 'A.mid' }, project)).toBe(
      draft
    )
  })

  it('迁移保留较新的专属草稿，迁移写入失败则保留旧文件供重试', async () => {
    const old = createProject({ name: '旧改编' })
    old.source = { filename: 'A.mid' }
    const newer = { ...old, name: '新改编', updatedAt: old.updatedAt + 100 }
    const entry = { kind: 'song', filename: 'A.mid' } as const
    const { port } = draftFiles([
      ['create', old],
      [await midiDraftKey(entry), newer],
    ])
    expect(await loadScopedMidiDraft(port, entry, old)).toBe(newer)
    expect(port.saveDraft).not.toHaveBeenCalled()
    const failed = draftFiles([['create', old]])
    failed.port.saveDraft.mockRejectedValueOnce(new Error('磁盘写入失败'))
    await expect(loadScopedMidiDraft(failed.port, entry, old)).rejects.toThrow('磁盘写入失败')
    expect(failed.files.get('create')).toBe(old)
    expect(failed.port.deleteDraft).not.toHaveBeenCalled()
  })

  it('保留原有空白草稿，项目草稿须与项目 id 匹配', async () => {
    const blank = createProject({ name: '空白创作' })
    const another = { ...createProject(), id: 'project-B' }
    const { port } = draftFiles([
      ['create', blank],
      [`edit-${another.id}`, blank],
    ])
    expect(await loadScopedMidiDraft(port, { kind: 'create' }, another)).toBe(blank)
    expect(await loadScopedMidiDraft(port, { kind: 'edit', id: another.id }, another)).toBeNull()
  })
})
