/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-08 13:42:27
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-06-01 15:44:45
 * @FilePath: /strawberrybear-tools/apps/infinity-nikki-player/src/lib/midiPlayer.ts
 * @Description:
 */
/**
 * @description: MIDI 播放器工具模块
 * @module midiPlayer
 * 试听由 Rust 原始时间轴和 WebAudio 驱动；midi-player-js 保留为游戏按键时间表的兼容解析器。
 */
import MidiPlayer from 'midi-player-js'
import soundfont from 'soundfont-player'
import { createTimeline } from '@strawberrybear/piano-roll/core'
import type { MidiInfo } from '@/types'

const { Player } = MidiPlayer

/** 播放器实例 */
let player: InstanceType<typeof Player> | null = null

/** 音频上下文 */
let audioContext: AudioContext | null = null

/** 合成器 */
let instrument: soundfont.Player | null = null
/** 多个异步播放请求共享一次音色加载，避免切歌时创建多份合成器。 */
let instrumentPromise: Promise<void> | null = null
/** 所有异步音频准备任务必须属于当前会话。stop/切歌立即使旧任务失效。 */
let audioSessionId = 0
/** 暂停/seek 可取消等待 AudioContext.resume 的旧操作，但不销毁媒体。 */
let audioOperationId = 0

/** 主输出增益节点 */
let masterGainNode: GainNode | null = null

/** 动态压缩节点，用于提升响度并限制峰值 */
let compressorNode: DynamicsCompressorNode | null = null

/** MIDI 力度归一化基准，127 对应最大力度 */
const MIDI_VELOCITY_NORMALIZER = 127
/** 单音预增益，保持不同力度的相对动态 */
const NOTE_INPUT_GAIN = 2
/** 主输出最大补偿倍率，100% 音量时用于补偿 WebView/soundfont 偏小 */
const PREVIEW_MASTER_GAIN = 12
/** 静音外的最低有效增益，避免低音量段完全听不见 */
const MIN_AUDIBLE_GAIN = 0.02

/** 播放状态 */
let isPlaying = false
let isPaused = false
let currentVolume = 1 // 音量系数 0-1

/** 禁用的音轨索引集合 */
let disabledTracks: Set<number> = new Set()

/** 回调函数 */
let onTimeUpdate: ((time: number) => void) | null = null
let onEndCallback: (() => void) | null = null

/** 活跃音符变化回调（用于同步键盘高亮） */
let onActiveNotesChange:
  | ((notes: Array<{ pitch: number; noteName: string; code?: string }>) => void)
  | null = null

/** 音符过滤器：返回 true 表示允许播放该音符 */
let noteFilter: ((event: { noteName: string; pitch: number; velocity: number }) => boolean) | null =
  null

/** 音高映射器：piano 模式下将原始 pitch 映射到模板音高，返回 null 表示该音符不需要播放 */
let pitchMapper: ((pitch: number) => number | null) | null = null

/** 正在播放的音符节点（key 是 noteName，用于停止特定音符） */
const activeNoteNodes = new Map<string, { stop: () => void }>()

/** 当前活跃的音符列表（用于同步键盘高亮），key 是 pitch */
const activeNotes = new Map<number, { pitch: number; noteName: string }>()

interface MidiPlaybackEvent {
  name: string
  noteName?: string
  velocity: number
  track?: number
  pitch?: number
  noteNumber?: number
  channel?: number
  tick?: number
}

/** 键盘演奏时间表音符：映射后的模板音高及其精确起止时间。 */
export interface KeyboardScheduleNote {
  /** 映射后的模板音高。 */
  targetPitch: number
  /** 音符开始时间（毫秒，原速音乐时间）。 */
  startMs: number
  /** 音符持续时间（毫秒，原速音乐时间）。 */
  durationMs: number
}

/** 当前加载曲目的键盘演奏时间表，playMidi 时重建。 */
let keyboardNoteSchedule: KeyboardScheduleNote[] = []

/** SoundFont 试听使用的原始音符时间轴。 */
interface PreviewScheduleNote {
  startMs: number
  endMs: number
  pitch: number
  noteName: string
  velocity: number
  track?: number
}

