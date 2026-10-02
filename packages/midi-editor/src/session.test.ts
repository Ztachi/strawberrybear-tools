import { describe, expect, it } from 'vitest'
import { createEditorSession, createProject } from './session'

describe('createEditorSession', () => {
  it('adds, selects, moves, undoes and tracks dirty state', () => {
    const session = createEditorSession(createProject({ name: 'Demo' }))
    expect(session.getState().dirty).toBe(false)
    session.dispatch({
      type: 'add-note',
      trackId: 'track-1',
      pitch: 60,
      startTick: 0,
      durationTicks: 480,
    })
    let state = session.getState()
    expect(state.document.notes).toHaveLength(1)
    expect(state.selection.size).toBe(1)
    expect(state.lastCreatedNoteIds).toHaveLength(1)
    expect(state.dirty).toBe(true)
    const id = state.lastCreatedNoteIds[0]!
    session.dispatch({ type: 'move', noteIds: [id], deltaTick: 480, deltaPitch: 2 })
    state = session.getState()
    expect(state.document.notes[0]!.startTick).toBe(480)
    expect(state.document.notes[0]!.pitch).toBe(62)
    session.dispatch({ type: 'undo' })
    expect(session.getState().document.notes[0]!.startTick).toBe(0)
    session.dispatch({ type: 'undo' })
    state = session.getState()
    expect(state.document.notes).toHaveLength(0)
    expect(state.selection.size).toBe(0)
    expect(state.dirty).toBe(false)
    session.dispatch({ type: 'redo' })
    expect(session.getState().canRedo).toBe(true)
  })

  it('copies, pastes, duplicates and cuts', () => {
    const session = createEditorSession(createProject(), { snap: '1/4' })
    session.dispatch({
      type: 'add-note',
      trackId: 'track-1',
      pitch: 60,
      startTick: 0,
      durationTicks: 240,
    })
    session.dispatch({ type: 'copy' })
    expect(session.getState().clipboardAvailable).toBe(true)
    session.dispatch({ type: 'paste', atTick: 960 })
    expect(session.getState().document.notes.map((n) => n.startTick)).toEqual([0, 960])
    session.dispatch({ type: 'select-all' })
    session.dispatch({ type: 'duplicate' })
    // 选区 0–1200，按 1/4 网格向上取整到 1440
    expect(
      session
        .getState()
        .document.notes.map((n) => n.startTick)
        .sort((a, b) => a - b)
    ).toEqual([0, 960, 1440, 2400])
    session.dispatch({ type: 'cut' })
    expect(session.getState().document.notes).toHaveLength(2)
  })

  it('handles tracks, tempo, snap and saved state', () => {
    const session = createEditorSession(createProject(), {
      trackDefaultName: (i) => `音轨 ${i}`,
      trackCopyName: (name) => `${name} 副本`,
    })
    session.dispatch({ type: 'add-track' })
    expect(session.getState().document.tracks[1]!.name).toBe('音轨 2')
    session.dispatch({ type: 'duplicate-track', trackId: 'track-1' })
    expect(session.getState().document.tracks[1]!.name).toBe('Track 1 副本')
    session.dispatch({ type: 'remove-track', trackId: 'track-1' })
    expect(session.getState().document.tracks).toHaveLength(2)
    session.dispatch({ type: 'set-tempo', bpm: 90 })
    expect(session.getState().document.tempoMap[0]!.microsecondsPerQuarter).toBe(666_667)
    session.dispatch({ type: 'set-snap', resolution: '1/8' })
    expect(session.snapTick(250)).toBe(240)
    expect(session.snapStep()).toBe(240)
    session.dispatch({ type: 'rename', name: '  新名字 ' })
    const project = session.toProject()
    expect(project.name).toBe('新名字')
    expect(project.meta.trackCount).toBe(2)
    session.markSaved({ id: 'saved-id' })
    expect(session.getState().dirty).toBe(false)
    expect(session.getState().project.id).toBe('saved-id')
    session.dispatch({ type: 'loop-change', loop: { startTick: 0, endTick: 960 } })
    expect(session.getState().dirty).toBe(true)
    session.dispatch({ type: 'loop-change', loop: { startTick: 10, endTick: 5 } })
    expect(session.getState().project.loop).toBeNull()
  })

  it('coalesces velocity drags and extends duration', () => {
    const session = createEditorSession(createProject())
    session.dispatch({
      type: 'add-note',
      trackId: 'track-1',
      pitch: 60,
      startTick: 20000,
      durationTicks: 100,
    })
    expect(session.getState().document.durationTicks).toBe(20100)
    const id = session.getState().lastCreatedNoteIds[0]!
    session.dispatch({
      type: 'set-velocity',
      changes: [{ noteId: id, velocity: 50 }],
      coalesceKey: 'drag',
    })
    session.dispatch({
      type: 'set-velocity',
      changes: [{ noteId: id, velocity: 70 }],
      coalesceKey: 'drag',
    })
    session.dispatch({ type: 'undo' })
    expect(session.getState().document.notes[0]!.velocity).toBe(100)
  })
})

