import { describe, expect, it, vi } from 'vitest'
import { createProject } from '@strawberrybear/midi-editor'
import type { EditorAction, EditorSessionState } from '@strawberrybear/midi-editor'
import { MidiEditorShortcutController } from './shortcutController'

function fixture(selection = new Set<string>()) {
  const project = createProject({ name: 'Test' })
  const state: EditorSessionState = {
    project,
    document: project.document,
    selection,
    tool: 'select',
    snap: '1/16',
    canUndo: true,
    canRedo: true,
    dirty: false,
    clipboardAvailable: true,
    lastCreatedNoteIds: [],
  }
  const actions: EditorAction[] = []
  const save = vi.fn()
  const togglePlayback = vi.fn()
  const controller = new MidiEditorShortcutController({
    state: () => state,
    positionSeconds: () => 0,
    dispatch: (action) => actions.push(action),
    save,
    togglePlayback,
  })
  return { controller, actions, save, togglePlayback }
}

const key = (value: string, patch = {}) => ({
  key: value,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...patch,
})

describe('MIDI editor shortcut controller', () => {
  it('maps platform modifiers to history and save commands', () => {
    const item = fixture()

    expect(item.controller.handle(key('z', { metaKey: true }))).toBe(true)
    expect(item.controller.handle(key('s', { ctrlKey: true }))).toBe(true)

    expect(item.actions).toEqual([{ type: 'undo' }])
    expect(item.save).toHaveBeenCalledOnce()
  })

  it('coalesces one held arrow gesture into one history key', () => {
    const item = fixture(new Set(['note-1']))

    item.controller.handle(key('ArrowUp'))
    item.controller.handle(key('ArrowUp', { repeat: true }))

    expect(item.actions).toHaveLength(2)
    expect(item.actions[0]).toMatchObject({ type: 'nudge', deltaPitch: 1 })
    expect(item.actions[1]).toMatchObject({
      type: 'nudge',
      deltaPitch: 1,
      coalesceKey: (item.actions[0] as Extract<EditorAction, { type: 'nudge' }>).coalesceKey,
    })
  })

  it('does not consume selection shortcuts without a selection', () => {
    const item = fixture()

    expect(item.controller.handle(key('Delete'))).toBe(false)
    expect(item.controller.handle(key('ArrowLeft'))).toBe(false)
    expect(item.actions).toEqual([])
  })
})
