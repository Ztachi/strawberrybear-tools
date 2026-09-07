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
import { getMidiDisplayTitle } from '@/lib/midiDisplay'
import {
  getTotalDuration,
  getMidiSourceDurationMs,
  getCurrentTime as getPreviewAudioTime,
  pausePreview as pausePreviewAudio,
  playMidi as playMidiAudio,
  resumePreview as resumePreviewAudio,
  seekTo,
  setPreviewSpeed,
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
  onMediaSelected?: (media: MediaItem | null) => void | Promise<void>
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
  /** 与二进制属于同一歌曲的 Rust 原始时间轴。 */
  private loadedMidiInfo: MidiInfo | null = null
  /** 底层是否已经建立可 seek/resume 的暂停或播放会话。 */
  private audioPrepared = false
  /** 保护异步音色加载、seek 和切歌完成回写。 */
  private transportRequestId = 0
  /** 当前已加载到 WebAudio 层的媒体 ID，用于发现 UI 当前曲和底层音频不一致的脏状态。 */
  private loadedMediaId: string | null = null
  /** 递增加载令牌，防止较早的异步读取在切歌后覆盖新媒体。 */
  private loadRequestId = 0
  /** 预览进度刷新定时器，播放中按约 60fps 推进 Player 进度。 */
  private previewTimer: number | null = null
  /** 暂停或拖拽时记录的播放位置，单位毫秒。 */
  private pausedAtTime = 0
  /** 拖拽进度条时暂停音频时钟回写，避免 UI 被计时器抢回去。 */
  private dragging = false
  /** 标记下一次 play() 是否复用已准备的音频会话与暂停位置。 */
  private resumePending = false
  /** 下一次 seek 是否即使当前未播放也直接进入播放态。 */
  private forcePlayOnNextSeek = false

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
    const durationMs = getMidiSourceDurationMs(midi)
    return {
      id: midi.filename,
      title: getMidiDisplayTitle(midi),
      url: midi.file_path,
      durationSeconds:
        Math.max(0, Number.isFinite(durationMs) ? durationMs : fallbackDurationMs) / 1000,
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
    const loadedAnotherMidi = this.loadedMediaId !== null && this.loadedMediaId !== midi.filename
    if (loadedAnotherMidi) {
      // 详情查看、导入或队列同步可能只更新公共 Player 当前项，而旧 MIDI 音频仍在内存中。
      // 是否释放旧源只取决于底层实际加载的媒体，不能依赖会被队列同步重置的 UI 状态。
      const stopping = this.player.stop()
      const requestId = this.transportRequestId
      await stopping
      if (requestId !== this.transportRequestId) return
    }
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
  async seekMs(timeMs: number, options: { autoPlay?: boolean } = {}): Promise<void> {
    this.player?.updateProgress(timeMs / 1000, this.getDurationMs() / 1000)
    this.pausedAtTime = timeMs
    if (!this.dragging) {
      this.forcePlayOnNextSeek = options.autoPlay === true
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
   * @description: 更新试听速度，不触碰游戏内模拟按键速度。
   * @param {number} speed - 试听速度倍率
   * @return {void} 无返回值
   */
  setPreviewSpeed(speed: number): void {
    setPreviewSpeed(speed)
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
    void this.stop()
    this.bindings = {}
  }

  /**
   * @description: 加载当前媒体资源
   * @param {MediaItem} media - 公共播放器传入的媒体快照
   * @return {Promise<void>} 加载完成后 resolve
   */
  async load(media: MediaItem): Promise<void> {
    await this.loadMedia(media, ++this.transportRequestId)
  }

  /**
   * @description: 在已有播放请求内加载媒体，保证 seek 不会使自己的令牌失效
   * @param {MediaItem} media - 待读取媒体
   * @param {number} transportId - 发起本次操作的令牌
   * @return {Promise<void>} 读取完成后 resolve
   */
  private async loadMedia(media: MediaItem, transportId: number): Promise<void> {
    const requestId = ++this.loadRequestId
    stopPreviewAudio()
    this.stopPreviewTimer()
    this.audioPrepared = false
    this.loadedMidiData = null
    this.loadedMidiInfo = null
    this.loadedMediaId = null
    this.resumePending = false
    await this.bindings.onMediaSelected?.(media)
    if (requestId !== this.loadRequestId || transportId !== this.transportRequestId) return
    this.bindings.configurePlaybackFilter?.()
    setDisabledTracks(this.bindings.getDisabledTracks?.() ?? new Set())

    const [midiData, midi] = await Promise.all([
      this.readMidiData(media.url),
      this.readMidiInfo(media),
    ])
    if (requestId !== this.loadRequestId || transportId !== this.transportRequestId) return
    this.loadedMidiData = midiData
    this.loadedMidiInfo = midi
    this.loadedMediaId = media.id
    this.pausedAtTime = 0
    this.player?.updateProgress(0, getMidiSourceDurationMs(midi) / 1000)
  }

  /**
   * @description: 开始或恢复平台试听播放，完成回写必须仍属于当前请求
   * @return {Promise<void>} 平台播放命令完成后 resolve
   */
  async play(): Promise<void> {
    const requestId = ++this.transportRequestId
    if (this.resumePending && this.audioPrepared) {
      await resumePreviewAudio()
      if (requestId !== this.transportRequestId) return
      this.resumePending = false
      this.startPreviewTimer()
      return
    }
    if (!this.loadedMidiData || !this.loadedMidiInfo) {
      const media = this.player?.getState().current
      if (!media) return
      await this.loadMedia(media, requestId)
      if (requestId !== this.transportRequestId || !this.loadedMidiData || !this.loadedMidiInfo)
        return
    }
    await playMidiAudio(this.loadedMidiData, this.getPlaybackSpeed(), {
      midi: this.loadedMidiInfo,
      positionMs: this.pausedAtTime,
    })
    if (requestId !== this.transportRequestId) return
    this.audioPrepared = true
    // 音色准备期间用户可能已经改变速度，最终启动以最新设置重新锚定。
    setPreviewSpeed(this.getPlaybackSpeed())
    this.resumePending = false
    this.player?.updateProgress(getPreviewAudioTime() / 1000, getTotalDuration() / 1000)
    this.startPreviewTimer()
  }

  /**
   * @description: 暂停平台试听播放，记录音频时钟已实际推进的位置
   * @return {Promise<void>} 暂停完成后 resolve
   */
  async pause(): Promise<void> {
    this.transportRequestId += 1
    if (!this.audioPrepared) stopPreviewAudio()
    pausePreviewAudio()
    this.pausedAtTime = getPreviewAudioTime()
    this.resumePending = this.audioPrepared
    this.stopPreviewTimer()
    this.player?.updateProgress(this.pausedAtTime / 1000, this.getDurationMs() / 1000)
  }

  /**
   * @description: 停止平台试听播放，使所有旧的读取和音色准备请求失效
   * @return {Promise<void>} 停止完成后 resolve
   */
  async stop(): Promise<void> {
    this.loadRequestId += 1
    this.transportRequestId += 1
    stopPreviewAudio()
    this.stopPreviewTimer()
    this.loadedMidiData = null
    this.loadedMidiInfo = null
    this.loadedMediaId = null
    this.audioPrepared = false
    this.pausedAtTime = 0
    this.resumePending = false
  }

  /**
   * @description: 提交一次 seek；正在播放时继续播放，暂停时准备无声会话供 resume 使用
   * @param {number} positionSeconds - 原曲时间，单位秒
   * @return {Promise<void>} 当前有效请求完成后 resolve
   */
  async seek(positionSeconds: number): Promise<void> {
    const state = this.player?.getState()
    const media = state?.current
    const forcePlay = this.forcePlayOnNextSeek
    this.forcePlayOnNextSeek = false
    const shouldContinuePlaying = forcePlay || state?.status === 'playing'
    const targetMs = Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds * 1000 : 0)
    if (!media) return
    const requestId = ++this.transportRequestId

    // 公共队列选择可能已变更，但旧音频仍在内存；读取新的二进制和 Rust 文档必须一起替换。
    if (this.loadedMediaId !== media.id || !this.loadedMidiData || !this.loadedMidiInfo) {
      await this.loadMedia(media, requestId)
      if (
        requestId !== this.transportRequestId ||
        this.loadedMediaId !== media.id ||
        this.player?.getState().current?.id !== media.id
      )
        return
    }
    if (!this.loadedMidiData || !this.loadedMidiInfo) return
    this.stopPreviewTimer()
    if (!this.audioPrepared) {
      await playMidiAudio(this.loadedMidiData, this.getPlaybackSpeed(), {
        midi: this.loadedMidiInfo,
        positionMs: targetMs,
        autoPlay: shouldContinuePlaying,
      })
      if (requestId !== this.transportRequestId || this.loadedMediaId !== media.id) return
      this.audioPrepared = true
      setPreviewSpeed(this.getPlaybackSpeed())
    } else {
      seekTo(targetMs, { autoPlay: shouldContinuePlaying })
    }
    this.pausedAtTime = getPreviewAudioTime()
    this.resumePending = !shouldContinuePlaying
    if (shouldContinuePlaying) {
      this.startPreviewTimer()
      this.player?.handlePlaying()
    } else {
      this.player?.handlePaused()
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
   * @description: 优先使用与二进制同源的 Rust 时间信息；旧会话元数据缺失时重新解析
   * @param {MediaItem} media - 公共播放器媒体快照
   * @return {Promise<MidiInfo>} 包含完整 tempo map 与结束 tick 的 MIDI 信息
   */
  private async readMidiInfo(media: MediaItem): Promise<MidiInfo> {
    const midi = media.metadata?.midi as MidiInfo | undefined
    if (midi?.duration_ticks !== undefined && midi.tempo_map) return midi
    const [parsed] = await invoke<[MidiInfo, unknown[]]>('parse_midi_file', { path: media.url })
    return parsed
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
    this.previewTimer = window.setInterval(() => {
      if (this.dragging) return
      // 定时器只读取，不生成音乐时间；AudioContext 暂停或设备挂起时，指针与声音一起停止。
      this.pausedAtTime = getPreviewAudioTime()
      const durationMs = getTotalDuration()
      if (this.pausedAtTime >= durationMs) {
        this.stopPreviewTimer()
        this.player?.updateProgress(durationMs / 1000, durationMs / 1000)
        void this.player?.handleEnded()
        return
      }
      this.player?.updateProgress(this.pausedAtTime / 1000, durationMs / 1000)
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