/** 已交给 Web Audio 的节点记录，用于暂停、跳转和切歌时统一取消。 */
interface ScheduledPreviewNode {
  node: { stop: (when?: number) => void }
  expiresAt: number
  startMs: number
  endMs: number
  pitch: number
  noteName: string
}

const PREVIEW_LOOKAHEAD_SECONDS = 5
const PREVIEW_SCHEDULER_INTERVAL_MS = 250
const PREVIEW_NODE_RETENTION_SECONDS = 10

let previewNoteSchedule: PreviewScheduleNote[] = []
const scheduledPreviewNodes = new Set<ScheduledPreviewNode>()
let previewSchedulerTimer: number | null = null
let nextPreviewNoteIndex = 0
let previewAnchorContextTime = 0
let previewAnchorPositionMs = 0
let previewPlaybackSpeed = 1
let previewDurationMs = 0
/** 前缀最大结束时间可快速找到 seek 时仍跨越播放位置的长音。 */
let previewEndPrefix: number[] = []

function resolveTargetPitchForKeyboard(event: MidiPlaybackEvent): number | null {
  if (!event.noteName) return null
  const originalPitch = event.noteNumber ?? noteNameToPitch(event.noteName)
  if (originalPitch === null) return null

  let targetPitch = originalPitch
  let targetNoteName = event.noteName
  if (pitchMapper) {
    const mappedPitch = pitchMapper(originalPitch)
    if (mappedPitch === null) return null
    targetPitch = mappedPitch
    targetNoteName = pitchToNoteName(targetPitch)
  }

  if (noteFilter) {
    const allowed = noteFilter({
      noteName: targetNoteName,
      pitch: targetPitch,
      velocity: event.velocity,
    })
    if (!allowed) return null
  }

  return targetPitch
}

/**
 * @description: 预扫描全曲，构建键盘演奏时间表（NoteOn/NoteOff 配对 + tempo 精确换算）
 * @description
 * ticksToSeconds 内部使用 midi-player-js 的 tempoMap，正确覆盖含中途变速的 MIDI。
 * 被过滤（禁用音轨、playMode 过滤器）的 NoteOn 也要占位进配对队列，
 * 否则其 NoteOff 会错误地关闭同音高的前一个合法音符。
 * @param {InstanceType<typeof Player>} playerInstance 已加载 MIDI 的播放器实例
 * @return {void} 无返回值
 */
function buildKeyboardNoteSchedule(playerInstance: InstanceType<typeof Player>): void {
  keyboardNoteSchedule = []

  const playerEvents =
    (playerInstance as InstanceType<typeof Player> & { events?: MidiPlaybackEvent[][] }).events ??
    []

  /** 配对队列：track:channel:pitch → FIFO 打开中的音符（targetPitch 为 null 表示被过滤的占位）。 */
  const openNotes = new Map<string, Array<{ startTick: number; targetPitch: number | null }>>()
  /** 待写入的时间表（tick 表示，最后统一换算成毫秒）。 */
  const pendingNotes: Array<{ targetPitch: number; startTick: number; endTick: number }> = []

  for (const trackEvents of playerEvents) {
    for (const event of trackEvents) {
      if (!event.noteName || event.tick === undefined) continue
      const originalPitch = event.noteNumber ?? noteNameToPitch(event.noteName)
      if (originalPitch === null) continue

      const pairKey = `${event.track ?? -1}:${event.channel ?? -1}:${originalPitch}`
      const isNoteOn = event.name === 'Note on' && event.velocity > 0
      const isNoteOff =
        event.name === 'Note off' || (event.name === 'Note on' && event.velocity === 0)

      if (isNoteOn) {
        const isTrackDisabled = event.track !== undefined && disabledTracks.has(event.track)
        const targetPitch = isTrackDisabled ? null : resolveTargetPitchForKeyboard(event)
        const queue = openNotes.get(pairKey) ?? []
        queue.push({ startTick: event.tick, targetPitch })
        openNotes.set(pairKey, queue)
      } else if (isNoteOff) {
        const open = openNotes.get(pairKey)?.shift()
        if (open?.targetPitch != null) {
          pendingNotes.push({
            targetPitch: open.targetPitch,
            startTick: open.startTick,
            endTick: event.tick,
          })
        }
      }
    }
  }

  // 缺失 NoteOff 的音符按零时值收尾，执行侧会拉长到最短保持时间
  for (const queue of openNotes.values()) {
    for (const open of queue) {
      if (open.targetPitch != null) {
        pendingNotes.push({
          targetPitch: open.targetPitch,
          startTick: open.startTick,
          endTick: open.startTick,
        })
      }
    }
  }

  keyboardNoteSchedule = pendingNotes
    .map((note) => {
      const startMs = playerInstance.ticksToSeconds(0, note.startTick) * 1000
      const endMs = playerInstance.ticksToSeconds(0, note.endTick) * 1000
      return {
        targetPitch: note.targetPitch,
        startMs,
        durationMs: Math.max(0, endMs - startMs),
      }
    })
    .sort((a, b) => a.startMs - b.startMs)
}

