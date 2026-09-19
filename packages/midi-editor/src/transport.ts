import { createTimeline } from '@strawberrybear/piano-roll/core'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type { MidiProjectLoop } from './model'

/** 发声端口；时间均为音频时钟秒（与 `now()` 同源），由宿主用 WebAudio 等实现。 */
export interface SynthPort {
  /** 在 whenSeconds 触发音符。 */
  noteOn(pitch: number, velocity: number, whenSeconds: number): void
  /** 在 whenSeconds 释放音符。 */
  noteOff(pitch: number, whenSeconds: number): void
  /** 立即停止所有正在发声的音符，并取消尚未触发的排程。 */
  allNotesOff(): void
}

/** 试听状态快照。 */
export interface EditorTransportState {
  /** 当前歌曲位置（原曲秒）。 */
  positionSeconds: number
  isPlaying: boolean
  playbackRate: number
  /** 当前循环区间（原曲秒），无循环为 null。 */
  loop: { startSeconds: number; endSeconds: number } | null
  durationSeconds: number
}

/** 试听调度器选项。 */
export interface EditorTransportOptions {
  /** 每次调度读取最新文档；文档替换后需调用 `invalidate()`。 */
  getDocument: () => PianoRollDocument
  synth: SynthPort
  /** 音频时钟（秒）。默认 `performance.now() / 1000`。 */
  now?: () => number
  /** 向前排程的时间窗（秒），默认 0.15。 */
  lookaheadSeconds?: number
  /** 调度轮询间隔（毫秒），默认 25。 */
  intervalMs?: number
  /** 状态变化回调（播放/暂停/seek/循环/倍速），不含逐帧位置。 */
  onChange?: (state: EditorTransportState) => void
  /** 自然播放到结尾时触发。 */
  onEnded?: () => void
}

/** 试听调度器。 */
export interface EditorTransport {
  play(fromSeconds?: number): void
  pause(): void
  /** 停止并回到循环起点或 0。 */
  stop(): void
  seek(seconds: number): void
  /** 以 tick 设置循环区间；非法或 end<=start 视为取消。 */
  setLoop(loop: MidiProjectLoop | null): void
  setRate(rate: number): void
  /** 文档变化后重建事件表；播放中从当前位置继续。 */
  invalidate(): void
  getState(): EditorTransportState
  dispose(): void
}

/** 预排序的可播放事件（原曲秒）。 */
interface ScheduledNote {
  start: number
  end: number
  pitch: number
  velocity: number
}

