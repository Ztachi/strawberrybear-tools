import { describe, expect, it, vi } from 'vitest'
import { defaultLabels } from '@strawberrybear/piano-roll/browser'
import { createProject } from '@strawberrybear/midi-editor'
import { MidiProjectEditorWindowSession } from './session'
import type {
  MidiProjectEditorCommand,
  MidiProjectEditorPresentation,
  MidiProjectEditorRequest,
  MidiProjectEditorUpdate,
  MidiProjectEditorWindowPort,
} from './protocol'

function fixture() {
  let receive: (request: MidiProjectEditorRequest) => void = () => {}
  let sessionId = ''
  let requestSequence = 0
  let destroyed: () => void = () => {}
  const updates: MidiProjectEditorUpdate[] = []
  const commands: MidiProjectEditorRequest[] = []
  const statuses: string[] = []
  const events: string[] = []
  const focus = vi.fn(async () => {})
  const onError = vi.fn()
  let presentationAvailable = true
  const destroy = vi.fn(async () => {
    events.push('destroy')
  })
  const project = createProject({ name: 'Test' })
  const presentation: MidiProjectEditorPresentation = {
    state: {
      project,
      selection: [],
      tool: 'select',
      snap: '1/16',
      canUndo: false,
      canRedo: false,
      dirty: false,
      clipboardAvailable: false,
      lastCreatedNoteIds: [],
    },
    labels: defaultLabels,
    locale: 'zh-CN',
    transport: { positionSeconds: 0, isPlaying: false, playbackRate: 1 },
    showVelocity: false,
    dimUnplayable: false,
    playablePitches: [],
    currentTemplateId: null,
    templates: [],
    saving: false,
    hasChanges: false,
  }
  const port: MidiProjectEditorWindowPort = {
    open: vi.fn(async (session) => {
      sessionId = session
      return {
        focus,
        destroy,
        onDestroyed: async (callback: () => void) => {
          destroyed = callback
          return () => {}
        },
      }
    }),
    listen: async (callback) => {
      receive = callback
      return () => {}
    },
    send: vi.fn(async (update) => {
      updates.push(update)
    }),
  }
  const host = new MidiProjectEditorWindowSession({
    port,
    presentation: () => (presentationAvailable ? presentation : undefined),
    viewport: () => undefined,
    onCommand: (command) => commands.push(command),
    onDock: async () => {
      events.push('dock')
    },
    onStatus: (status) => statuses.push(status),
    onError,
  })
  const request = (command: MidiProjectEditorCommand) =>
    receive({
      ...command,
      session: sessionId,
      sequence: ++requestSequence,
    } as MidiProjectEditorRequest)
  const requestForSession = (
    targetSession: string,
    sequence: number,
    command: MidiProjectEditorCommand
  ) => receive({ ...command, session: targetSession, sequence } as MidiProjectEditorRequest)
  return {
    host,
    port,
    presentation,
    updates,
    commands,
    statuses,
    events,
    focus,
    destroy,
    request,
    requestForSession,
    onError,
    setPresentationAvailable: (available: boolean) => {
      presentationAvailable = available
    },
    destroyed: () => destroyed(),
  }
}

const flush = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('detached MIDI project editor session', () => {
  it('focuses the existing window instead of opening a duplicate', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    await flush()
    await item.host.open()

    expect(item.port.open).toHaveBeenCalledTimes(1)
    expect(item.focus).toHaveBeenCalledTimes(1)
  })

  it('sends the current state after the child becomes ready', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    await flush()

    expect(item.updates[0]).toMatchObject({
      kind: 'state',
      presentation: { state: { project: { name: 'Test' } } },
    })
  })

  it('keeps the detached session alive while the route temporarily has no editor state', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    await flush()
    item.request({ kind: 'shown' })
    const updateCount = item.updates.length

    item.setPresentationAvailable(false)
    item.host.updateState()
    await flush()

    expect(item.onError).not.toHaveBeenCalled()
    expect(item.statuses.at(-1)).toBe('detached')
    expect(item.destroy).not.toHaveBeenCalled()
    expect(item.updates).toHaveLength(updateCount)

    item.setPresentationAvailable(true)
    item.host.updateState()
    await flush()
    expect(item.updates).toHaveLength(updateCount + 1)
    expect(item.updates.at(-1)).toMatchObject({ kind: 'state', presentation: { state: {} } })
  })

  it('acknowledges heartbeats while a route transition temporarily has no presentation', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    await flush()
    item.setPresentationAvailable(false)
    item.host.updateState()

    item.request({ kind: 'ping' })
    await flush()

    expect(item.updates.at(-1)).toMatchObject({ kind: 'pong' })
    expect(item.onError).not.toHaveBeenCalled()
    expect(item.destroy).not.toHaveBeenCalled()
  })

  it('keeps the host alive after a window crash', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    item.destroyed()
    await flush()

    expect(item.statuses.at(-1)).toBe('docked')
    expect(item.events).not.toContain('dock')
  })

  it('navigates back before destroying the detached window on restore', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    item.request({ kind: 'dock' })
    await flush()

    expect(item.events).toEqual(['dock', 'destroy'])
    expect(item.statuses.at(-1)).toBe('docked')
  })

  it('lets the main window restore the detached editor', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    await item.host.restore()

    expect(item.updates.at(-1)).toMatchObject({ kind: 'dock' })
    expect(item.events).toEqual([])

    item.request({ kind: 'playback-position', seconds: 3.5 })
    item.request({ kind: 'dock' })
    await flush()

    expect(item.events).toEqual(['dock', 'destroy'])
    expect(item.statuses.at(-1)).toBe('docked')
    expect(item.commands).toContainEqual(
      expect.objectContaining({ kind: 'playback-position', seconds: 3.5 })
    )
  })

  it('rejects stale sessions and forwards current editing commands', async () => {
    const item = fixture()
    await item.host.open()
    item.request({ kind: 'ready' })
    await flush()
    const dispatch = {
      kind: 'dispatch' as const,
      action: { type: 'set-tool' as const, tool: 'draw' as const },
    }
    item.request(dispatch)
    expect(item.commands.at(-1)).toMatchObject(dispatch)

    item.request({ kind: 'prepare-playback' })
    expect(item.commands.at(-1)).toMatchObject({ kind: 'prepare-playback' })

    item.requestForSession('stale-session', 99, {
      kind: 'dispatch',
      action: { type: 'set-tool', tool: 'select' },
    })
    expect(item.commands).toHaveLength(2)
  })
})