/**
 * @description: 使用 Rust 原始 tick/tempo 建立试听时间轴，保留非整数 BPM 和尾部静音。
 * @param {MidiInfo} midi - 后端解析的 MIDI 文档
 * @return {PianoRollTimeline} 与卷帘使用相同语义的纯时间轴
 */
function createMidiTimeline(midi: MidiInfo) {
  return createTimeline({
    ticksPerBeat: midi.ticks_per_beat,
    durationTicks: midi.duration_ticks ?? 0,
    tempoMap: midi.tempo_map?.map((point) => ({
      tick: point.tick,
      microsecondsPerQuarter: point.microseconds_per_quarter,
    })) ?? [{ tick: 0, microsecondsPerQuarter: midi.tempo || 500000 }],
    timeSignatureMap: midi.time_signature_map ?? [],
    tracks: [],
    notes: [],
  })
}

/**
 * @description: 从原始结束 tick 读取试听时长，避免序列化整数毫秒损失亚毫秒精度
 * @param {MidiInfo} midi - Rust MIDI 文档
 * @return {number} 原曲时长，毫秒
 */
export function getMidiSourceDurationMs(midi: MidiInfo): number {
  return midi.duration_ticks === undefined
    ? midi.duration_ms
    : createMidiTimeline(midi).durationSeconds * 1000
}

/**
 * @description: 编译原始音符时间表并建立长音 seek 索引
 * @param {MidiInfo} midi - Rust MIDI 文档
 * @return {void} 无返回值
 */
function buildPreviewNoteSchedule(midi: MidiInfo): void {
  const timeline = createMidiTimeline(midi)
  previewDurationMs =
    midi.duration_ticks === undefined ? midi.duration_ms : timeline.durationSeconds * 1000
  previewNoteSchedule = midi.events
    .map((note) => ({
      startMs: timeline.tickToSeconds(note.start_tick) * 1000,
      endMs: timeline.tickToSeconds(Math.max(note.start_tick, note.end_tick)) * 1000,
      pitch: note.pitch,
      noteName: pitchToNoteName(note.pitch),
      velocity: note.velocity,
      // 持久化音轨屏蔽采用 midi-player-js 从 1 开始的编号，Rust 原轨编号从 0 开始。
      track: (note.source_track ?? note.track) + 1,
    }))
    .sort((left, right) => left.startMs - right.startMs)
  previewEndPrefix = []
  let maxEnd = 0
  for (const note of previewNoteSchedule) {
    maxEnd = Math.max(maxEnd, note.endMs)
    previewEndPrefix.push(maxEnd)
  }
}

function getScheduledPreviewPositionMs(): number {
  if (!audioContext || !isPlaying || isPaused) return previewAnchorPositionMs
  return Math.min(
    previewDurationMs,
    Math.max(
      0,
      previewAnchorPositionMs +
        (audioContext.currentTime - previewAnchorContextTime) * 1000 * previewPlaybackSpeed
    )
  )
}

