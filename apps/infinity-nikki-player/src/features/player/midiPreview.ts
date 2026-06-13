/**
 * @fileOverview Infinity Nikki MIDI 试听播放器适配层
 * @description
 * 本文件把应用内的 MIDI 试听能力接入 `@strawberrybear/player`。
 * 公共 Player 负责队列、播放模式和状态机；这里负责读取 MIDI、调用 WebAudio/soundfont 实现、
 * 同步音轨屏蔽和钢琴模式过滤，并把平台事件回灌给 Player。
 */
import { invoke } from '@tauri-apps/api/core'
import type { AudioPlayerPort, MediaItem, Player, PlayerState } from '@strawberrybear/player'
import type { MidiInfo } from '@/types'
import {
  getTotalDuration,
  loadMidiForDuration,
  pausePreview as pausePreviewAudio,
  playMidi as playMidiAudio,
  resumePreview as resumePreviewAudio,
  seekTo,
  setDisabledTracks,
  setVolume as setPreviewAudioVolume,
  stopPreview as stopPreviewAudio,
} from '@/lib/midiPlayer'

/**
 * @description: MIDI 试听适配层绑定项
 * @description 这些回调由 Pinia store 注入，避免平台适配层直接依赖 store 实例。
 */
export interface MidiPreviewPlaybackBindings {
  /** 获取当前被屏蔽的 midi-player-js 音轨集合。 */
  getDisabledTracks?: () => Set<number>
  /** 获取当前播放速度倍率。 */
  getPlaybackSpeed?: () => number
  /** 同步当前播放模式下的音符过滤器和音高映射器。 */
  configurePlaybackFilter?: () => void
  /** 平台加载媒体后通知应用层更新当前 MIDI 选择。 */
  onMediaSelected?: (media: MediaItem | null) => void
}

/** MIDI 试听队列来源，用于保留播放列表语义。 */
export interface MidiPreviewQueueContext {
  /** 队列来源 ID，例如 all 或 song-list-id。 */
  id: string
  /** 队列来源标题。 */
  title: string
}

/**
 * @description: MIDI 试听播放器 feature
 * @description
 * 该类既是 `AudioPlayerPort` 实现，也是应用侧对 MIDI 媒体的轻量 facade。
 * 这样公共 Player 不需要知道 `MidiInfo`、Tauri command、WebAudio 或 soundfont 的存在。
 */
export class MidiPreviewPlaybackFeature implements AudioPlayerPort {
  /** 公共播放器实例；构造顺序上需要先创建 feature，再创建 Player 后回填。 */
  private player: Player | null = null
  /** 应用 store 注入的绑定项，默认空实现，保证 bootstrap 阶段可先创建实例。 */
  private bindings: MidiPreviewPlaybackBindings = {}
  /** 当前已读取到内存的 MIDI 二进制数据，seek/resume 会复用它。 */
  private loadedMidiData: ArrayBuffer | null = null
  /** 预览进度刷新定时器，播放中按约 60fps 推进 Player 进度。 */
  private previewTimer: number | null = null
  /** 播放开始时的 performance 时间戳偏移，用于本地平滑计时。 */
  private playbackStartTime = 0
  /** 暂停或拖拽时记录的播放位置，单位毫秒。 */
  private pausedAtTime = 0
  /** 拖拽进度条时暂停本地计时回写，避免 UI 被计时器抢回去。 */
  private dragging = false
  /** 标记下一次 play() 是否应映射为 midi-player-js 的 resume，而不是重新加载播放。 */
  private resumePending = false

  /**
   * @description: 绑定公共播放器实例
   * @param {Player} player - 应用启动时创建的 Player 实例
   * @return {void} 无返回值
   */
  bindPlayer(player: Player): void {
    this.player = player
  }

  /**
   * @description: 配置应用层绑定项
   * @param {MidiPreviewPlaybackBindings} bindings - 需要注入的回调集合
   * @return {void} 无返回值
   */
  configure(bindings: MidiPreviewPlaybackBindings): void {
    this.bindings = bindings
  }

