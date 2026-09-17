import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultLabels } from '@strawberrybear/piano-roll/browser'
import type { PreviewControlState } from '@/features/player/previewControls'
import { PianoEditorSession } from './session'
import { PianoPresentationClock, presentationNow } from './presentation-clock'
import type {
  EditorCommand,
  EditorPresentation,
  EditorRequest,
  EditorUpdate,
  EditorWindowPort,
} from './protocol'

function fixture() {
  let receive: (request: EditorRequest) => void = () => {}
  let sessionId = ''
  let sequence = 0
  let destroyed: () => void = () => {}
  const destroy = vi.fn(async () => {})
  const commands: EditorCommand[] = []
  const updates: EditorUpdate[] = []
  const statuses: string[] = []
  const errors: unknown[] = []
  const state: EditorPresentation = {
    filename: 'a.mid',
    title: 'A',
    labels: defaultLabels,
    locale: 'zh-CN',
    error: '',
    loading: false,
    document: {
      durationTicks: 9600,
      ticksPerBeat: 480,
      tempoMap: [],
      timeSignatureMap: [],
      tracks: [],
      notes: [],
    },
  }
  const port: EditorWindowPort = {
    open: vi.fn(async (id) => {
      sessionId = id
      return {
        destroy,
        focus: vi.fn(async () => {}),
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
  const transport = { positionSeconds: 1, isPlaying: true, playbackRate: 1 }
  const playback: PreviewControlState = {
    mediaId: 'a.mid',
    isPlaying: true,
    isPaused: false,
    mode: 'sequential',
    error: '',
  }
  const host = new PianoEditorSession({
    playback: () => playback,
    port,
    state: () => state,
    transport: () => transport,
    viewport: () => ({
      selectedTrackId: '1',
      editorOpen: true,
      hideEmptyTracks: true,
      editorHeight: 55,
      editor: {
        scrollLeft: 120,
        scrollTop: 500,
        timeZoom: 99.1234,
        pitchZoom: 24,
        follow: false,
        minTimeZoom: 1,
        maxTimeZoom: 1200,
      },
    }),
    onCommand: (command) => commands.push(command),
    onStatus: (status) => statuses.push(status),
    onError: (error) => errors.push(error),
  })
  const request = (
    command: EditorCommand,
    revision = 0,
    session = sessionId,
    requestSequence = ++sequence
  ) => receive({ ...command, session, revision, sequence: requestSequence })
  return {
    host,
    playback,
    transport,
    port,
    state,
    updates,
    commands,
    statuses,
    errors,
    destroy,
    request,
    destroyed: () => destroyed(),
    getDestroyedCallback: () => destroyed,
  }
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())

describe('detached piano editor session', () => {
  it('validates playback identity separately from the viewed document and rejects malformed commands', async () => {
    const f = fixture()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    expect(f.updates.some((update) => update.kind === 'playback')).toBe(true)
    f.state.loading = true
    f.host.updateState(true)
    f.request({ kind: 'playback', mediaId: 'a.mid', command: { action: 'toggle-play' } }, 0)
    expect(f.commands).toHaveLength(1)
    f.playback.mediaId = 'b.mid'
    f.host.updatePlayback()
    f.request({ kind: 'playback', mediaId: 'a.mid', command: { action: 'stop' } }, 1)
    f.request(
      {
        kind: 'playback',
        mediaId: 'b.mid',
        command: { action: 'mode', mode: 'invalid' },
      } as unknown as EditorCommand,
      1
    )
    expect(f.commands).toHaveLength(1)
    f.request(
      { kind: 'playback', mediaId: 'b.mid', command: { action: 'mode', mode: 'shuffle' } },
      1
    )
    expect(f.commands).toHaveLength(2)
    await flush()
    expect(f.updates.filter((update) => update.kind === 'playback').at(-1)).toMatchObject({
      playback: { mediaId: 'b.mid' },
    })
    await f.host.dock()
  })

  it('heartbeats preserve the audio sample timestamp instead of rewinding the rendered position', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
    const f = fixture()
    const clock = new PianoPresentationClock()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.request({ kind: 'shown' })
    const initial = f.updates.at(-1)!
    if (initial.kind !== 'transport') throw new Error('Expected initial transport')
    clock.receive(initial.transport, initial.sampledAt)
    // 主窗口没有新显示帧时，缓存位置保持不变；租约心跳不能将其重标为当前音频位置。
    for (let pulse = 0; pulse < 3; pulse++) {
      await vi.advanceTimersByTimeAsync(2000)
      const before = clock.read(presentationNow(), 100).positionSeconds
      f.request({ kind: 'ping' })
      await flush()
      const update = f.updates.at(-1)!
      if (update.kind !== 'transport') throw new Error('Expected transport acknowledgement')
      clock.receive(update.transport, update.sampledAt)
      expect(clock.read(presentationNow(), 100).positionSeconds).toBe(before)
      expect(update.sampledAt).toBe(initial.sampledAt)
    }
    await f.host.dock()
  })

  it('bounds continuous transport traffic but publishes pauses immediately', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
    const f = fixture()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    for (let i = 0; i < 60; i++) {
      await vi.advanceTimersByTimeAsync(16)
      f.transport.positionSeconds += 0.016
      f.host.updateTransport()
      await flush()
    }
    expect(f.updates.filter((value) => value.kind === 'transport').length).toBeLessThan(25)
    f.transport.isPlaying = false
    f.host.updateTransport()
    await flush()
    expect(f.updates.at(-1)).toMatchObject({ kind: 'transport', transport: { isPlaying: false } })
    await f.host.dock()
  })

  it('rejects interactions from a loading song even with the current revision', async () => {
    const f = fixture()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.state.loading = true
    f.host.updateState(true)
    f.request({ kind: 'seek', seconds: 4 }, 1)
    expect(f.commands).toHaveLength(0)
    f.state.loading = false
    f.host.updateState()
    f.request({ kind: 'seek', seconds: 4 }, 2)
    expect(f.commands).toHaveLength(1)
    await f.host.dock()
  })

  it('sends the resolved document even when a loading notice had the same document reference', async () => {
    const f = fixture()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.state.document = { ...f.state.document, durationTicks: 0 }
    f.state.loading = true
    f.host.updateState(true)
    await flush()
    f.state.loading = false
    f.host.updateState()
    await flush()
    const states = f.updates.filter((value) => value.kind === 'state')
    expect(states.at(-2)?.state.document).toBeUndefined()
    expect(states.at(-1)?.state.document?.durationTicks).toBe(0)
    await f.host.dock()
  })

  it('keeps the embedded panel until ready and restores without controlling playback', async () => {
    const f = fixture()
    await f.host.open()
    expect(f.statuses).toEqual(['opening'])
    f.request({ kind: 'ready' })
    await flush()
    expect(f.updates[0]).toMatchObject({
      kind: 'state',
      viewport: { editor: { scrollLeft: 120, follow: false } },
    })
    f.request({ kind: 'shown' })
    expect(f.statuses.at(-1)).toBe('detached')
    await f.host.open()
    expect(f.port.open).toHaveBeenCalledTimes(1)
    f.request({ kind: 'dock' })
    await flush()
    expect(f.destroy).toHaveBeenCalledOnce()
    expect(f.statuses.at(-1)).toBe('docked')
    expect(f.commands.every((command) => command.kind === 'preview')).toBe(true)
  })

  it('rejects old song, old session, duplicate and malformed operations', async () => {
    const f = fixture()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.state.filename = 'b.mid'
    f.host.updateState(true)
    f.request({ kind: 'seek', seconds: 3 }, 0)
    f.request({ kind: 'seek', seconds: 3 }, 1, 'old-session')
    f.request({ kind: 'seek', seconds: Number.NaN }, 1)
    f.request({ kind: 'seek', seconds: 4 }, 1)
    f.request({ kind: 'seek', seconds: 5 }, 1, undefined, 1)
    expect(f.commands).toEqual([expect.objectContaining({ kind: 'seek', seconds: 4 })])
    await f.host.dock()
  })

  it('does not resend a large document for playback frames or track selection', async () => {
    const f = fixture()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    for (let frame = 0; frame < 200; frame++) f.host.updateTransport()
    await flush()
    f.state.title = 'Renamed song'
    f.host.updateState()
    await flush()
    const documents = f.updates.filter((update) => update.kind === 'state' && update.state.document)
    expect(documents).toHaveLength(1)
    expect(f.updates.length).toBeLessThan(10)
    await f.host.dock()
  })

  it('cancels a late window creation after the page leaves', async () => {
    const f = fixture()
    let resolve!: (value: Awaited<ReturnType<EditorWindowPort['open']>>) => void
    f.port.open = () =>
      new Promise((done) => {
        resolve = done
      })
    const opening = f.host.open()
    await flush()
    await f.host.dock()
    resolve({ destroy: f.destroy, focus: async () => {}, onDestroyed: async () => () => {} })
    await opening
    expect(f.destroy).toHaveBeenCalledOnce()
    expect(f.statuses.at(-1)).toBe('docked')
  })

  it('restores after native destruction and reports a readiness timeout', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.host.open()
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.errors).toHaveLength(1)
    expect(f.statuses.at(-1)).toBe('docked')
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.request({ kind: 'shown' })
    f.destroyed()
    expect(f.statuses.at(-1)).toBe('docked')
    await f.host.dock()
  })

  it('resends a complete state when the child reloads with a reset command sequence', async () => {
    const f = fixture()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.request({ kind: 'ready' }, 0, undefined, 1)
    await flush()
    expect(
      f.updates.filter((update) => update.kind === 'state' && update.state.document)
    ).toHaveLength(2)
    await f.host.dock()
  })

  it('resends the document if a reload arrives while the old snapshot is sending', async () => {
    const f = fixture()
    let release!: () => void
    f.port.send = vi.fn(async (update) => {
      f.updates.push(update)
      if (f.updates.length === 1)
        await new Promise<void>((resolve) => {
          release = resolve
        })
    })
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.request({ kind: 'ready' }, 0, undefined, 1)
    release()
    await flush()
    expect(
      f.updates.filter((update) => update.kind === 'state' && update.state.document)
    ).toHaveLength(2)
    await f.host.dock()
  })

  it('ignores a late destruction callback from a previously closed window', async () => {
    const f = fixture()
    await f.host.open()
    const oldDestroyed = f.getDestroyedCallback()
    await f.host.dock()
    await f.host.open()
    f.request({ kind: 'ready' })
    await flush()
    f.request({ kind: 'shown' })
    oldDestroyed()
    expect(f.statuses.at(-1)).toBe('detached')
    await f.host.dock()
  })
})