function stopScheduledPreviewNodes(): void {
  for (const scheduled of scheduledPreviewNodes) {
    try {
      scheduled.node.stop()
    } catch {
      /* 已自然结束或已停止的节点无需重复处理。 */
    }
  }
  scheduledPreviewNodes.clear()
}

function stopPreviewScheduler(): void {
  if (previewSchedulerTimer !== null) {
    clearInterval(previewSchedulerTimer)
    previewSchedulerTimer = null
  }
  stopScheduledPreviewNodes()
}

function resolvePreviewNote(note: PreviewScheduleNote): {
  noteName: string
  pitch: number
} | null {
  if (note.track !== undefined && disabledTracks.has(note.track)) return null

  let pitch = note.pitch
  let noteName = note.noteName
  if (pitchMapper) {
    const mappedPitch = pitchMapper(pitch)
    if (mappedPitch === null) return null
    pitch = mappedPitch
    noteName = pitchToNoteName(mappedPitch)
  }
  if (noteFilter && !noteFilter({ noteName, pitch, velocity: note.velocity })) return null
  return { noteName, pitch }
}

function findPreviewNoteIndex(positionMs: number): number {
  let low = 0
  let high = previewNoteSchedule.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (previewNoteSchedule[mid]!.startMs < positionMs) low = mid + 1
    else high = mid
  }
  return low
}

function schedulePreviewWindow(): void {
  if (!audioContext || !instrument || !isPlaying || isPaused) return

  const contextNow = audioContext.currentTime
  const positionMs = getScheduledPreviewPositionMs()
  // WebAudio 调度是试听的真实时钟；不能让 midi-player-js 按原速触发 EOF 截断慢速试听。
  if (positionMs >= previewDurationMs) {
    previewAnchorPositionMs = previewDurationMs
    isPlaying = false
    isPaused = false
    stopPreviewScheduler()
    activeNotes.clear()
    notifyActiveNotesChange()
    onEndCallback?.()
    return
  }
  const horizonMs = positionMs + PREVIEW_LOOKAHEAD_SECONDS * 1000 * previewPlaybackSpeed

  for (const scheduled of scheduledPreviewNodes) {
    if (scheduled.expiresAt <= contextNow) scheduledPreviewNodes.delete(scheduled)
  }

  // 如果主线程阻塞时间超过了 lookahead，跳过已经错过的 NoteOn，避免恢复后在同一帧爆发补播。
  while (
    nextPreviewNoteIndex < previewNoteSchedule.length &&
    previewNoteSchedule[nextPreviewNoteIndex]!.startMs < positionMs - 50
  ) {
    nextPreviewNoteIndex += 1
  }

  while (
    nextPreviewNoteIndex < previewNoteSchedule.length &&
    previewNoteSchedule[nextPreviewNoteIndex]!.startMs <= horizonMs
  ) {
    const note = previewNoteSchedule[nextPreviewNoteIndex++]!
    const resolved = resolvePreviewNote(note)
    if (!resolved) continue

    const delaySeconds = Math.max(0, (note.startMs - positionMs) / 1000 / previewPlaybackSpeed)
    const when = contextNow + delaySeconds
    const duration = Math.max(
      0.005,
      (note.endMs - Math.max(note.startMs, positionMs)) / 1000 / previewPlaybackSpeed
    )
    const node = instrument.play(resolved.noteName, when, {
      gain: getNoteGain(note.velocity),
      duration,
    }) as unknown as { stop: (when?: number) => void }
    scheduledPreviewNodes.add({
      node,
      expiresAt: when + duration + PREVIEW_NODE_RETENTION_SECONDS,
      startMs: Math.max(note.startMs, positionMs),
      endMs: note.endMs,
      pitch: resolved.pitch,
      noteName: resolved.noteName,
    })
  }
}

