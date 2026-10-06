import { describe, expect, it } from 'vitest'
import { createEditorSession, createProject } from '@strawberrybear/midi-editor'
import { applyRecorderResult, recordingRevision } from './coordinator'

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