  /**
   * @description: 将 MIDI 文件转换为播放器媒体项
   * @param {MidiInfo} midi - MIDI 文件信息
   * @param {number} [fallbackDurationMs] - 文件信息缺少时长时使用的兜底时长，单位毫秒
   * @return {MediaItem} 公共播放器可识别的媒体项
   */
  midiToMediaItem(midi: MidiInfo, fallbackDurationMs = 0): MediaItem {
    return {
      id: midi.filename,
      title: midi.filename,
      url: midi.file_path,
      durationSeconds: (midi.duration_ms || fallbackDurationMs || 0) / 1000,
      metadata: { midi },
    }
  }

  /**
   * @description: 根据 MIDI 库同步公共播放器队列
   * @param {MidiInfo[]} library - 当前 MIDI 库列表
   * @param {MidiInfo | null} currentMidi - 当前选中的 MIDI
   * @return {void} 无返回值
   */
  syncLibraryQueue(library: MidiInfo[], currentMidi: MidiInfo | null): void {
    this.syncMidiQueue(library, currentMidi)
  }

  /**
   * @description: 根据任意 MIDI 集合同步公共播放器队列
   * @param {MidiInfo[]} library - 当前播放上下文内的 MIDI 列表
   * @param {MidiInfo | null} currentMidi - 当前选中的 MIDI
   * @param {MidiPreviewQueueContext} [context] - 播放列表来源信息
   * @return {void} 无返回值
   */
  syncMidiQueue(
    library: MidiInfo[],
    currentMidi: MidiInfo | null,
    context?: MidiPreviewQueueContext | null
  ): void {
    if (!this.player) return
    if (!library.length) {
      this.player.clearQueue()
      return
    }
    const items = library.map((midi) => this.midiToMediaItem(midi, this.getDurationMs()))
    const currentIndex = Math.max(
      0,
      items.findIndex((item) => item.id === currentMidi?.filename)
    )
    if (context) {
      this.player.setPlaylist(
        {
          id: context.id,
          title: context.title,
          items,
        },
        currentIndex
      )
      return
    }
    this.player.setQueue(items, currentIndex)
  }

  /**
   * @description: 开始播放指定 MIDI
   * @param {MidiInfo} midi - 待播放 MIDI
   * @param {MidiInfo[]} library - 当前 MIDI 库，用于同步上一曲/下一曲队列
   * @return {Promise<void>} 播放命令完成后 resolve
   */
  async start(
    midi: MidiInfo,
    library: MidiInfo[],
    context?: MidiPreviewQueueContext | null
  ): Promise<void> {
    if (!this.player) return
    this.syncMidiQueue(library, midi, context)
    await this.player.play(this.midiToMediaItem(midi, this.getDurationMs()))
  }

  /**
   * @description: 恢复试听播放
   * @return {Promise<void>} 恢复完成后 resolve
   */
  async resume(): Promise<void> {
    await this.player?.resume()
  }

  /**
   * @description: 播放上一首 MIDI
   * @param {MidiInfo[]} library - 当前 MIDI 库
   * @param {MidiInfo | null} currentMidi - 当前 MIDI
   * @return {Promise<void>} 切换完成后 resolve
   */
  async previous(
    library: MidiInfo[],
    currentMidi: MidiInfo | null,
    context?: MidiPreviewQueueContext | null
  ): Promise<void> {
    if (!this.player) return
    this.syncMidiQueue(library, currentMidi, context)
    await this.player.previous()
  }

  /**
   * @description: 播放下一首 MIDI
   * @param {MidiInfo[]} library - 当前 MIDI 库
   * @param {MidiInfo | null} currentMidi - 当前 MIDI
   * @return {Promise<void>} 切换完成后 resolve
   */
  async next(
    library: MidiInfo[],
    currentMidi: MidiInfo | null,
    context?: MidiPreviewQueueContext | null
  ): Promise<void> {
    if (!this.player) return
    this.syncMidiQueue(library, currentMidi, context)
    await this.player.next()
  }