function startPreviewScheduler(positionMs: number): void {
  if (!audioContext) return
  stopPreviewScheduler()
  previewAnchorPositionMs = Math.max(0, positionMs)
  previewAnchorContextTime = audioContext.currentTime
  nextPreviewNoteIndex = findPreviewNoteIndex(previewAnchorPositionMs)
  // seek/resume 到长音中部时恢复剩余音长，后续 NoteOn 仍由正常可见窗口调度。
  const nextIndex = nextPreviewNoteIndex
  let low = 0
  let high = nextIndex
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (previewEndPrefix[middle]! <= previewAnchorPositionMs) low = middle + 1
    else high = middle
  }
  for (let index = low; index < nextIndex; index += 1) {
    const note = previewNoteSchedule[index]!
    if (note.endMs <= previewAnchorPositionMs) continue
    const resolved = resolvePreviewNote(note)
    if (!resolved || !instrument) continue
    const duration = (note.endMs - previewAnchorPositionMs) / 1000 / previewPlaybackSpeed
    const node = instrument.play(resolved.noteName, audioContext.currentTime, {
      gain: getNoteGain(note.velocity),
      duration,
    }) as unknown as { stop: (when?: number) => void }
    scheduledPreviewNodes.add({
      node,
      expiresAt: audioContext.currentTime + duration + PREVIEW_NODE_RETENTION_SECONDS,
      startMs: previewAnchorPositionMs,
      endMs: note.endMs,
      pitch: resolved.pitch,
      noteName: resolved.noteName,
    })
  }
  schedulePreviewWindow()
  if (!isPlaying || isPaused) return
  previewSchedulerTimer = window.setInterval(schedulePreviewWindow, PREVIEW_SCHEDULER_INTERVAL_MS)
}

function rebuildActivePreviewSchedule(): void {
  if (!isPlaying || isPaused) return
  startPreviewScheduler(getScheduledPreviewPositionMs())
}

/**
 * @description: 获取当前加载曲目的键盘演奏时间表
 * @return {KeyboardScheduleNote[]} 音符时间表（原速音乐时间，播放速度由消费方处理）
 */
export function getKeyboardNoteSchedule(): KeyboardScheduleNote[] {
  return keyboardNoteSchedule
}

/**
 * @description: 初始化音频上下文和合成器
 */
async function initInstrument(): Promise<void> {
  if (!audioContext) audioContext = new AudioContext()
  initOutputNodes()
  if (instrument) return
  if (!instrumentPromise) {
    instrumentPromise = soundfont
      .instrument(audioContext, '/soundfonts/acoustic_grand_piano-mp3.js' as never, {
        destination: masterGainNode,
      })
      .then((loaded) => {
        instrument = loaded
      })
      .finally(() => {
        instrumentPromise = null
      })
  }
  await instrumentPromise
}

/**
 * @description: 初始化预览输出链路
 */
function initOutputNodes() {
  if (!audioContext || masterGainNode || compressorNode) return

  masterGainNode = audioContext.createGain()
  compressorNode = audioContext.createDynamicsCompressor()
  compressorNode.threshold.value = -18
  compressorNode.knee.value = 18
  compressorNode.ratio.value = 8
  compressorNode.attack.value = 0.003
  compressorNode.release.value = 0.22

  masterGainNode.connect(compressorNode)
  compressorNode.connect(audioContext.destination)
  applyMasterVolume()
}

/**
 * @description: 将当前音量应用到主输出增益
 */
function applyMasterVolume() {
  if (!masterGainNode || !audioContext) return

  const targetGain =
    currentVolume <= 0 ? 0 : Math.max(MIN_AUDIBLE_GAIN, currentVolume * PREVIEW_MASTER_GAIN)
  masterGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.01)
}

/**
 * @description: 计算音符播放增益
 * @param {number} velocity - MIDI 力度
 * @return {number} 应用于 soundfont-player 的增益
 */
function getNoteGain(velocity: number): number {
  const normalizedVelocity =
    Math.max(0, Math.min(MIDI_VELOCITY_NORMALIZER, velocity)) / MIDI_VELOCITY_NORMALIZER
  return Math.max(0.05, normalizedVelocity) * NOTE_INPUT_GAIN
}

/** 通知活跃音符变化 */
function notifyActiveNotesChange() {
  if (onActiveNotesChange) {
    onActiveNotesChange(
      Array.from(activeNotes.values()).map((note) => ({
        pitch: note.pitch,
        noteName: note.noteName,
      }))
    )
  }
}

