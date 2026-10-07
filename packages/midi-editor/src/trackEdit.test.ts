import { describe, expect, it } from 'vitest'
import { createEditorSession, createProject } from './session'
import { notesRelativeTo } from './selection'

const note = (id: string, trackId: string, startTick: number, endTick: number) => ({ id, trackId, startTick, endTick, pitch: 60, velocity: 80 })

describe('单轨编辑结果', () => {
  it('一次应用音符、区域和元数据，撤销后全部恢复且不改变其他轨', () => {
    const project = createProject()
    project.extensions = { external: { value: 1 } }
    project.document.tracks.push({ id: 'other', name: 'Other', enabled: true, isPercussion: false, endTick: 960 })
    project.document.notes = [note('other-note', 'other', 0, 480)]
    const session = createEditorSession(project)
    session.dispatch({ type: 'apply-track-edit', trackId: 'track-1', notes: [note('recorded', 'track-1', 0, 480)], endTick: 480, extensions: { ...project.extensions, recording: { template: 'test' } } })
    expect(session.getState().document.notes).toHaveLength(2)
    expect(session.getState().document.tracks[0]!.endTick).toBe(480)
    expect(session.toProject().extensions).toEqual({ external: { value: 1 }, recording: { template: 'test' } })
    session.dispatch({ type: 'undo' })
    expect(session.getState().document.notes).toEqual(project.document.notes)
    expect(session.toProject().extensions).toEqual(project.extensions)
    expect(session.getState().canUndo).toBe(false)
    expect(session.getState().dirty).toBe(false)
    session.dispatch({ type: 'redo' })
    expect(session.toProject().extensions?.recording).toEqual({ template: 'test' })
    session.dispatch({ type: 'set-velocity', changes: [{ noteId: 'recorded', velocity: 90 }] })
    expect(session.toProject().extensions?.recording).toEqual({ template: 'test' })
  })
  it('拒绝缺失轨、跨轨音符及重复 ID，不产生历史', () => {
    const session = createEditorSession(createProject())
    session.dispatch({ type: 'apply-track-edit', trackId: 'missing', notes: [], endTick: 100 })
    session.dispatch({ type: 'apply-track-edit', trackId: 'track-1', notes: [note('bad', 'other', 0, 1)], endTick: 100 })
    session.dispatch({ type: 'apply-track-edit', trackId: 'track-1', notes: [note('dup', 'track-1', 0, 1), note('dup', 'track-1', 1, 2)], endTick: 100 })
    expect(session.getState().canUndo).toBe(false)
  })
})

describe('相对时间选择', () => {
  it('按有效区域及明确边界选择，整曲范围包含其他轨', () => {
    const document = createProject().document
    document.tracks[0]!.endTick = 100
    document.tracks.push({ id: 'other', name: 'Other', enabled: false, isPercussion: false, endTick: 100 })
    document.notes = [note('before', 'track-1', 0, 15), note('anchor', 'track-1', 20, 40), note('chord', 'track-1', 20, 30), note('overlap', 'track-1', 30, 50), note('after', 'track-1', 40, 60), note('hidden', 'track-1', 100, 120), note('other', 'other', 40, 60)]
    expect(notesRelativeTo(document, { trackId: 'track-1', noteId: 'anchor', tick: 0, direction: 'before' })).toEqual(['before'])
    expect(notesRelativeTo(document, { trackId: 'track-1', noteId: 'anchor', tick: 0, direction: 'after' })).toEqual(['after'])
    expect(notesRelativeTo(document, { noteId: 'anchor', tick: 0, direction: 'after' })).toEqual(['after', 'other'])
    expect(notesRelativeTo(document, { trackId: 'track-1', tick: 40, direction: 'before' })).toEqual(['before', 'anchor', 'chord', 'overlap'])
    expect(notesRelativeTo(document, { trackId: 'track-1', tick: 40, direction: 'all' })).toHaveLength(5)
  })
})

it('单轨原子应用尊重显式区域边界，不暴露区域外的音符', () => {
  const session = createEditorSession(createProject())
  session.dispatch({ type: 'apply-track-edit', trackId: 'track-1', notes: [note('hidden', 'track-1', 200, 400)], endTick: 100 })
  expect(session.getState().document.tracks[0]!.endTick).toBe(100)
  expect(session.getState().document.notes[0]!.endTick).toBe(400)
})
