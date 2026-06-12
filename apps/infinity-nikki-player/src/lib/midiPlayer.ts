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

/** 键盘事件回调（MIDI 事件处理时同步调用，不经过 Vue 响应式，精确到每个 NoteOn/NoteOff） */
let keyboardEventCallback:
  | ((
      type: 'on' | 'off',
      pitch: number,
      velocity: number,
      noteInstanceId?: number,
      nextNoteDelayMs?: number
    ) => void)
  | null = null

/** 播放停止回调（用于释放所有按键） */
let onPlaybackStopCallback: (() => void) | null = null

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

interface KeyboardNoteInstance {
  id: number
  targetPitch: number
  nextNoteDelayMs?: number
}

interface KeyboardNotePlan {
  targetPitch: number
  nextNoteDelayMs?: number
}

let nextKeyboardNoteInstanceId = 1
const activeKeyboardNoteInstances = new Map<string, KeyboardNoteInstance[]>()
const keyboardNotePlans = new Map<string, KeyboardNotePlan[]>()

function getKeyboardNoteInstanceKey(event: MidiPlaybackEvent, originalPitch: number): string {
  return `${event.track ?? -1}:${event.channel ?? -1}:${originalPitch}`
}

function getKeyboardNotePlanKey(event: MidiPlaybackEvent, originalPitch: number): string {
  return `${event.track ?? -1}:${event.channel ?? -1}:${originalPitch}:${event.tick ?? -1}`
}

function createKeyboardNoteInstance(
  event: MidiPlaybackEvent,
  originalPitch: number,
  targetPitch: number,
  plan?: KeyboardNotePlan | null
): KeyboardNoteInstance {
  const instance = {
    id: nextKeyboardNoteInstanceId++,
    targetPitch,
    nextNoteDelayMs: plan?.nextNoteDelayMs,
  }
  const key = getKeyboardNoteInstanceKey(event, originalPitch)
  const instances = activeKeyboardNoteInstances.get(key) ?? []
  instances.push(instance)
  activeKeyboardNoteInstances.set(key, instances)
  return instance
}

function shiftKeyboardNoteInstance(
  event: MidiPlaybackEvent,
  originalPitch: number
): KeyboardNoteInstance | null {
  const key = getKeyboardNoteInstanceKey(event, originalPitch)
  const instances = activeKeyboardNoteInstances.get(key)
  const instance = instances?.shift()
  if (instances && instances.length === 0) {
    activeKeyboardNoteInstances.delete(key)
  }
  return instance ?? null
}

function clearKeyboardNoteInstances(): void {
  activeKeyboardNoteInstances.clear()
  keyboardNotePlans.clear()
  nextKeyboardNoteInstanceId = 1
}

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

function shiftKeyboardNotePlan(
  event: MidiPlaybackEvent,
  originalPitch: number
): KeyboardNotePlan | null {
  const key = getKeyboardNotePlanKey(event, originalPitch)
  const plans = keyboardNotePlans.get(key)
  const plan = plans?.shift()
  if (plans && plans.length === 0) {
    keyboardNotePlans.delete(key)
  }
  return plan ?? null
}

function getEventMs(playerInstance: InstanceType<typeof Player>, tick: number): number {
  return playerInstance.ticksToSeconds(0, tick) * 1000
}