/**
 * @description: 设置禁用的音轨
 */
export function setDisabledTracks(tracks: Set<number>) {
  disabledTracks = tracks
  rebuildActivePreviewSchedule()
}

/**
 * @description: 获取禁用的音轨
 */
export function getDisabledTracks(): Set<number> {
  return disabledTracks
}

/** 试听初始化参数；MIDI tick 文档是音符、播放头和总时长的唯一时间源。 */
export interface MidiPreviewOptions {
  /** Rust 解析的完整 MIDI 文档。 */
  midi: MidiInfo
  /** 原曲时间，单位毫秒；seek 首次加载也可直接从这里准备。 */
  positionMs?: number
  /** false 时只准备播放会话，不提交音符到 WebAudio。 */
  autoPlay?: boolean
}

/**
 * @description: 准备或播放 MIDI；旧解析器仅为游戏按键提供既有事件表。
 * @param {ArrayBuffer} midiData - 原始二进制，保持模拟按键解析来源不变
 * @param {number} speed - 试听速度倍率
 * @param {MidiPreviewOptions} options - 试听权威文档、初始位置与播放状态
 * @return {Promise<{stop: () => void}>} 仅可停止本会话的句柄
 */
export async function playMidi(
  midiData: ArrayBuffer,
  speed: number,
  options: MidiPreviewOptions
): Promise<{ stop: () => void }> {
  stop()
  const sessionId = audioSessionId
  const operationId = ++audioOperationId
  await initInstrument()
  if (sessionId !== audioSessionId || operationId !== audioOperationId) return { stop: () => {} }
  if (options.autoPlay !== false && audioContext?.state === 'suspended') {
    await audioContext.resume()
    if (sessionId !== audioSessionId || operationId !== audioOperationId) return { stop: () => {} }
  }
  previewPlaybackSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1
  // 以下三步保持旧模拟按键输入构建顺序；试听不再使用它的 BPM 或事件时钟。
  player = new Player()
  player.loadArrayBuffer(midiData)
  ;(player as InstanceType<typeof Player> & { setTempo?: (tempo: number) => void }).setTempo?.(
    player.tempo * speed
  )
  buildKeyboardNoteSchedule(player)
  buildPreviewNoteSchedule(options.midi)
  previewAnchorPositionMs = Math.max(0, Math.min(previewDurationMs, options.positionMs ?? 0))
  isPlaying = true
  isPaused = options.autoPlay === false
  if (!isPaused) startPreviewScheduler(previewAnchorPositionMs)
  return {
    stop: () => {
      if (sessionId === audioSessionId) stop()
    },
  }
}

/**
 * @description: 预加载 MIDI 文件（不播放），返回时长
 */
export async function loadMidiForDuration(
  midiData: ArrayBuffer
): Promise<{ duration: number; player: InstanceType<typeof Player> }> {
  const tempPlayer = new Player()

  tempPlayer.loadArrayBuffer(midiData)
  ;(tempPlayer as any).setTempo?.(tempPlayer.tempo)

  const duration = tempPlayer.getSongTime() * 1000

  return { duration, player: tempPlayer }
}

/**
 * @description: 停止播放
 */
export function stop() {
  audioSessionId += 1
  audioOperationId += 1
  stopPreviewScheduler()
  if (player) {
    player.stop()
    player = null
  }
  isPlaying = false
  isPaused = false
  previewAnchorPositionMs = 0
  previewDurationMs = 0
  nextPreviewNoteIndex = 0
  previewNoteSchedule = []
  previewEndPrefix = []
  // 停止所有正在播放的音符
  for (const [_, node] of activeNoteNodes) {
    try {
      node.stop()
    } catch {
      /* 忽略停止失败 */
    }
  }
  activeNoteNodes.clear()
  // 清空活跃音符列表
  activeNotes.clear()
  notifyActiveNotesChange()
}

/**
 * @description: 暂停播放
 */
export function pause() {
  audioOperationId += 1
  if (isPlaying && !isPaused) {
    previewAnchorPositionMs = getScheduledPreviewPositionMs()
    stopPreviewScheduler()
    isPaused = true
    activeNotes.clear()
    notifyActiveNotesChange()
  }
}

