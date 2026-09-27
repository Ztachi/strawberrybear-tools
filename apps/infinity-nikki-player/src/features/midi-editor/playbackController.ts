import {
  createEditorTransport,
  type EditorTransport,
  type EditorTransportState,
  type MidiProjectLoop,
  type SynthPort,
} from '@strawberrybear/midi-editor'
import { createTimeline, type PianoRollDocument } from '@strawberrybear/piano-roll/core'
import {
  ensureAudioRunning,
  getAudioClock,
  scheduleNote,
  type ScheduledNoteHandle,
} from '@/lib/midiPlayer'

export interface MidiEditorPlaybackControllerOptions {
  getDocument: () => PianoRollDocument
  getLoop: () => MidiProjectLoop | null | undefined
  onChange?: (state: EditorTransportState) => void
  pauseExternal?: () => void
  ensureAudio?: () => Promise<void>
  getAudioClock?: () => number
  scheduleNote?: (
    pitch: number,
    velocity: number,
    whenSeconds: number,
    durationSeconds?: number
  ) => ScheduledNoteHandle | null
}

export interface MidiEditorPlaybackController {
  getState(): EditorTransportState
  play(fromSeconds?: number): Promise<void>
  pause(): void
  stop(): void
  seek(seconds: number): void
  audition(pitch: number, velocity: number, durationSeconds?: number): Promise<void>
  setLoop(loop: MidiProjectLoop | null | undefined): void
  invalidate(): void
  dispose(): void
}

/** 每个 WebView 创建自己的合成端口，排程与窗口的 AudioContext 保持同源。 */
function createSynth(
  schedule: NonNullable<MidiEditorPlaybackControllerOptions['scheduleNote']>
): SynthPort {
  const active = new Map<number, ScheduledNoteHandle[]>()
  return {
    noteOn(pitch, velocity, when) {
      const handle = schedule(pitch, velocity, when)
      if (!handle) return
      const queue = active.get(pitch)
      if (queue) queue.push(handle)
      else active.set(pitch, [handle])
    },
    noteOff(pitch, when) {
      const queue = active.get(pitch)
      queue?.shift()?.stop(when)
      if (queue?.length === 0) active.delete(pitch)
    },
    allNotesOff() {
      for (const queue of active.values()) for (const handle of queue) handle.stop()
      active.clear()
    },
  }
}

/**
 * MIDI 编辑试听控制器。每个主窗口或独立窗口各自持有一份实例，音频时钟和调度器不跨 WebView。
 */
export function createMidiEditorPlaybackController(
  options: MidiEditorPlaybackControllerOptions
): MidiEditorPlaybackController {
  const ensureAudio = options.ensureAudio ?? ensureAudioRunning
  const now = options.getAudioClock ?? getAudioClock
  const schedule = options.scheduleNote ?? scheduleNote
  const synth = createSynth(schedule)
  let engine: EditorTransport | null = null
  let pendingPosition = 0
  let loop = options.getLoop() ?? null
  let disposed = false

  function fallbackState(): EditorTransportState {
    return {
      positionSeconds: pendingPosition,
      isPlaying: false,
      playbackRate: 1,
      loop: null,
      durationSeconds: createTimeline(options.getDocument()).durationSeconds,
    }
  }

  function ensureEngine(): EditorTransport | null {
    if (disposed) return null
    if (!engine) {
      engine = createEditorTransport({
        getDocument: options.getDocument,
        synth,
        now,
        onChange(state) {
          pendingPosition = state.positionSeconds
          options.onChange?.(state)
        },
      })
      engine.setLoop(loop)
      if (pendingPosition > 0) engine.seek(pendingPosition)
    }
    return engine
  }

  return {
    getState: () => engine?.getState() ?? fallbackState(),
    async play(fromSeconds) {
      if (disposed) return
      await ensureAudio()
      if (disposed) return
      options.pauseExternal?.()
      ensureEngine()?.play(fromSeconds)
    },
    pause() {
      engine?.pause()
    },
    stop() {
      if (engine) engine.stop()
      else
        pendingPosition = loop
          ? createTimeline(options.getDocument()).tickToSeconds(loop.startTick)
          : 0
    },
    seek(seconds) {
      const duration = createTimeline(options.getDocument()).durationSeconds
      pendingPosition = Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0))
      engine?.seek(pendingPosition)
      if (!engine) options.onChange?.(fallbackState())
    },
    async audition(pitch, velocity, durationSeconds = 0.35) {
      if (disposed) return
      await ensureAudio()
      if (!disposed) schedule(pitch, velocity, now(), durationSeconds)
    },
    setLoop(next) {
      loop = next ?? null
      engine?.setLoop(loop)
    },
    invalidate() {
      engine?.invalidate()
    },
    dispose() {
      if (disposed) return
      disposed = true
      engine?.dispose()
      engine = null
      synth.allNotesOff()
    },
  }
}