describe('有效音轨区域与总时长', () => {
  function project() {
    return createProject({
      document: {
        durationTicks: 57600,
        ticksPerBeat: 480,
        tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
        timeSignatureMap: [],
        tracks: [
          { id: 'short', name: 'Short', enabled: true, isPercussion: false, endTick: 9600 },
          { id: 'long', name: 'Long', enabled: true, isPercussion: false, endTick: 57600 },
        ],
        notes: [
          { id: 's', trackId: 'short', pitch: 60, velocity: 100, startTick: 0, endTick: 9600 },
          { id: 'l', trackId: 'long', pitch: 64, velocity: 100, startTick: 0, endTick: 57600 },
        ],
      },
    })
  }

  it('禁用、删除最长轨道后立即缩短，撤销重做恢复时长与启用状态', () => {
    const session = createEditorSession(project())
    session.dispatch({ type: 'update-track', trackId: 'long', patch: { enabled: false } })
    expect(session.getState().document.durationTicks).toBe(9600)
    expect(session.toProject().meta.durationMs).toBe(10000)
    session.dispatch({ type: 'undo' })
    expect(session.getState().document.durationTicks).toBe(57600)
    session.dispatch({ type: 'redo' })
    expect(session.getState().document.durationTicks).toBe(9600)
    session.dispatch({ type: 'undo' })
    session.dispatch({ type: 'remove-track', trackId: 'long' })
    expect(session.getState().document.durationTicks).toBe(9600)
    session.dispatch({ type: 'update-track', trackId: 'short', patch: { enabled: false } })
    expect(session.getState().document.durationTicks).toBe(0)
  })

  it('手动延长区域保留静音尾部，一次拖拽只有一步历史，不截断区域内音符', () => {
    const session = createEditorSession(project())
    session.dispatch({ type: 'resize-track-region', trackId: 'short', endTick: 76800 })
    expect(session.getState().document.durationTicks).toBe(76800)
    expect(session.getState().document.tracks[0]!.endTick).toBe(76800)
    session.dispatch({ type: 'undo' })
    expect(session.getState().document.durationTicks).toBe(57600)
    expect(session.getState().canUndo).toBe(false)
    session.dispatch({ type: 'redo' })
    session.dispatch({ type: 'resize-track-region', trackId: 'short', endTick: 100 })
    expect(session.getState().document.tracks[0]!.endTick).toBe(9600)
    expect(session.getState().document.notes[0]!.endTick).toBe(9600)
  })

  it('载入旧项目即重算有效时长，不把修正记作用户编辑；音符尾端变化可缩短无显式边界的区域', () => {
    const p = project()
    p.document = {
      ...p.document,
      tracks: p.document.tracks.map((t) => ({ ...t, enabled: t.id === 'short' })),
    }
    const session = createEditorSession(p)
    expect(session.getState().document.durationTicks).toBe(9600)
    expect(session.getState().dirty).toBe(false)
    expect(session.getState().canUndo).toBe(false)
    const automatic = createEditorSession(
      createProject({
        document: {
          ...p.document,
          tracks: [{ id: 'short', name: 'Short', enabled: true, isPercussion: false }],
          notes: p.document.notes.slice(0, 1),
        },
      })
    )
    automatic.dispatch({ type: 'resize', noteIds: ['s'], edge: 'end', deltaTick: -4800 })
    expect(automatic.getState().document.durationTicks).toBe(4800)
  })
})
