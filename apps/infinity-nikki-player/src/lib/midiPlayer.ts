/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-08 13:42:27
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-08 17:13:50
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
  event: { name: string; noteName?: string; velocity: number; track?: number },
  disabledTracks: Set<number>
) {
  if (!instrument || !audioContext) return

  // 如果音轨被禁用，跳过播放
  if (event.track !== undefined && disabledTracks.has(event.track)) {
    return
  }

  if (event.name === 'Note on' && event.velocity > 0 && event.noteName) {
    instrument.play(event.noteName, audioContext.currentTime, {
      gain: (event.velocity / 100) * currentVolume,
    })
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
    (event: { name: string; noteName?: string; velocity: number; track?: number }) => {
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
