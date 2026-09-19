/**
 * @fileOverview MIDI 编辑器试听
 * @description 用 `@strawberrybear/midi-editor` 的 EditorTransport 驱动 soundfont 发声，
 * 与全局播放器互斥：开始试听即暂停全局试听，全局试听恢复时暂停编辑器；绝不触发游戏按键。
 */
import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { createEditorTransport } from '@strawberrybear/midi-editor'
import type {
  EditorTransport,
  EditorTransportState,
  MidiProjectLoop,
  SynthPort,
} from '@strawberrybear/midi-editor'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type { PianoRollTransport } from '@strawberrybear/piano-roll/browser'
import {
  ensureAudioRunning,
  getAudioClock,
  scheduleNote,
  type ScheduledNoteHandle,
} from '@/lib/midiPlayer'
import { usePlayerStore } from '@/stores/player'

/** 试听单音（点击琴键/选中音符）的默认时长（秒）。 */
const AUDITION_SECONDS = 0.35

/**
 * @description: 基于共享 soundfont 的发声端口；按音高维护 FIFO，noteOff 释放最早未释放的节点。
 * @return {SynthPort} 端口
 */
function createSoundfontPort(): SynthPort {
  const active = new Map<number, ScheduledNoteHandle[]>()
  return {
    noteOn(pitch, velocity, when) {
      const handle = scheduleNote(pitch, velocity, when)
      if (!handle) return
      const queue = active.get(pitch)
      if (queue) queue.push(handle)
      else active.set(pitch, [handle])
    },
    noteOff(pitch, when) {
      const queue = active.get(pitch)
      const handle = queue?.shift()
      handle?.stop(when)
      if (queue && queue.length === 0) active.delete(pitch)
    },
    allNotesOff() {
      for (const queue of active.values()) for (const handle of queue) handle.stop()
      active.clear()
    },
  }
}

/**
 * @description: 编辑器试听控制
 * @param {Ref<PianoRollDocument | null>} document 当前文档；变化后自动重建事件表
 * @param {Ref<MidiProjectLoop | null | undefined>} loop 循环区间
 * @param {(frame: PianoRollTransport) => void} onFrame 播放中每帧回调，宿主直接推给视图控制器
 */
export function useMidiEditorPlayback(
  document: Ref<PianoRollDocument | null>,
  loop: Ref<MidiProjectLoop | null | undefined>,
  onFrame: (frame: PianoRollTransport) => void
) {
  const playerStore = usePlayerStore()
  const synth = createSoundfontPort()
  /** 状态变化（播放/暂停/seek）时更新，供视图 prop 与工具栏使用；逐帧位置走 onFrame。 */
  const transport = shallowRef<PianoRollTransport>({
    positionSeconds: 0,
    isPlaying: false,
    playbackRate: 1,
  })
  const isPlaying = shallowRef(false)
  const positionSeconds = shallowRef(0)
  let engine: EditorTransport | null = null
  let frameHandle: number | null = null

  function toFrame(state: EditorTransportState): PianoRollTransport {
    return {
      positionSeconds: state.positionSeconds,
      isPlaying: state.isPlaying,
      playbackRate: state.playbackRate,
    }
  }

  function stopFrames(): void {
    if (frameHandle !== null) cancelAnimationFrame(frameHandle)
    frameHandle = null
  }
  function frame(): void {
    frameHandle = null
    if (!engine) return
    const state = engine.getState()
    positionSeconds.value = state.positionSeconds
    onFrame(toFrame(state))
    if (state.isPlaying) frameHandle = requestAnimationFrame(frame)
  }

  function handleChange(state: EditorTransportState): void {
    transport.value = toFrame(state)
    isPlaying.value = state.isPlaying
    positionSeconds.value = state.positionSeconds
    onFrame(transport.value)
    if (state.isPlaying && frameHandle === null) frameHandle = requestAnimationFrame(frame)
    if (!state.isPlaying) stopFrames()
  }

  /** 首次播放时才创建调度器，此时音频上下文已就绪，时钟与 soundfont 同源。 */
  function ensureEngine(): EditorTransport | null {
    if (engine || !document.value) return engine
    engine = createEditorTransport({
      getDocument: () => document.value!,
      synth,
      now: getAudioClock,
      onChange: handleChange,
    })
    engine.setLoop(loop.value ?? null)
    return engine
  }

  /**
   * @description: 开始试听；先暂停全局播放器的试听
   * @param {number} [fromSeconds] 起点
   * @return {Promise<void>}
   */
  async function play(fromSeconds?: number): Promise<void> {
    await ensureAudioRunning()
    const target = ensureEngine()
    if (!target) return
    playerStore.pausePreviewPlayback()
    target.play(fromSeconds)
  }
  function pause(): void {
    engine?.pause()
  }
  function stop(): void {
    engine?.stop()
  }
  function toggle(): Promise<void> | void {
    return isPlaying.value ? pause() : play()
  }
  /**
   * @description: 跳转；未创建引擎时只更新展示位置
   * @param {number} seconds 目标秒
   * @return {void}
   */
  function seek(seconds: number): void {
    if (engine) engine.seek(seconds)
    else {
      positionSeconds.value = Math.max(0, seconds)
      transport.value = { ...transport.value, positionSeconds: positionSeconds.value }
      onFrame(transport.value)
    }
  }

  /**
   * @description: 试听单个音高（点击琴键/改音高时）
   * @param {number} pitch 音高
   * @param {number} velocity 力度
   * @return {Promise<void>}
   */
  async function audition(pitch: number, velocity: number): Promise<void> {
    await ensureAudioRunning()
    scheduleNote(pitch, velocity, getAudioClock(), AUDITION_SECONDS)
  }

  watch(document, () => engine?.invalidate())
  watch(loop, (next) => engine?.setLoop(next ?? null), { deep: true })
  // 全局播放器开始试听时让位，避免两路声音叠加。
  watch(
    () => playerStore.isPreviewPlaying,
    (playing) => {
      if (playing) pause()
    }
  )

  function dispose(): void {
    stopFrames()
    engine?.dispose()
    engine = null
    synth.allNotesOff()
  }
  onBeforeUnmount(dispose)

  return { transport, isPlaying, positionSeconds, play, pause, stop, toggle, seek, audition, dispose }
}