function buildKeyboardNotePlans(playerInstance: InstanceType<typeof Player>): void {
  keyboardNotePlans.clear()

  const notes: Array<{
    event: MidiPlaybackEvent
    originalPitch: number
    targetPitch: number
    startMs: number
  }> = []

  for (const trackEvents of playerInstance.events as MidiPlaybackEvent[][]) {
    for (const event of trackEvents) {
      if (event.name !== 'Note on' || event.velocity <= 0 || !event.noteName) continue
      if (event.track !== undefined && disabledTracks.has(event.track)) continue

      const originalPitch = event.noteNumber ?? noteNameToPitch(event.noteName)
      if (originalPitch === null) continue

      const targetPitch = resolveTargetPitchForKeyboard(event)
      if (targetPitch === null) continue

      notes.push({
        event,
        originalPitch,
        targetPitch,
        startMs: getEventMs(playerInstance, event.tick ?? 0),
      })
    }
  }

  notes.sort((a, b) => a.startMs - b.startMs)

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    let nextNote: (typeof notes)[number] | undefined
    for (let j = i + 1; j < notes.length; j++) {
      if (notes[j].startMs > note.startMs) {
        nextNote = notes[j]
        break
      }
    }

    const plan: KeyboardNotePlan = {
      targetPitch: note.targetPitch,
      nextNoteDelayMs: nextNote ? Math.max(0, nextNote.startMs - note.startMs) : undefined,
    }
    const key = getKeyboardNotePlanKey(note.event, note.originalPitch)
    const existing = keyboardNotePlans.get(key) ?? []
    existing.push(plan)
    keyboardNotePlans.set(key, existing)
  }
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
function handleMidiEvent(event: MidiPlaybackEvent, disabledTracks: Set<number>) {
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

    const keyboardNoteInstance = createKeyboardNoteInstance(
      event,
      originalPitch ?? targetPitch,
      targetPitch,
      shiftKeyboardNotePlan(event, originalPitch ?? targetPitch)
    )

    // 同步通知键盘事件（精确到每个 NoteOn，不经过 Vue 批处理）
    keyboardEventCallback?.(
      'on',
      targetPitch,
      event.velocity,
      keyboardNoteInstance.id,
      keyboardNoteInstance.nextNoteDelayMs
    )

    // 播放音符
    const node = instrument.play(targetNoteName, audioContext.currentTime, {
      gain: getNoteGain(event.velocity),
    })
    // 存储节点（用于停止特定音符）
    activeNoteNodes.set(targetNoteName, node)

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
    const keyboardNoteInstance =
      originalPitch !== null ? shiftKeyboardNoteInstance(event, originalPitch) : null
    let targetPitch = keyboardNoteInstance?.targetPitch ?? originalPitch ?? 0

    if (!keyboardNoteInstance && pitchMapper && originalPitch !== null) {
      const mappedPitch = pitchMapper(originalPitch)
      if (mappedPitch !== null) {
        targetPitch = mappedPitch
      }
    }

    // 只释放曾经创建过的键盘实例；过滤或禁用掉的 NoteOn 没有对应真实按键。
    if (keyboardNoteInstance) {
      keyboardEventCallback?.('off', targetPitch, 0, keyboardNoteInstance.id)
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

  player = new Player((event: MidiPlaybackEvent) => {
    if (isPlaying && !isPaused) {
      handleMidiEvent(event, disabledTracks)
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
    clearKeyboardNoteInstances()
    // 释放所有按键（与 stop() 保持一致）
    onPlaybackStopCallback?.()
    onEndCallback?.()
  })

  player.loadArrayBuffer(midiData)
  ;(player as any).setTempo?.((player as any).tempo * speed)
  buildKeyboardNotePlans(player)

  isPlaying = true
  isPaused = false
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
  if (player) {
    player.stop()
    player = null
  }
  isPlaying = false
  isPaused = false
  // 通知释放所有按键
  onPlaybackStopCallback?.()
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
  clearKeyboardNoteInstances()
  notifyActiveNotesChange()
}

/**
 * @description: 暂停播放
 */
export function pause() {
  if (isPlaying && !isPaused) {
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
 */
export function seekTo(timeMs: number) {
  if (!player) {
    console.warn('seekTo: player not initialized')
    return
  }
  const seconds = timeMs / 1000
  try {
    player.skipToSeconds(seconds)
    setTimeout(() => {
      player?.play()
    }, 100)
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
}

/**
 * @description: 设置音高映射器（用于 piano 模式将原始音高映射到模板音高）
 * @param mapper 映射函数，输入原始 pitch，返回映射后的 pitch，null 表示该音符不需要播放
 */
export function setPitchMapper(mapper: ((pitch: number) => number | null) | null): void {
  pitchMapper = mapper
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

/**
 * @description: 设置键盘事件回调（每个 NoteOn/NoteOff 同步调用，不经过 Vue 响应式）
 * @param cb 回调函数，type='on' 表示按下，type='off' 表示释放，pitch 是映射后的音高
 */
export function setKeyboardEventCallback(
  cb:
    | ((
        type: 'on' | 'off',
        pitch: number,
        velocity: number,
        noteInstanceId?: number,
        nextNoteDelayMs?: number
      ) => void)
    | null
): void {
  keyboardEventCallback = cb
}

/**
 * @description: 设置播放停止回调（用于释放所有按键）
 */
export function setOnPlaybackStopCallback(cb: (() => void) | null): void {
  onPlaybackStopCallback = cb
}
