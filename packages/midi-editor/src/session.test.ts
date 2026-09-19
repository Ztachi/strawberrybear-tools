import { describe, expect, it } from 'vitest'
import { createEditorSession, createProject } from './session'

describe('createEditorSession', () => {
  it('adds, selects, moves, undoes and tracks dirty state', () => {
    const session = createEditorSession(createProject({ name: 'Demo' }))
    expect(session.getState().dirty).toBe(false)
    session.dispatch({ type: 'add-note', trackId: 'track-1', pitch: 60, startTick: 0, durationTicks: 480 })
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
    session.dispatch({ type: 'add-note', trackId: 'track-1', pitch: 60, startTick: 0, durationTicks: 240 })
    session.dispatch({ type: 'copy' })
    expect(session.getState().clipboardAvailable).toBe(true)
    session.dispatch({ type: 'paste', atTick: 960 })
    expect(session.getState().document.notes.map((n) => n.startTick)).toEqual([0, 960])
    session.dispatch({ type: 'select-all' })
    session.dispatch({ type: 'duplicate' })
    // 选区 0–1200，按 1/4 网格向上取整到 1440
    expect(session.getState().document.notes.map((n) => n.startTick).sort((a, b) => a - b)).toEqual([
      0, 960, 1440, 2400,
    ])
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
    session.dispatch({ type: 'add-note', trackId: 'track-1', pitch: 60, startTick: 20000, durationTicks: 100 })
    expect(session.getState().document.durationTicks).toBe(12 * 1920)
    const id = session.getState().lastCreatedNoteIds[0]!
    session.dispatch({ type: 'set-velocity', changes: [{ noteId: id, velocity: 50 }], coalesceKey: 'drag' })
    session.dispatch({ type: 'set-velocity', changes: [{ noteId: id, velocity: 70 }], coalesceKey: 'drag' })
    session.dispatch({ type: 'undo' })
    expect(session.getState().document.notes[0]!.velocity).toBe(100)
  })
})
