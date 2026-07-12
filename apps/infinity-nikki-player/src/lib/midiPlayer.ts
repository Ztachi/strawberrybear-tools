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
 * 使用 midi-player-js 解析 + soundfont-player 发声
 */
import MidiPlayer from 'midi-player-js'
import soundfont from 'soundfont-player'

const { Player } = MidiPlayer

/** 播放器实例 */
let player: InstanceType<typeof Player> | null = null

/** 音频上下文 */
let audioContext: AudioContext | null = null

/** 合成器 */
let instrument: soundfont.Player | null = null

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
  pitch: number
  noteName: string
  velocity: number
  track?: number
}

/** 已交给 Web Audio 的节点记录，用于暂停、跳转和切歌时统一取消。 */
interface ScheduledPreviewNode {
  node: { stop: (when?: number) => void }
  expiresAt: number
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

/** 将 MIDI NoteOn 预编译为以原速音乐时间表示的试听时间轴。 */
function buildPreviewNoteSchedule(playerInstance: InstanceType<typeof Player>): void {
  const playerEvents =
    (playerInstance as InstanceType<typeof Player> & { events?: MidiPlaybackEvent[][] }).events ??
    []

  previewNoteSchedule = playerEvents
    .flatMap((trackEvents) =>
      trackEvents
        .filter(
          (event) =>
            event.name === 'Note on' &&
            event.velocity > 0 &&
            event.noteName &&
            event.tick !== undefined
        )
        .map((event) => ({
          startMs: playerInstance.ticksToSeconds(0, event.tick!) * 1000,
          pitch: event.noteNumber ?? noteNameToPitch(event.noteName!) ?? 60,
          noteName: event.noteName!,
          velocity: event.velocity,
          track: event.track,
        }))
    )
    .sort((a, b) => a.startMs - b.startMs)
}

function getScheduledPreviewPositionMs(): number {
  if (!audioContext || !isPlaying || isPaused) return previewAnchorPositionMs
  return Math.max(
    0,
    previewAnchorPositionMs +
      (audioContext.currentTime - previewAnchorContextTime) * 1000 * previewPlaybackSpeed
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
    const node = instrument.play(resolved.noteName, when, {
      gain: getNoteGain(note.velocity),
    }) as unknown as { stop: (when?: number) => void }
    scheduledPreviewNodes.add({
      node,
      expiresAt: when + PREVIEW_NODE_RETENTION_SECONDS,
    })
  }
}

function startPreviewScheduler(positionMs: number): void {
  if (!audioContext) return
  stopPreviewScheduler()
  previewAnchorPositionMs = Math.max(0, positionMs)
  previewAnchorContextTime = audioContext.currentTime
  nextPreviewNoteIndex = findPreviewNoteIndex(previewAnchorPositionMs)
  schedulePreviewWindow()
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
async function initInstrument() {
  if (!audioContext) {
    audioContext = new AudioContext()
  }

  initOutputNodes()

  if (!instrument) {
    // 从本地加载音色（public 目录下的文件可被直接访问）
    instrument = await soundfont.instrument(
      audioContext,
      '/soundfonts/acoustic_grand_piano-mp3.js' as never,
      { destination: masterGainNode }
    )
  }
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

/**
 * @description: 播放 MIDI 事件
 */
function handleMidiEvent(
  event: MidiPlaybackEvent,
  disabledTracks: Set<number>,
  options: { playAudio?: boolean } = {}
) {
  // 确保音频上下文和乐器已初始化
  if (!audioContext || !instrument) {
    return
  }

  const isTrackDisabled = event.track !== undefined && disabledTracks.has(event.track)

  if (event.name === 'Note on' && event.velocity > 0 && event.noteName && !isTrackDisabled) {
    // 直接使用 noteNumber（MIDI 标准），如果不存在则从 noteName 解析
    const noteNumber = event.noteNumber
    const originalPitch = noteNumber ?? noteNameToPitch(event.noteName)

    // 如果有音高映射器，先转换音高
    let targetPitch = originalPitch ?? 60
    let targetNoteName = event.noteName
    if (pitchMapper && originalPitch !== null) {
      const mappedPitch = pitchMapper(originalPitch)
      if (mappedPitch === null) {
        return // 该音符不需要播放
      }
      targetPitch = mappedPitch
      targetNoteName = pitchToNoteName(targetPitch)
    }

    // 如果有音符过滤器，用映射后的音高检查是否允许播放
    if (noteFilter) {
      const allowed = noteFilter({
        noteName: targetNoteName,
        pitch: targetPitch,
        velocity: event.velocity,
      })
      if (!allowed) {
        return
      }
    }

    // 播放音符
    if (options.playAudio !== false) {
      const node = instrument.play(targetNoteName, audioContext.currentTime, {
        gain: getNoteGain(event.velocity),
      })
      // 存储节点（用于停止特定音符）
      activeNoteNodes.set(targetNoteName, node)
    }

    // 追踪活跃音符（用于同步键盘高亮），用 pitch 作为唯一 key
    activeNotes.set(targetPitch, { pitch: targetPitch, noteName: targetNoteName })
    notifyActiveNotesChange()
  }

  // Note off 或 velocity 为 0 时不主动停止，让音符自然衰减
  if (
    (event.name === 'Note off' || (event.name === 'Note on' && event.velocity === 0)) &&
    event.noteName
  ) {
    // 直接使用 noteNumber（MIDI 标准），如果不存在则从 noteName 解析
    const noteNumber = event.noteNumber
    const originalPitch = noteNumber ?? noteNameToPitch(event.noteName)
    let targetPitch = originalPitch ?? 0

    if (pitchMapper && originalPitch !== null) {
      const mappedPitch = pitchMapper(originalPitch)
      if (mappedPitch !== null) {
        targetPitch = mappedPitch
      }
    }

    activeNoteNodes.delete(pitchToNoteName(targetPitch))
    // 移除活跃音符
    activeNotes.delete(targetPitch)
    notifyActiveNotesChange()
  }
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

/**
 * @description: 播放 MIDI 文件
 */
export async function playMidi(
  midiData: ArrayBuffer,
  speed: number = 1.0
): Promise<{ stop: () => void }> {
  stop()

  await initInstrument()
  previewPlaybackSpeed = Math.max(0.01, speed)

  player = new Player((event: MidiPlaybackEvent) => {
    if (isPlaying && !isPaused) {
      // midi-player-js 仅维护解析进度和高亮；声音已提前提交给 Web Audio 时间轴。
      handleMidiEvent(event, disabledTracks, { playAudio: false })
    }
  })

  player.on('playing', () => {
    if (!isPaused && player) {
      const remainingTime = player.getSongTimeRemaining()
      const totalTime = player.getSongTime()
      const currentTime = (totalTime - remainingTime) * 1000
      onTimeUpdate?.(currentTime)
    }
  })

  player.on('endOfFile', () => {
    isPlaying = false
    isPaused = false
    stopPreviewScheduler()
    onEndCallback?.()
  })

  player.loadArrayBuffer(midiData)
  ;(player as any).setTempo?.((player as any).tempo * speed)
  buildKeyboardNoteSchedule(player)
  buildPreviewNoteSchedule(player)

  isPlaying = true
  isPaused = false
  startPreviewScheduler(0)
  player.play()

  return { stop }
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
  stopPreviewScheduler()
  if (player) {
    player.stop()
    player = null
  }
  isPlaying = false
  isPaused = false
  previewAnchorPositionMs = 0
  nextPreviewNoteIndex = 0
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
  if (isPlaying && !isPaused) {
    previewAnchorPositionMs = getScheduledPreviewPositionMs()
    stopPreviewScheduler()
    isPaused = true
    player?.pause()
  }
}

/**
 * @description: 继续播放（midi-player-js 用 play() 代替 resume）
 */
export function resume() {
  if (isPlaying && isPaused) {
    isPaused = false
    startPreviewScheduler(previewAnchorPositionMs)
    player?.play()
  }
}

/**
 * @description: 获取当前播放位置（毫秒）
 */
export function getCurrentTime(): number {
  if (!player) return 0
  const totalTime = player.getSongTime()
  const remainingTime = player.getSongTimeRemaining()
  return Math.max(0, (totalTime - remainingTime) * 1000)
}

/**
 * @description: 获取总时长（毫秒）
 */
export function getTotalDuration(): number {
  if (!player) return 0
  return player.getSongTime() * 1000
}

/**
 * @description: 跳转到指定位置（毫秒）
 * @param {number} timeMs - 目标播放位置
 * @param {{ autoPlay?: boolean }} options - 跳转后是否自动恢复播放
 * @return {void} 无返回值
 */
export function seekTo(timeMs: number, options: { autoPlay?: boolean } = {}) {
  if (!player) {
    console.warn('seekTo: player not initialized')
    return
  }
  const seconds = timeMs / 1000
  try {
    stopPreviewScheduler()
    previewAnchorPositionMs = Math.max(0, timeMs)
    player.skipToSeconds(seconds)
    if (options.autoPlay !== false) {
      isPlaying = true
      isPaused = false
      startPreviewScheduler(previewAnchorPositionMs)
      // midi-player-js 的 skip 需要下一轮 play 才能继续推进，停止/归零场景会显式关闭 autoPlay。
      setTimeout(() => {
        player?.play()
      }, 100)
    }
  } catch (e) {
    console.error('seekTo failed:', e)
  }
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
export function resumePreview() {
  resume()
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