/**
 * @description: 继续播放，以音频时钟重新锚定暂停位置
 */
export async function resume(): Promise<void> {
  const sessionId = audioSessionId
  const operationId = ++audioOperationId
  if (isPlaying && isPaused) {
    if (audioContext?.state === 'suspended') await audioContext.resume()
    if (sessionId !== audioSessionId || operationId !== audioOperationId) return
    isPaused = false
    startPreviewScheduler(previewAnchorPositionMs)
  }
}

/**
 * @description: 更新正在运行的试听速度，并以当前音频时钟重新锚定调度器。
 * @param {number} speed - 试听速度倍率
 * @return {void} 无返回值
 */
export function setPreviewSpeed(speed: number): void {
  const nextSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1
  if (!audioContext || !isPlaying || isPaused) {
    previewPlaybackSpeed = nextSpeed
    return
  }
  previewAnchorPositionMs = getScheduledPreviewPositionMs()
  previewPlaybackSpeed = nextSpeed
  startPreviewScheduler(previewAnchorPositionMs)
}

/**
 * @description: 获取当前播放位置（毫秒）
 */
export function getCurrentTime(): number {
  const positionMs = getScheduledPreviewPositionMs()
  const nextActive = new Map<number, { pitch: number; noteName: string }>()
  if (isPlaying && !isPaused) {
    for (const scheduled of scheduledPreviewNodes) {
      if (scheduled.startMs <= positionMs && scheduled.endMs > positionMs) {
        nextActive.set(scheduled.pitch, { pitch: scheduled.pitch, noteName: scheduled.noteName })
      }
    }
  }
  if (
    nextActive.size !== activeNotes.size ||
    [...nextActive.keys()].some((pitch) => !activeNotes.has(pitch))
  ) {
    activeNotes.clear()
    for (const [pitch, note] of nextActive) activeNotes.set(pitch, note)
    notifyActiveNotesChange()
  }
  onTimeUpdate?.(positionMs)
  return positionMs
}

/**
 * @description: 获取完整 MIDI 结束时间（毫秒），包含尾部静音
 * @return {number} 原曲时长
 */
export function getTotalDuration(): number {
  return previewDurationMs
}

/**
 * @description: 移动音频会话到原曲时间；不经过整数 BPM 或延迟 play 任务。
 * @param {number} timeMs - 原曲位置，毫秒
 * @param {{autoPlay?: boolean}} options - 是否继续播放
 * @return {void} 无返回值
 */
export function seekTo(timeMs: number, options: { autoPlay?: boolean } = {}): void {
  audioOperationId += 1
  if (!player) return
  stopPreviewScheduler()
  previewAnchorPositionMs = Math.max(
    0,
    Math.min(previewDurationMs, Number.isFinite(timeMs) ? timeMs : 0)
  )
  isPlaying = true
  isPaused = options.autoPlay === false
  activeNotes.clear()
  notifyActiveNotesChange()
  if (!isPaused) startPreviewScheduler(previewAnchorPositionMs)
}

/**
 * @description: 设置音量（0-1）
 */
export function setVolume(value: number) {
  currentVolume = Math.max(0, Math.min(1, value))
  applyMasterVolume()
}

/**
 * @description: 获取当前音量
 */
export function getVolume(): number {
  return currentVolume
}

/**
 * @description: 设置回调函数
 */
export function setCallbacks(
  timeUpdate: ((time: number) => void) | null,
  endCallback: (() => void) | null
) {
  onTimeUpdate = timeUpdate
  onEndCallback = endCallback
}

/**
 * @description: 停止预览
 */
export function stopPreview() {
  stop()
}

/**
 * @description: 暂停预览
 */
export function pausePreview() {
  pause()
}

/**
 * @description: 继续预览
 */
export async function resumePreview(): Promise<void> {
  await resume()
}

/**
 * @description: 播放所有音符
 */
