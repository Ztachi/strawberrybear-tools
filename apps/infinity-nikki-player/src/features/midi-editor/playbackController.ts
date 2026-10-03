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
  getDocument: () => PianoRollDocument | null
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
  /** 用本窗口音频时钟采样可跨窗口的播放状态，不迁移 AudioContext 或发音句柄。 */
  getSnapshot(): MidiEditorPlaybackSnapshot
  /** 先采样再暂停排程，交给另一窗口恢复。 */
  suspend(): MidiEditorPlaybackSnapshot
  /** 统一恢复定位、倍速和播放意图；暂停快照不初始化音频设备。 */
  restore(snapshot: MidiEditorPlaybackSnapshot): Promise<void>
  /** 按本窗口音频时钟返回实际已发声、尚未释放的音高，去重后升序排列。 */
  getActivePitches(): readonly number[]
  play(fromSeconds?: number): Promise<void>
  pause(): void
  stop(): void
  seek(seconds: number): void
  audition(pitch: number, velocity: number, durationSeconds?: number): Promise<void>
  setLoop(loop: MidiProjectLoop | null | undefined): void
  invalidate(): void
  dispose(): void
}

/** 播放窗口交接的完整状态；循环由同一项目文档提供，声音由接管窗口重新排程。 */
export type MidiEditorPlaybackSnapshot = Pick<
  EditorTransportState,
  'positionSeconds' | 'isPlaying' | 'playbackRate'
>

/**
 * @description 验证 IPC 快照，非法数字不能污染音频时钟或下次还原的位置。
 * @param value 接收到的播放状态。
 * @return 位置、倍速及播放标记是否合法。
 */
