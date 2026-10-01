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
  /** 仅试听允许的原始音高；null 表示完整试听，空集合表示全部静音。 */
  getPlayablePitches?: () => ReadonlySet<number> | null
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
  schedule: NonNullable<MidiEditorPlaybackControllerOptions['scheduleNote']>,
  now: () => number
): SynthPort {
  const active = new Map<number, ScheduledNoteHandle[]>()
  const scheduled = new Map<ScheduledNoteHandle, number>()
  return {
    noteOn(pitch, velocity, when) {
      // 按音频时钟清理，避免 AudioContext 暂停时墙钟定时器过早丢掉取消句柄。
      for (const [handle, end] of scheduled) if (end <= now()) scheduled.delete(handle)
      const handle = schedule(pitch, velocity, when)
      if (!handle) return
      const queue = active.get(pitch)
      if (queue) queue.push(handle)
      else active.set(pitch, [handle])
    },
    noteOff(pitch, when) {
      const queue = active.get(pitch)
      const handle = queue?.shift()
      if (handle) {
        handle.stop(when)
        // noteOff 也是提前排程，释放时刻到达前仍须保留句柄，以便切换模板取消旧声音。
        scheduled.set(handle, when)
      }
      if (queue?.length === 0) active.delete(pitch)
    },
    allNotesOff() {
      for (const queue of active.values()) for (const handle of queue) handle.stop()
      active.clear()
      for (const handle of scheduled.keys()) handle.stop()
      scheduled.clear()
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
  const synth = createSynth(schedule, now)
  let engine: EditorTransport | null = null
  let pendingPosition = 0
  let loop = options.getLoop() ?? null
  let disposed = false
  const auditions = new Map<ScheduledNoteHandle, number>()

  function playbackDocument(): PianoRollDocument {
    const document = options.getDocument()
    const pitches = options.getPlayablePitches?.()
    // 保留原曲时长、音轨和节拍，只过滤试听事件，绝不写回编辑文档。
    return pitches == null
      ? document
      : { ...document, notes: document.notes.filter((note) => pitches.has(note.pitch)) }
  }

  function stopAuditions(): void {
    for (const handle of auditions.keys()) handle.stop()
    auditions.clear()
  }

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
        getDocument: playbackDocument,
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
      if (disposed || options.getPlayablePitches?.()?.has(pitch) === false) return
      await ensureAudio()
      // 等待音频初始化时模板可能切换，发声前必须按最新模板再次检查。
      if (disposed || options.getPlayablePitches?.()?.has(pitch) === false) return
      const clock = now()
      for (const [handle, end] of auditions) if (end <= clock) auditions.delete(handle)
      const handle = schedule(pitch, velocity, clock, durationSeconds)
      if (handle) auditions.set(handle, clock + durationSeconds)
    },
    setLoop(next) {
      loop = next ?? null
      engine?.setLoop(loop)
    },
    invalidate() {
      stopAuditions()
      engine?.invalidate()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopAuditions()
      engine?.dispose()
      engine = null
      synth.allNotesOff()
    },
  }
}