export async function previewAllNotes(
  _events: {
    pitch: number
    velocity: number
    start_tick: number
    end_tick: number
    channel: number
  }[],
  _ticksPerBeat: number,
  _tempo: number = 500000,
  _speed: number = 1.0
): Promise<{ stop: () => void }> {
  console.error('previewAllNotes is not implemented, use playMidi')
  return { stop }
}

/**
 * @description: 初始化音频上下文和合成器（如果未初始化）
 */
export async function ensureInstrument() {
  await initInstrument()
}

/**
 * @description: 将 MIDI 音符号转换为音符名称
 */
function pitchToNoteName(pitch: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  const noteIndex = pitch % 12
  return `${noteNames[noteIndex]}${octave}`
}

/**
 * @description: 将音符名称转换为 MIDI 音符号
 */
function noteNameToPitch(noteName: string): number | null {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/)
  if (!match) return null
  const [, note, octaveStr] = match
  const octave = parseInt(octaveStr, 10)
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const noteIndex = noteNames.indexOf(note)
  if (noteIndex === -1) return null
  return (octave + 1) * 12 + noteIndex
}

/**
 * @description: 播放单个音符
 * @param {number} pitch MIDI 音符号 (0-127)
 * @param {number} velocity 力度 (0-127)
 * @param {number} duration 持续时间（秒），默认 1 秒
 */
export async function playNote(
  pitch: number,
  velocity: number = 80,
  duration: number = 1
): Promise<void> {
  await ensureInstrument()
  if (!instrument || !audioContext) return

  const noteName = pitchToNoteName(pitch)
  const gain = getNoteGain(velocity)

  // 如果该音高正在播放，先停止它
  const existing = activeNoteNodes.get(noteName)
  if (existing) {
    try {
      existing.stop()
    } catch {
      /* 忽略停止失败 */
    }
  }

  // 播放音符
  const node = instrument.play(noteName, audioContext.currentTime, { gain })
  activeNoteNodes.set(noteName, node)

  // 自动停止（duration 秒后）
  setTimeout(() => {
    const n = activeNoteNodes.get(noteName)
    if (n) {
      try {
        n.stop()
      } catch {
        /* 忽略停止失败 */
      }
      activeNoteNodes.delete(noteName)
    }
  }, duration * 1000)
}

/**
 * @description: 停止单个音符（通过 pitch）
 * @param {number} pitch MIDI 音符号 (0-127)
 */
export function stopNote(pitch: number): void {
  const noteName = pitchToNoteName(pitch)
  const node = activeNoteNodes.get(noteName)
  if (node) {
    try {
      node.stop()
    } catch {
      /* 忽略停止失败 */
    }
    activeNoteNodes.delete(noteName)
  }
}

/**
 * @description: 停止所有正在播放的音符
 */
export function stopAllNotes(): void {
  for (const [_, node] of activeNoteNodes) {
    try {
      node.stop()
    } catch {
      /* 忽略停止失败 */
    }
  }
  activeNoteNodes.clear()
}

/**
 * @description: 获取音频上下文（用于检查状态）
 */
export function getAudioContext(): AudioContext | null {
  return audioContext
}

/**
 * @description: 设置音符过滤器
 * @param filter 返回 true 表示允许播放该音符，传入 null 移除过滤器
 */
export function setNoteFilter(
  filter: ((event: { noteName: string; pitch: number; velocity: number }) => boolean) | null
): void {
  noteFilter = filter
  rebuildActivePreviewSchedule()
}

/**
 * @description: 设置音高映射器（用于 piano 模式将原始音高映射到模板音高）
 * @param mapper 映射函数，输入原始 pitch，返回映射后的 pitch，null 表示该音符不需要播放
 */
export function setPitchMapper(mapper: ((pitch: number) => number | null) | null): void {
  pitchMapper = mapper
  rebuildActivePreviewSchedule()
}

/**
 * @description: 设置活跃音符变化回调（用于同步键盘高亮）
 * @param callback 回调函数，接收当前活跃的音符列表
 */
export function setOnActiveNotesChange(
  callback: ((notes: Array<{ pitch: number; noteName: string }>) => void) | null
): void {
  onActiveNotesChange = callback
}