  /**
   * @description: 仅选择上一首 MIDI
   * @description 悬浮窗切歌后需要先倒计时，因此这里只更新公共队列当前项，不立即发声。
   * @param {MidiInfo[]} library - 当前 MIDI 库
   * @param {MidiInfo | null} currentMidi - 当前 MIDI
   * @return {MediaItem | null} 选中的播放器媒体
   */
  selectPrevious(
    library: MidiInfo[],
    currentMidi: MidiInfo | null,
    context?: MidiPreviewQueueContext | null
  ): MediaItem | null {
    if (!this.player) return null
    this.syncMidiQueue(library, currentMidi, context)
    return this.player.selectPrevious()
  }

  /**
   * @description: 仅选择下一首 MIDI
   * @description 悬浮窗切歌后需要先倒计时，因此这里只更新公共队列当前项，不立即发声。
   * @param {MidiInfo[]} library - 当前 MIDI 库
   * @param {MidiInfo | null} currentMidi - 当前 MIDI
   * @return {MediaItem | null} 选中的播放器媒体
   */
  selectNext(
    library: MidiInfo[],
    currentMidi: MidiInfo | null,
    context?: MidiPreviewQueueContext | null
  ): MediaItem | null {
    if (!this.player) return null
    this.syncMidiQueue(library, currentMidi, context)
    return this.player.selectNext()
  }

  /**
   * @description: 标记进度条拖拽状态
   * @param {boolean} dragging - 是否正在拖拽
   * @return {void} 无返回值
   */
  setDragging(dragging: boolean): void {
    this.dragging = dragging
    if (!dragging) {
      // 拖拽结束后重新锚定计时起点，避免下一帧根据旧起点回跳。
      this.playbackStartTime = performance.now() - this.getPositionMs()
    }
  }

  /**
   * @description: 仅更新预览显示时间
   * @param {number} timeMs - 目标时间，单位毫秒
   * @return {void} 无返回值
   */
  setPreviewTime(timeMs: number): void {
    this.player?.updateProgress(timeMs / 1000, this.getDurationMs() / 1000)
  }

  /**
   * @description: 跳转到指定试听时间
   * @param {number} timeMs - 目标时间，单位毫秒
   * @return {Promise<void>} seek 完成后 resolve
   */
  async seekMs(timeMs: number): Promise<void> {
    this.player?.updateProgress(timeMs / 1000, this.getDurationMs() / 1000)
    this.pausedAtTime = timeMs
    if (!this.dragging) {
      await this.player?.seek(timeMs / 1000)
    }
  }

  /**
   * @description: 重启当前 MIDI，并尽量恢复到原播放位置
   * @param {MidiInfo} midi - 当前 MIDI
   * @param {MidiInfo[]} library - 当前 MIDI 库
   * @return {Promise<void>} 重启完成后 resolve
   */
  async restart(
    midi: MidiInfo,
    library: MidiInfo[],
    context?: MidiPreviewQueueContext | null
  ): Promise<void> {
    const currentTime = this.getPositionMs()
    await this.player?.stop()
    await this.start(midi, library, context)
    if (currentTime > 0) {
      await this.seekMs(currentTime)
    }
  }

  /**
   * @description: 设置试听音量
   * @param {number} volume - 音量，范围 0 到 1
   * @return {Promise<void>} 音量应用完成后 resolve
   */
  async setPreviewVolume(volume: number): Promise<void> {
    await this.player?.setVolume(volume)
  }

  /**
   * @description: 切换静音状态
   * @return {Promise<void>} 静音状态应用完成后 resolve
   */
  async toggleMute(): Promise<void> {
    const muted = this.player?.getState().muted ?? false
    await this.player?.setMuted(!muted)
  }

  /**
   * @description: 将当前 Player 音量状态重新应用到 WebAudio 输出链路
   * @return {void} 无返回值
   */
  applyCurrentVolume(): void {
    const state = this.player?.getState()
    setPreviewAudioVolume(state?.muted ? 0 : (state?.volume ?? 1))
  }