/** 第一个 start >= target 的下标。 */
function lowerBound(notes: readonly ScheduledNote[], target: number): number {
  let low = 0
  let high = notes.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (notes[middle]!.start < target) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * @description: 创建基于 lookahead 的试听调度器；位置由音频时钟推导，不自行累加。
 * @param {EditorTransportOptions} options 文档来源、发声端口与时钟
 * @return {EditorTransport} 调度器
 */
export function createEditorTransport(options: EditorTransportOptions): EditorTransport {
  const now = options.now ?? (() => performance.now() / 1000)
  const lookahead = options.lookaheadSeconds ?? 0.15
  const intervalMs = options.intervalMs ?? 25

  let notes: ScheduledNote[] = []
  let duration = 0
  let loopTicks: MidiProjectLoop | null = null
  let loop: { start: number; end: number } | null = null
  let rate = 1
  let playing = false
  let position = 0
  /** 播放锚点：歌曲 anchorPos 秒对应音频时钟 anchorClock 秒。 */
  let anchorClock = 0
  let anchorPos = 0
  /** 下一个待排程事件下标与已排程到的歌曲时间。 */
  let cursor = 0
  let scheduledUntil = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function rebuild(): void {
    const document = options.getDocument()
    const timeline = createTimeline(document)
    const enabled = new Set(document.tracks.filter((track) => track.enabled).map((track) => track.id))
    notes = document.notes
      .filter((note) => enabled.has(note.trackId))
      .map((note) => ({
        start: timeline.tickToSeconds(note.startTick),
        end: timeline.tickToSeconds(Math.max(note.startTick + 1, note.endTick)),
        pitch: note.pitch,
        velocity: note.velocity,
      }))
      .sort((a, b) => a.start - b.start)
    duration = timeline.durationSeconds
    if (loopTicks && loopTicks.endTick > loopTicks.startTick) {
      const start = timeline.tickToSeconds(loopTicks.startTick)
      const end = timeline.tickToSeconds(loopTicks.endTick)
      loop = end > start ? { start, end } : null
    } else loop = null
  }

  function livePosition(): number {
    if (!playing) return position
    let value = anchorPos + (now() - anchorClock) * rate
    // 调度器已提前把锚点挪到循环起点；这里只兜底两次轮询之间的瞬时越界。
    if (loop && value >= loop.end) value = loop.start + ((value - loop.start) % (loop.end - loop.start))
    return Math.max(0, value)
  }

  function snapshot(): EditorTransportState {
    return {
      positionSeconds: livePosition(),
      isPlaying: playing,
      playbackRate: rate,
      loop: loop ? { startSeconds: loop.start, endSeconds: loop.end } : null,
      durationSeconds: duration,
    }
  }
  function changed(): void {
    options.onChange?.(snapshot())
  }

  function resetCursor(from: number): void {
    cursor = lowerBound(notes, from)
    scheduledUntil = from
  }
  function anchor(at: number): void {
    anchorClock = now()
    anchorPos = at
    resetCursor(at)
  }

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function haltPlayback(): void {
    position = livePosition()
    playing = false
    clearTimer()
    options.synth.allNotesOff()
  }

  function tick(): void {
    timer = null
    if (!playing || disposed) return
    const clock = now()
    // 无循环时自然播放到结尾即结束。
    if (!loop && anchorPos + (clock - anchorClock) * rate >= duration) {
      playing = false
      position = duration
      options.synth.allNotesOff()
      changed()
      options.onEnded?.()
      return
    }
    let guard = 0
    while (guard++ < 64) {
      const horizon = anchorPos + (clock - anchorClock) * rate + lookahead
      const limit = loop ? Math.min(horizon, loop.end) : Math.min(horizon, duration)
      while (cursor < notes.length && notes[cursor]!.start < limit) {
        const note = notes[cursor]!
        cursor += 1
        if (note.start < scheduledUntil) continue
        const onAt = anchorClock + (note.start - anchorPos) / rate
        // 循环时越过终点的尾音在循环终点截断，避免与下一轮重叠。
        const end = loop ? Math.min(note.end, loop.end) : note.end
        options.synth.noteOn(note.pitch, note.velocity, onAt)
        options.synth.noteOff(note.pitch, onAt + Math.max(0.01, end - note.start) / rate)
      }
      scheduledUntil = Math.max(scheduledUntil, limit)
      if (loop && horizon >= loop.end) {
        // 提前把锚点搬到循环起点：终点对应的时钟时刻即新一轮的起点。
        anchorClock += (loop.end - anchorPos) / rate
        anchorPos = loop.start
        resetCursor(loop.start)
        continue
      }
      break
    }
    timer = setTimeout(tick, intervalMs)
  }

  rebuild()

  return {
    play(fromSeconds) {
      if (disposed) return
      if (fromSeconds !== undefined) position = Math.max(0, Math.min(duration, fromSeconds))
      if (playing) return
      if (!loop && position >= duration) position = 0
      if (loop && (position < loop.start || position >= loop.end)) position = loop.start
      playing = true
      anchor(position)
      changed()
      tick()
    },
    pause() {
      if (!playing) return
      haltPlayback()
      changed()
    },
    stop() {
      if (playing) haltPlayback()
      position = loop ? loop.start : 0
      changed()
    },
    seek(seconds) {
      const target = Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0))
      if (playing) {
        options.synth.allNotesOff()
        anchor(target)
      } else position = target
      changed()
    },
    setLoop(next) {
      loopTicks = next && next.endTick > next.startTick ? { ...next } : null
      const current = livePosition()
      rebuild()
      if (playing) {
        options.synth.allNotesOff()
        anchor(loop && (current < loop.start || current >= loop.end) ? loop.start : current)
      }
      changed()
    },
    setRate(next) {
      const value = Number.isFinite(next) && next > 0 ? next : 1
      if (value === rate) return
      const current = livePosition()
      rate = value
      if (playing) {
        // 已排程的音符使用旧倍速时刻，只能整体取消后从当前位置重排。
        options.synth.allNotesOff()
        anchor(current)
      }
      changed()
    },
    invalidate() {
      const current = livePosition()
      rebuild()
      if (playing) {
        options.synth.allNotesOff()
        anchor(Math.min(current, loop ? loop.end : duration))
      } else position = Math.min(current, duration)
    },
    getState: snapshot,
    dispose() {
      if (disposed) return
      if (playing) haltPlayback()
      disposed = true
      clearTimer()
    },
  }
}
