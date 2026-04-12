/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-08 13:42:27
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-09 21:56:03
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

/** 播放状态 */
let isPlaying = false
let isPaused = false
let currentVolume = 1 // 音量系数 0-1

/** 禁用的音轨索引集合 */
let disabledTracks: Set<number> = new Set()

/** 回调函数 */
let onTimeUpdate: ((time: number) => void) | null = null
let onEndCallback: (() => void) | null = null

/** 音符过滤器：返回 true 表示允许播放该音符 */
let noteFilter: ((event: { noteName: string; pitch: number; velocity: number }) => boolean) | null =
  null

/** 音高映射器：piano 模式下将原始 pitch 映射到模板音高，返回 null 表示该音符不需要播放 */
let pitchMapper: ((pitch: number) => number | null) | null = null

/** 正在播放的音符节点（key 是 noteName，用于停止特定音符） */
const activeNoteNodes = new Map<string, { stop: () => void }>()

/**
 * @description: 初始化音频上下文和合成器
 */
async function initInstrument() {
  if (!audioContext) {
    audioContext = new AudioContext()
  }

  if (!instrument) {
    // 从本地加载音色（public 目录下的文件可被直接访问）
    instrument = await soundfont.instrument(
      audioContext,
      '/soundfonts/acoustic_grand_piano-mp3.js' as never
    )
  }
}

/**
 * @description: 播放 MIDI 事件
 */
function handleMidiEvent(
  event: { name: string; noteName?: string; velocity: number; track?: number; pitch?: number },
  disabledTracks: Set<number>
) {
  // 确保音频上下文和乐器已初始化
  if (!audioContext || !instrument) {
    return
  }

  // 如果音轨被禁用，跳过播放
  if (event.track !== undefined && disabledTracks.has(event.track)) {
    return
  }

  if (event.name === 'Note on' && event.velocity > 0 && event.noteName) {
    // 从 noteName 获取 pitch
    const originalPitch = noteNameToPitch(event.noteName)

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
    const node = instrument.play(targetNoteName, audioContext.currentTime, {
      gain: (event.velocity / 100) * currentVolume,
    })
    // 存储节点（用于停止特定音符）
    activeNoteNodes.set(targetNoteName, node)
  }

  // Note off 或 velocity 为 0 时不主动停止，让音符自然衰减
  if (
    (event.name === 'Note off' || (event.name === 'Note on' && event.velocity === 0)) &&
    event.noteName
  ) {
    // 不调用 stop()，音符自然衰减
    // 注意：如果有 pitchMapper，Note off 也需要知道映射后的 noteName
    const originalPitch = noteNameToPitch(event.noteName)
    let targetNoteName = event.noteName
    if (pitchMapper && originalPitch !== null) {
      const mappedPitch = pitchMapper(originalPitch)
      if (mappedPitch !== null && mappedPitch !== originalPitch) {
        targetNoteName = pitchToNoteName(mappedPitch)
      }
    }
    activeNoteNodes.delete(targetNoteName)
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

  player = new Player(
    (event: {
      name: string
      noteName?: string
      velocity: number
      track?: number
      pitch?: number
    }) => {
      if (isPlaying && !isPaused) {
        handleMidiEvent(event, disabledTracks)
      }
    }
  )

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
    onEndCallback?.()
  })

  player.loadArrayBuffer(midiData)
  ;(player as any).setTempo?.((player as any).tempo * speed)

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
  // 停止所有正在播放的音符
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
  const gain = (velocity / 100) * currentVolume

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