  /**
   * @description: 恢复试听音量状态
   * @param {number} volume - 音量，范围 0 到 1
   * @param {boolean} muted - 是否静音
   * @return {Promise<void>} 状态恢复完成后 resolve
   */
  async restoreVolumeState(volume: number, muted: boolean): Promise<void> {
    await this.player?.setVolume(volume)
    await this.player?.setMuted(muted)
    setPreviewAudioVolume(muted ? 0 : volume)
  }

  /**
   * @description: 刷新当前播放模式过滤器
   * @return {void} 无返回值
   */
  applyPlaybackFilter(): void {
    this.bindings.configurePlaybackFilter?.()
  }

  /**
   * @description: 释放 feature 内部资源
   * @return {void} 无返回值
   */
  dispose(): void {
    this.stopPreviewTimer()
    this.loadedMidiData = null
    this.bindings = {}
  }

  /**
   * @description: 加载当前媒体资源
   * @param {MediaItem} media - 公共播放器传入的媒体快照
   * @return {Promise<void>} 加载完成后 resolve
   */
  async load(media: MediaItem): Promise<void> {
    this.bindings.onMediaSelected?.(media)
    this.bindings.configurePlaybackFilter?.()
    setDisabledTracks(this.bindings.getDisabledTracks?.() ?? new Set())

    this.loadedMidiData = await this.readMidiData(media.url)
    const { duration } = await loadMidiForDuration(this.loadedMidiData)
    this.pausedAtTime = 0
    // 这里只同步总时长，不把 loading 提前改成 playing；真正播放开始由 play() 完成。
    this.player?.updateProgress(0, duration / 1000)
  }

  /**
   * @description: 开始或恢复平台试听播放
   * @return {Promise<void>} 平台播放命令完成后 resolve
   */
  async play(): Promise<void> {
    if (this.resumePending && this.loadedMidiData) {
      // 公共 Player 的 resume 会调用 audio.play；这里需要转成 midi-player-js 的 resume。
      this.resumePending = false
      resumePreviewAudio()
      this.startPreviewTimer()
      return
    }

    if (!this.loadedMidiData) return
    this.resumePending = false
    await playMidiAudio(this.loadedMidiData, this.getPlaybackSpeed())
    const duration = getTotalDuration()
    if (duration > 0) {
      this.player?.updateProgress(this.getPositionMs() / 1000, duration / 1000)
    }
    this.pausedAtTime = this.getPositionMs()
    this.startPreviewTimer()
  }

  /**
   * @description: 暂停平台试听播放
   * @return {Promise<void>} 暂停完成后 resolve
   */
  async pause(): Promise<void> {
    this.pausedAtTime = this.getPositionMs()
    this.resumePending = true
    pausePreviewAudio()
    this.stopPreviewTimer()
  }

  /**
   * @description: 停止平台试听播放
   * @return {Promise<void>} 停止完成后 resolve
   */
  async stop(): Promise<void> {
    stopPreviewAudio()
    this.stopPreviewTimer()
    this.loadedMidiData = null
    this.pausedAtTime = 0
    this.resumePending = false
  }

  /**
   * @description: 跳转平台试听播放位置
   * @param {number} positionSeconds - 目标位置，单位秒
   * @return {Promise<void>} 跳转完成后 resolve
   */
  async seek(positionSeconds: number): Promise<void> {
    const stateBeforeSeek = this.player?.getState()
    const shouldContinuePlaying =
      stateBeforeSeek?.status === 'playing' || stateBeforeSeek?.status === 'loading'

    if (!shouldContinuePlaying && positionSeconds <= 0) {
      // 公共 Player 在停止或播完时会 seek(0) 归位；此时只需要释放平台游标，不能重新发声。
      stopPreviewAudio()
      this.stopPreviewTimer()
      this.loadedMidiData = null
      this.pausedAtTime = 0
      this.resumePending = false
      return
    }

    if (!this.loadedMidiData) {
      const current = this.player?.getState().current
      if (current) {
        this.bindings.configurePlaybackFilter?.()
        setDisabledTracks(this.bindings.getDisabledTracks?.() ?? new Set())
        this.loadedMidiData = await this.readMidiData(current.url)
      }
    }
    if (!this.loadedMidiData) return

    const timeMs = positionSeconds * 1000
    this.resumePending = false
    await playMidiAudio(this.loadedMidiData, this.getPlaybackSpeed())
    seekTo(timeMs, { autoPlay: shouldContinuePlaying })
    this.pausedAtTime = timeMs
    this.playbackStartTime = performance.now() - timeMs
    if (shouldContinuePlaying) {
      this.startPreviewTimer()
      // midi-player-js 的 seek 会重新进入播放态，主动回灌给公共状态机，避免 UI 仍显示 paused。
      this.player?.handlePlaying()
    } else {
      pausePreviewAudio()
      this.stopPreviewTimer()
    }
  }

