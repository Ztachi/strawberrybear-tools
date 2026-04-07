/**
 * @description: MIDI 播放器工具模块
 * @module midiPlayer
 * 使用 Tone.js 实现跨平台 MIDI 播放
 */
import * as Tone from 'tone'
import type { MelodyEvent, NoteEvent } from '@/types'

/** 单例播放器状态 */
let isInitialized = false
let synth: Tone.PolySynth | null = null
let isPlaying = false
let isPaused = false
let scheduledEvents: number[] = []
let totalDurationSec: number = 0

/**
 * @description: 初始化音频上下文
 */
export async function initAudioContext() {
  if (isInitialized) return

  await Tone.start()
  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.01,
      decay: 0.05,
      sustain: 0.5,
      release: 0.1,
    },
    maxPolyphony: 512,
  }).toDestination()
  synth.volume.value = -6

  isInitialized = true
}

/**
 * @description: 将 MIDI 音符号转换为音名
 */
function midiToNoteName(midiNote: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midiNote / 12) - 1
  const noteIndex = midiNote % 12
  return `${noteNames[noteIndex]}${octave}`
}

/**
 * @description: 清理资源
 */
function cleanup() {
  const transport = Tone.getTransport()
  for (const id of scheduledEvents) {
    transport.clear(id)
  }
  scheduledEvents = []

  transport.stop()
  transport.cancel()

  isPlaying = false
  isPaused = false
}

/**
 * @description: tick 转换为秒
 */
function tickToSec(tick: number, ticksPerBeat: number, tempo: number): number {
  return (tick / ticksPerBeat) * (tempo / 1000000)
}

/**
 * @description: 试听播放（播放所有音符）
 */
export async function previewAllNotes(
  events: NoteEvent[],
  ticksPerBeat: number,
  tempo: number = 500000,
  speed: number = 1.0
): Promise<{ stop: () => void }> {
  if (!synth) {
    await initAudioContext()
  }

  cleanup()

  if (events.length === 0) {
    return { stop: cleanup }
  }

  // 计算总时长
  let maxTick = 0
  for (const event of events) {
    if (event.end_tick > maxTick) maxTick = event.end_tick
  }
  const maxTimeSec = tickToSec(maxTick, ticksPerBeat, tempo)
  totalDurationSec = maxTimeSec / speed

  const transport = Tone.getTransport()
  transport.bpm.value = ((60 * 1000000) / tempo) * speed

  // 调度每个音符
  for (const event of events) {
    const note = midiToNoteName(event.pitch)
    const startSec = tickToSec(event.start_tick, ticksPerBeat, tempo) / speed
    // 音符时长，缩短释放时间避免重叠
    const durationSec = Math.max(
      tickToSec(event.end_tick - event.start_tick, ticksPerBeat, tempo) / speed,
      0.05
    )

    const id = transport.schedule((time) => {
      if (synth && isPlaying) {
        // 使用短释放避免音符重叠
        synth.triggerAttackRelease(note, Math.min(durationSec, 0.5), time)
      }
    }, startSec)
    scheduledEvents.push(id)
  }

  // 调度结束
  const endId = transport.schedule(() => {
    isPlaying = false
    isPaused = false
  }, totalDurationSec)
  scheduledEvents.push(endId)

  isPlaying = true
  isPaused = false

  transport.start()

  return { stop: cleanup }
}

/**
 * @description: 试听播放（仅最高音）
 */
export async function previewMelody(
  melody: MelodyEvent[],
  tempo: number = 500000,
  speed: number = 1.0
): Promise<{ stop: () => void }> {
  if (!synth) {
    await initAudioContext()
  }

  cleanup()

  if (melody.length === 0) {
    return { stop: cleanup }
  }

  let maxTime = 0
  for (const event of melody) {
    const endTime = event.start_ms + event.duration_ms
    if (endTime > maxTime) maxTime = endTime
  }
  totalDurationSec = maxTime / 1000 / speed

  const transport = Tone.getTransport()
  transport.bpm.value = ((60 * 1000000) / tempo) * speed

  for (const event of melody) {
    const note = midiToNoteName(event.pitch)
    const startSec = event.start_ms / 1000 / speed
    const durationSec = Math.max(event.duration_ms / 1000 / speed, 0.05)

    const id = transport.schedule((time) => {
      if (synth && isPlaying) {
        synth.triggerAttackRelease(note, Math.min(durationSec, 0.5), time)
      }
    }, startSec)
    scheduledEvents.push(id)
  }

  const endId = transport.schedule(() => {
    isPlaying = false
    isPaused = false
  }, totalDurationSec)
  scheduledEvents.push(endId)

  isPlaying = true
  isPaused = false

  transport.start()

  return { stop: cleanup }
}

/**
 * @description: 停止播放
 */
export function stopPreview() {
  cleanup()
}

/**
 * @description: 暂停播放
 */
export function pausePreview() {
  if (isPlaying && !isPaused) {
    Tone.getTransport().pause()
    isPaused = true
  }
}

/**
 * @description: 继续播放
 */
export function resumePreview() {
  if (isPlaying && isPaused) {
    Tone.getTransport().start()
    isPaused = false
  }
}

/**
 * @description: 获取当前播放位置（秒）
 */
export function getCurrentTime(): number {
  if (!isPlaying) return 0
  return Tone.getTransport().seconds
}

/**
 * @description: 获取总时长（秒）
 */
export function getTotalDuration(): number {
  if (!isPlaying && !isPaused) return 0
  return totalDurationSec
}

/**
 * @description: 跳转到指定播放位置
 */
export function seekTo(time: number) {
  if (!isPlaying && !isPaused) return
  Tone.getTransport().seconds = time
}

/**
 * @description: 设置音量
 */
export function setVolume(value: number) {
  if (synth) {
    const db = value <= 0 ? -60 : 20 * Math.log10(value)
    synth.volume.value = db
  }
}

/**
 * @description: 获取当前音量
 */
export function getVolume(): number {
  if (synth) {
    const db = synth.volume.value
    if (db <= -60) return 0
    return Math.pow(10, db / 20)
  }
  return 1
}