export function validMidiEditorPlaybackSnapshot(value: MidiEditorPlaybackSnapshot): boolean {
  return (
    !!value &&
    Number.isFinite(value.positionSeconds) &&
    value.positionSeconds >= 0 &&
    Number.isFinite(value.playbackRate) &&
    value.playbackRate > 0 &&
    typeof value.isPlaying === 'boolean'
  )
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
  const scheduleAudio = options.scheduleNote ?? scheduleNote
  // 每个声部独立记时；同音重叠不能在第一个 noteOff 时就熄灭琴键。
  const voices = new Map<ScheduledNoteHandle, { pitch: number; start: number; end: number }>()
  /**
   * @description 将实际合成器句柄与发音区间绑定，排程成功才产生高亮。
   * @param pitch MIDI 音高。
   * @param velocity 力度。
   * @param whenSeconds 音频时钟起点。
   * @param durationSeconds 可选试听时长。
   * @return 可取消的声部句柄；合成器未发声时返回 null。
   */
  const schedule: NonNullable<MidiEditorPlaybackControllerOptions['scheduleNote']> = (
    pitch,
    velocity,
    whenSeconds,
    durationSeconds
  ) => {
    const start = Math.max(now(), whenSeconds)
    const handle = scheduleAudio(pitch, velocity, start, durationSeconds)
    if (!handle) return null
    const voice = {
      pitch,
      start,
      end: durationSeconds === undefined ? Infinity : start + Math.max(0.01, durationSeconds),
    }
    const wrapped: ScheduledNoteHandle = {
      stop(when) {
        if (when === undefined) handle.stop()
        else handle.stop(when)
        // noteOff 提前排程时仍保留高亮，立即取消则移除整个声部。
        if (when === undefined || when <= now()) voices.delete(wrapped)
        else voice.end = Math.min(voice.end, when)
      },
    }
    voices.set(wrapped, voice)
    return wrapped
  }
  const synth = createSynth(schedule, now)
  let engine: EditorTransport | null = null
  let pendingPosition = 0
  let pendingRate = 1
  let playOperation = 0
  let playRequested = false
  let loop = options.getLoop() ?? null
  let disposed = false
  const auditions = new Map<ScheduledNoteHandle, number>()
  // 路由载入和卸载期间没有文档；调度器尚未清理的同步回调也应读到零长度时间轴。
  const emptyDocument: PianoRollDocument = {
    ticksPerBeat: 480,
    durationTicks: 0,
    tempoMap: [],
    timeSignatureMap: [],
    tracks: [],
    notes: [],
  }

  function playbackDocument(): PianoRollDocument {
    const document = options.getDocument() ?? emptyDocument
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
    const duration = createTimeline(options.getDocument() ?? emptyDocument).durationSeconds
    return {
      positionSeconds: Math.min(pendingPosition, duration),
      isPlaying: false,
      playbackRate: pendingRate,
      loop: null,
      durationSeconds: duration,
    }
  }

  function ensureEngine(): EditorTransport | null {
    if (disposed || !options.getDocument()) return null
    if (!engine) {
      // 初始化 setLoop/setRate 会同步回调零位置；先保留快照，不能让回调覆盖首次播放的起点。
      const position = pendingPosition
      const rate = pendingRate
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
      engine.setRate(rate)
      engine.seek(position)
    }
    return engine
  }

  const controller: MidiEditorPlaybackController = {
    getState: () => engine?.getState() ?? fallbackState(),
    getSnapshot() {
      const state = controller.getState()
      return {
        positionSeconds: state.positionSeconds,
        isPlaying: state.isPlaying || playRequested,
        playbackRate: state.playbackRate,
      }
    },
    suspend() {
      const snapshot = controller.getSnapshot()
      controller.pause()
      return snapshot
    },
    async restore(snapshot) {
      if (disposed || !validMidiEditorPlaybackSnapshot(snapshot)) return
      controller.pause()
      pendingRate = snapshot.playbackRate
      engine?.setRate(pendingRate)
      controller.seek(snapshot.positionSeconds)
      if (snapshot.isPlaying) await controller.play()
    },
    getActivePitches() {
      const clock = now()
      const pitches = new Set<number>()
      for (const [handle, voice] of voices) {
        if (voice.end <= clock) voices.delete(handle)
        else if (voice.start <= clock) pitches.add(voice.pitch)
      }
      return Array.from(pitches).sort((left, right) => left - right)
    },
    async play(fromSeconds) {
      const document = options.getDocument()
      if (disposed || !document) return
      const operation = ++playOperation
      playRequested = true
      try {
        await ensureAudio()
        // 同一项目在等待音色期间仍可编辑；换入口先 stop/清空文档，会使 operation 失效。
        if (disposed || operation !== playOperation || !options.getDocument()) return
        options.pauseExternal?.()
        ensureEngine()?.play(fromSeconds)
      } finally {
        if (operation === playOperation) playRequested = false
      }
    },
    pause() {
      // 取消等待音频准备的旧请求，避免交接后原窗口迟到启动并形成两路播放。
      playOperation += 1
      playRequested = false
      stopAuditions()
      engine?.pause()
      if (!engine) options.onChange?.(fallbackState())
    },
    stop() {
      playOperation += 1
      playRequested = false
      stopAuditions()
      if (engine) engine.stop()
      else {
        pendingPosition = loop
          ? createTimeline(options.getDocument() ?? emptyDocument).tickToSeconds(loop.startTick)
          : 0
        options.onChange?.(fallbackState())
      }
    },
    seek(seconds) {
      const duration = createTimeline(options.getDocument() ?? emptyDocument).durationSeconds
      pendingPosition = Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0))
      engine?.seek(pendingPosition)
      if (!engine) options.onChange?.(fallbackState())
    },
    async audition(pitch, velocity, durationSeconds = 0.35) {
      if (disposed || options.getPlayablePitches?.()?.has(pitch) === false) return
      const document = options.getDocument()
      const operation = playOperation
      await ensureAudio()
      // 等待音频初始化时模板可能切换，发声前必须按最新模板再次检查。
      if (
        disposed ||
        operation !== playOperation ||
        options.getDocument() !== document ||
        options.getPlayablePitches?.()?.has(pitch) === false
      )
        return
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
      if (!options.getDocument()) {
        playOperation += 1
        playRequested = false
        engine?.dispose()
        engine = null
        pendingPosition = 0
        pendingRate = 1
      }
      if (engine) engine.invalidate()
      else {
        // 音频引擎延迟创建；尚未试听也需要在曲长缩短时裁剪位置并刷新界面。
        pendingPosition = fallbackState().positionSeconds
        options.onChange?.(fallbackState())
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      playOperation += 1
      playRequested = false
      stopAuditions()
      engine?.dispose()
      engine = null
      synth.allNotesOff()
      voices.clear()
    },
  }
  return controller
}