  /**
   * @description: 设置平台试听音量
   * @param {number} volume - 音量，范围 0 到 1
   * @return {Promise<void>} 音量应用完成后 resolve
   */
  async setVolume(volume: number): Promise<void> {
    setPreviewAudioVolume(volume)
  }

  /**
   * @description: 设置平台试听静音状态
   * @param {boolean} muted - 是否静音
   * @return {Promise<void>} 静音状态应用完成后 resolve
   */
  async setMuted(muted: boolean): Promise<void> {
    const volume = this.player?.getState().volume ?? 1
    setPreviewAudioVolume(muted ? 0 : volume)
  }

  /**
   * @description: 从 Tauri 后端读取 MIDI 二进制数据
   * @param {string} filename - MIDI 文件名或文件路径
   * @return {Promise<ArrayBuffer>} MIDI 二进制数据
   */
  private async readMidiData(filename: string): Promise<ArrayBuffer> {
    const midiData = await invoke<number[]>('read_midi_data', { filename })
    return new Uint8Array(midiData).buffer
  }

  /**
   * @description: 获取当前播放器位置
   * @return {number} 当前播放位置，单位毫秒
   */
  private getPositionMs(): number {
    return (this.player?.getState().positionSeconds ?? 0) * 1000
  }

  /**
   * @description: 获取当前播放器总时长
   * @return {number} 当前媒体总时长，单位毫秒
   */
  private getDurationMs(): number {
    return (this.player?.getState().durationSeconds ?? 0) * 1000
  }

  /**
   * @description: 获取当前播放速度
   * @return {number} 播放速度倍率
   */
  private getPlaybackSpeed(): number {
    const speed = this.bindings.getPlaybackSpeed?.()
    return typeof speed === 'number' && Number.isFinite(speed) && speed > 0 ? speed : 1
  }

  /**
   * @description: 开始本地进度刷新
   * @return {void} 无返回值
   */
  private startPreviewTimer(): void {
    this.stopPreviewTimer()
    this.playbackStartTime = performance.now() - this.pausedAtTime

    this.previewTimer = window.setInterval(() => {
      if (this.dragging) return

      this.pausedAtTime = performance.now() - this.playbackStartTime
      const durationMs = this.getDurationMs()
      if (durationMs > 0 && this.pausedAtTime >= durationMs) {
        this.stopPreviewTimer()
        this.player?.updateProgress(durationMs / 1000, durationMs / 1000)
        void this.player?.handleEnded()
        return
      }
      this.player?.updateProgress(Math.max(0, this.pausedAtTime) / 1000, durationMs / 1000)
    }, 16)
  }

  /**
   * @description: 停止本地进度刷新
   * @return {void} 无返回值
   */
  private stopPreviewTimer(): void {
    if (!this.previewTimer) return
    clearInterval(this.previewTimer)
    this.previewTimer = null
  }
}

/**
 * @description: 从播放器状态中读取 MIDI 元数据
 * @param {PlayerState} state - 播放器状态
 * @return {MidiInfo | null} 当前 MIDI 信息
 */
export function getCurrentMidiFromPlayerState(state: PlayerState): MidiInfo | null {
  return (state.current?.metadata?.midi as MidiInfo | undefined) ?? null
}
