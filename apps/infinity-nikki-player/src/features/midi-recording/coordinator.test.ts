import { describe, expect, it } from 'vitest'
import { createEditorSession, createProject } from '@strawberrybear/midi-editor'
import {
  applyRecorderResult,
  recordingRevision,
  recordingContentRevision,
  recordingDraftKey,
  recordingDraftConflicts,
} from './coordinator'

describe('录制结果协调', () => {
  it('草稿失败不应用，过期版本不覆盖；成功只有一个撤销记录', async () => {
    const session = createEditorSession(createProject())
    const result = {
      projectId: session.getState().project.id,
      trackId: 'track-1',
      baseRevision: await recordingRevision(session.getState().project),
      notes: [{ id: 'n', trackId: 'track-1', pitch: 61, velocity: 80, startTick: 0, endTick: 480 }],
      endTick: 480,
      cursorTick: 480,
      template: { id: 't', name: 'T', is_builtin: false, mappings: [{ key: 'A', pitch: 61 }] },
    }
    await expect(
      applyRecorderResult(
        () => session.getState().project,
        (action) => session.dispatch(action),
        async () => {
          throw new Error('disk')
        },
        result
      )
    ).rejects.toThrow('disk')
    expect(session.getState().document.notes).toHaveLength(0)
    await applyRecorderResult(
      () => session.getState().project,
      (action) => session.dispatch(action),
      async () => {},
      result
    )
    expect(session.getState().document.notes).toHaveLength(1)
    await expect(
      applyRecorderResult(
        () => session.getState().project,
        (action) => session.dispatch(action),
        async () => {},
        result
      )
    ).rejects.toThrow('stale')
    session.dispatch({ type: 'undo' })
    expect(session.getState().canUndo).toBe(false)
  })
})

it('独立草稿按稳定入口找回，新的项目和轨道 ID 不造成假冲突，音乐变化仍有冲突', async () => {
  const original = createProject()
  const baseContentRevision = await recordingContentRevision(original)
  const input = {
    project: original,
    trackId: 'track-1',
    startTick: 0,
    templates: [],
    templateId: null,
    baseRevision: await recordingRevision(original),
    baseContentRevision,
    draftScope: 'create',
  }
  const reopened = structuredClone(original)
  reopened.id = 'new-project'
  reopened.document.tracks[0]!.id = 'new-track'
  const current = {
    ...input,
    project: reopened,
    trackId: 'new-track',
    baseRevision: await recordingRevision(reopened),
    baseContentRevision: await recordingContentRevision(reopened),
  }
  const draft = {
    ...original,
    extensions: {
      recordingDraft: { baseRevision: input.baseRevision, baseContentRevision, trackId: 'track-1' },
    },
  }
  expect(await recordingDraftKey(current)).toBe(await recordingDraftKey(input))
  expect(recordingDraftConflicts(current, draft)).toBe(false)
  reopened.document.tracks[0]!.name = 'Changed'
  current.baseContentRevision = await recordingContentRevision(reopened)
  expect(recordingDraftConflicts(current, draft)).toBe(true)
  expect(await recordingDraftKey({ ...input, draftScope: 'edit-another-project' })).not.toBe(
    await recordingDraftKey(input)
  )
})
