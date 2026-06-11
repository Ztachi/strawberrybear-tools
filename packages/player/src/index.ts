/**
 * @fileOverview 平台无关播放器核心
 * @description
 * `@strawberrybear/player` 只负责播放器领域内的调度、队列和状态管理。
 * 真实发声、系统媒体控制、Tauri/Rust 调用、React Native 音频实现等平台能力，
 * 都通过 `AudioPlayerPort` 注入，避免公共库依赖任何具体运行时或 UI 框架。
 */

/** 播放器内部使用的媒体唯一标识。 */
export type PlayerMediaId = string

/** 播放器状态机的所有可见运行状态。 */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error'

/** 队列循环策略。 */
export type RepeatMode = 'none' | 'all' | 'one'

/** 队列随机策略。 */
export type ShuffleMode = 'off' | 'on'

/** 当前媒体自然结束后的处理策略。 */
export type EndBehavior = 'advance' | 'pause' | 'stop'

/** 播放器对外派发的事件类型。 */
export type PlayerEventType = 'statechange' | 'error' | 'ended'

/** 取消事件订阅的函数。 */
export type Unsubscribe = () => void

/**
 * @description: 播放器错误信息
 * @description 公共库只标准化错误结构，不强行解释平台错误码；平台原始错误会保留在 cause 中。
 */
export interface PlayerError {
  /** 稳定错误码，供业务分支、埋点和日志检索使用。 */
  code: string
  /** 可展示或可记录的错误消息。 */
  message: string
  /** 平台层抛出的原始错误对象。 */
  cause?: unknown
}

/**
 * @description: 可播放媒体
 * @description 播放器只识别媒体身份、展示字段和播放地址；业务字段通过 metadata 透传。
 */
export interface MediaItem {
  /** 媒体唯一 ID，同一队列内应保持稳定。 */
  id: PlayerMediaId
  /** 媒体标题，用于播放条、系统媒体信息或日志展示。 */
  title: string
  /** 媒体播放地址或平台层可解析的资源标识。 */
  url: string
  /** 副标题、作者、来源或其他简短说明。 */
  subtitle?: string
  /** 封面图地址，公共库只透传，不做加载。 */
  coverUrl?: string
  /** 媒体总时长，单位秒；未知时由平台进度事件补齐。 */
  durationSeconds?: number
  /** 业务元数据；公共库克隆并透传，不读取内部字段。 */
  metadata?: Record<string, unknown>
}

/**
 * @description: 播放列表
 * @description 播放列表是带有业务身份的队列快照，用于区分“来自列表播放”和“手动编辑队列”。
 */
export interface Playlist {
  /** 播放列表 ID。 */
  id: string
  /** 播放列表标题。 */
  title: string
  /** 播放列表内的媒体项。 */
  items: MediaItem[]
}

/**
 * @description: 平台音频端口
 * @description
 * 端口由应用层实现，公共播放器通过它触发真实播放能力。
 * 端口方法必须以 Promise 表达异步完成或失败，播放器会据此更新状态或进入错误态。
 */
export interface AudioPlayerPort {
  /**
   * @description: 加载媒体资源
   * @param {MediaItem} media - 当前需要播放的媒体快照
   * @return {Promise<void>} 加载完成后 resolve
   */
  load(media: MediaItem): Promise<void>
  /**
   * @description: 开始或恢复播放
   * @return {Promise<void>} 播放命令被平台接受后 resolve
   */
  play(): Promise<void>
  /**
   * @description: 暂停播放
   * @return {Promise<void>} 暂停完成后 resolve
   */
  pause(): Promise<void>
  /**
   * @description: 停止播放并释放当前平台游标
   * @return {Promise<void>} 停止完成后 resolve
   */
  stop(): Promise<void>
  /**
   * @description: 跳转到指定播放位置
   * @param {number} positionSeconds - 目标播放位置，单位秒
   * @return {Promise<void>} 跳转完成后 resolve
   */
  seek(positionSeconds: number): Promise<void>
  /**
   * @description: 设置音量
   * @param {number} volume - 音量，范围 0 到 1
   * @return {Promise<void>} 音量应用完成后 resolve
   */
  setVolume(volume: number): Promise<void>
  /**
   * @description: 设置静音状态
   * @param {boolean} muted - 是否静音
   * @return {Promise<void>} 静音状态应用完成后 resolve
   */
  setMuted(muted: boolean): Promise<void>
}

/**
 * @description: 播放器状态快照
 * @description 所有状态都以不可变快照形式对外派发，调用方不应直接修改快照对象。
 */
export interface PlayerState {
  /** 当前运行状态。 */
  status: PlayerStatus
  /** 当前媒体；没有媒体时为 null。 */
  current: MediaItem | null
  /** 当前播放队列。 */
  queue: MediaItem[]
  /** 当前媒体在 queue 中的索引；没有当前媒体时为 -1。 */
  currentIndex: number
  /** 当前播放列表元信息；手动编辑队列后会清空。 */
  playlist: Playlist | null
  /** 当前播放位置，单位秒。 */
  positionSeconds: number
  /** 当前媒体总时长，单位秒。 */
  durationSeconds: number
  /** 当前音量，范围 0 到 1。 */
  volume: number
  /** 是否静音。 */
  muted: boolean
  /** 循环策略。 */
  repeatMode: RepeatMode
  /** 随机策略。 */
  shuffleMode: ShuffleMode
  /** 自然结束后的处理策略。 */
  endBehavior: EndBehavior
  /** 最近播放列表，最新在前。 */
  recent: MediaItem[]
  /** 播放历史，最新在前；随机上一曲会优先使用它回退真实路径。 */
  history: MediaItem[]
  /** 喜欢或收藏的媒体 ID；公共库只维护集合，不负责远端同步。 */
  likedIds: PlayerMediaId[]
  /** 最近一次播放器错误；非错误状态下通常为 null。 */
  error: PlayerError | null
}

/**
 * @description: 播放器构造配置
 */
export interface PlayerOptions {
  /** 平台音频端口。 */
  audio: AudioPlayerPort
  /** 最近播放保留数量。 */
  recentLimit?: number
  /** 播放历史保留数量。 */
  historyLimit?: number
  /** 初始状态覆盖项，常用于平台默认循环策略或恢复持久化状态。 */
  initialState?: Partial<PlayerState>
  /** 随机数函数；测试或业务需要可注入稳定随机源。 */
  random?: () => number
}

/** 播放器事件监听器。 */
export type PlayerListener = (state: PlayerState) => void

/** 最近播放默认保留数量。 */
const DEFAULT_RECENT_LIMIT = 20

/** 播放历史默认保留数量。 */
const DEFAULT_HISTORY_LIMIT = 100

/**
 * @description: 创建播放器默认状态
 * @param {Partial<PlayerState>} initialState - 可选初始状态覆盖项
 * @return {PlayerState} 完整播放器状态快照
 */
export function createPlayerState(initialState: Partial<PlayerState> = {}): PlayerState {
  return {
    status: 'idle',
    current: null,
    queue: [],
    currentIndex: -1,
    playlist: null,
    positionSeconds: 0,
    durationSeconds: 0,
    volume: 1,
    muted: false,
    repeatMode: 'none',
    shuffleMode: 'off',
    endBehavior: 'advance',
    recent: [],
    history: [],
    likedIds: [],
    error: null,
    ...initialState,
  }
}

/**
 * @description: 平台无关播放器
 * @description
 * Player 是应用层应持有的播放器 facade。它不依赖 Pinia、Vue、Tauri、WebAudio 或任何平台 API，
 * 因此同一套状态机可以被桌面端、Web 端、React Native 端或测试环境复用。
 */
export class Player {
  /** 平台端口，所有真实播放副作用都通过它完成。 */
  private readonly audio: AudioPlayerPort
  /** 最近播放保留数量，构造后固定，避免运行中裁剪规则变化。 */
  private readonly recentLimit: number
  /** 历史记录保留数量，构造后固定。 */
  private readonly historyLimit: number
  /** 随机函数，shuffle 模式下用于选择下一首。 */
  private readonly random: () => number
  /** 事件监听器集合，按事件类型分组。 */
  private readonly listeners = new Map<PlayerEventType, Set<PlayerListener>>()
  /** 内部可变状态；对外始终通过 cloneState 返回副本。 */
  private state: PlayerState
  /** 请求序号，用于防止旧的异步 play/load 请求覆盖新请求。 */
  private requestSeq = 0

  /**
   * @description: 创建播放器实例
   * @param {PlayerOptions} options - 播放器配置
   */
  constructor(options: PlayerOptions) {
    this.audio = options.audio
    this.recentLimit = options.recentLimit ?? DEFAULT_RECENT_LIMIT
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT
    this.random = options.random ?? Math.random
    this.state = cloneState(createPlayerState(options.initialState))
  }

  /**
   * @description: 获取播放器状态快照
   * @return {PlayerState} 不暴露内部引用的状态副本
   */
  getState(): PlayerState {
    return cloneState(this.state)
  }

  /**
   * @description: 订阅播放器事件
   * @param {PlayerEventType} event - 事件类型
   * @param {PlayerListener} listener - 事件监听器
   * @return {Unsubscribe} 取消订阅函数
   */
  on(event: PlayerEventType, listener: PlayerListener): Unsubscribe {
    const listeners = this.listeners.get(event) ?? new Set<PlayerListener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return () => listeners.delete(listener)
  }

  /**
   * @description: 替换播放队列
   * @param {MediaItem[]} items - 新队列媒体项
   * @param {number} startIndex - 当前媒体起始索引
   * @return {void} 无返回值
   */
  setQueue(items: MediaItem[], startIndex = 0): void {
    this.replaceQueue(items, startIndex, { keepPlaylist: false })
  }

  /**
   * @description: 加载播放列表并替换队列
   * @param {Playlist} playlist - 播放列表快照
   * @param {number} startIndex - 当前媒体起始索引
   * @return {void} 无返回值
   */
  setPlaylist(playlist: Playlist, startIndex = 0): void {
    this.state.playlist = { ...playlist, items: playlist.items.map(cloneMedia) }
    this.replaceQueue(playlist.items, startIndex, { keepPlaylist: true })
  }

  /**
   * @description: 向队列尾部追加媒体
   * @param {MediaItem[]} items - 需要追加的媒体项
   * @return {void} 无返回值
   */
  addToQueue(items: MediaItem[]): void {
    if (!items.length) return
    const wasEmpty = this.state.queue.length === 0
    this.state.queue = [...this.state.queue.map(cloneMedia), ...items.map(cloneMedia)]
    if (wasEmpty) {
      // 空队列首次加入媒体时，立即选中第一项，UI 可以展示待播放目标。
      this.state.currentIndex = 0
      this.state.current = cloneMedia(this.state.queue[0]!)
      this.state.durationSeconds = this.state.current.durationSeconds ?? 0
      this.state.status = 'stopped'
    }
    // 手动编辑队列会破坏原始播放列表语义，因此清空 playlist 元信息。
    this.state.playlist = null
    this.emit('statechange')
  }

  /**
   * @description: 将媒体插入到当前媒体之后
   * @param {MediaItem[]} items - 需要插入的媒体项
   * @return {void} 无返回值
   */
  insertNext(items: MediaItem[]): void {
    if (!items.length) return
    const insertIndex = this.state.currentIndex >= 0 ? this.state.currentIndex + 1 : 0
    this.state.queue = [
      ...this.state.queue.slice(0, insertIndex).map(cloneMedia),
      ...items.map(cloneMedia),
      ...this.state.queue.slice(insertIndex).map(cloneMedia),
    ]
    if (!this.state.current) {
      // 没有当前媒体时，插入队列也需要给播放条一个明确的待播放目标。
      this.state.currentIndex = 0
      this.state.current = cloneMedia(this.state.queue[0]!)
      this.state.durationSeconds = this.state.current.durationSeconds ?? 0
      this.state.status = 'stopped'
    }
    this.state.playlist = null
    this.emit('statechange')
  }

  /**
   * @description: 从队列中移除指定媒体
   * @param {PlayerMediaId} mediaId - 需要移除的媒体 ID
   * @return {void} 无返回值
   */
  removeFromQueue(mediaId: PlayerMediaId): void {
    const removedIndex = this.state.queue.findIndex((item) => item.id === mediaId)
    if (removedIndex < 0) return

    const removedCurrent = this.state.current?.id === mediaId
    this.state.queue = this.state.queue.filter((item) => item.id !== mediaId).map(cloneMedia)
    if (!this.state.queue.length) {
      // 队列清空后保留 stopped，而不是 idle，表示用户显式编辑过播放列表。
      this.state.currentIndex = -1
      this.state.current = null
      this.state.positionSeconds = 0
      this.state.durationSeconds = 0
      this.state.status = 'stopped'
    } else if (removedCurrent) {
      // 删除当前媒体时选中原位置上的下一项；如果删除最后一项则回退到新的最后一项。
      this.state.currentIndex = clampInteger(removedIndex, 0, this.state.queue.length - 1)
      this.state.current = cloneMedia(this.state.queue[this.state.currentIndex]!)
      this.state.positionSeconds = 0
      this.state.durationSeconds = this.state.current.durationSeconds ?? 0
    } else {
      // 删除非当前媒体时需要重新计算 currentIndex，避免后续上一曲/下一曲错位。
      this.state.currentIndex = this.state.current
        ? this.state.queue.findIndex((item) => item.id === this.state.current?.id)
        : -1
    }
    this.state.playlist = null
    this.emit('statechange')
  }

  /**
   * @description: 替换播放器中同 ID 的媒体快照
   * @param {MediaItem} media - 更新后的媒体快照
   * @return {void} 无返回值
   */
  replaceMedia(media: MediaItem): void {
    const nextMedia = cloneMedia(media)
    let changed = false
    this.state.queue = this.state.queue.map((item) => {
      if (item.id !== nextMedia.id) return item
      changed = true
      return cloneMedia(nextMedia)
    })
    if (this.state.current?.id === nextMedia.id) {
      this.state.current = cloneMedia(nextMedia)
      this.state.durationSeconds = nextMedia.durationSeconds ?? this.state.durationSeconds
      changed = true
    }
    if (!changed) return
    this.emit('statechange')
  }

  /**
   * @description: 清空队列和当前媒体
   * @return {void} 无返回值
   */
  clearQueue(): void {
    // 清空队列会让正在进行的异步 play 结果失效，避免旧请求回写当前媒体。
    this.requestSeq += 1
    this.state.queue = []
    this.state.currentIndex = -1
    this.state.current = null
    this.state.playlist = null
    this.state.positionSeconds = 0
    this.state.durationSeconds = 0
    this.state.status = 'stopped'
    this.emit('statechange')
  }

  /**
   * @description: 播放队列中指定索引的媒体
   * @param {number} index - 队列索引
   * @return {Promise<void>} 播放命令完成后 resolve
   */
  async playIndex(index: number): Promise<void> {
    const safeIndex = Math.round(index)
    const media = this.state.queue[safeIndex]
    if (!media) return
    await this.play(media)
  }

  /**
   * @description: 预置当前媒体并进入 loading 状态
   * @description 适合应用层先解析播放地址、权限或远端 DTO 时展示“正在准备”的场景。
   * @param {MediaItem} media - 待播放媒体
   * @return {void} 无返回值
   */
  prepare(media: MediaItem): void {
    this.requestSeq += 1
    const target = cloneMedia(media)
    this.selectMedia(target)
    this.state.status = 'loading'
    this.state.error = null
    this.emit('statechange')
  }

  /**
   * @description: 播放指定媒体或当前媒体
   * @param {MediaItem} [media] - 可选媒体；为空时播放当前媒体
   * @return {Promise<void>} 播放命令完成后 resolve
   */
  async play(media?: MediaItem): Promise<void> {
    const seq = ++this.requestSeq
    const target = media ? cloneMedia(media) : this.state.current
    if (!target) return

    this.state.status = 'loading'
    this.state.error = null
    if (media) this.selectMedia(target)
    this.emit('statechange')

    try {
      await this.audio.load(target)
      if (seq !== this.requestSeq) return
      await this.audio.play()
      if (seq !== this.requestSeq) return

      // load/play 都成功后才记录 recent/history，避免失败媒体污染历史。
      this.state.status = 'playing'
      this.state.current = cloneMedia(target)
      this.state.durationSeconds = target.durationSeconds ?? this.state.durationSeconds
      this.state.recent = addUniqueHead(this.state.recent, target, this.recentLimit)
      this.state.history = addUniqueHead(this.state.history, target, this.historyLimit)
      this.emit('statechange')
    } catch (error) {
      if (seq === this.requestSeq) this.fail('PLAY_FAILED', error)
    }
  }

  /**
   * @description: 暂停当前播放或加载
   * @return {Promise<void>} 暂停命令完成后 resolve
   */
  async pause(): Promise<void> {
    if (this.state.status !== 'playing' && this.state.status !== 'loading') return
    if (this.state.status === 'loading') {
      // loading 阶段暂停相当于取消当前加载结果，防止稍后 load/play 继续把状态改回 playing。
      this.requestSeq += 1
    }
    try {
      await this.audio.pause()
      this.state.status = 'paused'
      this.emit('statechange')
    } catch (error) {
      this.fail('PAUSE_FAILED', error)
    }
  }

  /**
   * @description: 恢复当前媒体播放
   * @return {Promise<void>} 恢复命令完成后 resolve
   */
  async resume(): Promise<void> {
    if (!this.state.current) return

    if (this.state.status === 'stopped' || this.state.status === 'idle' || this.state.status === 'ended') {
      // stopped/idle/ended 往往意味着平台游标已经释放，必须重新走 load + play。
      await this.play(this.state.current)
      return
    }

    this.state.status = 'loading'
    this.emit('statechange')
    try {
      await this.audio.play()
      this.state.status = 'playing'
      this.emit('statechange')
    } catch (error) {
      this.fail('RESUME_FAILED', error)
    }
  }

  /**
   * @description: 停止播放并重置进度
   * @return {Promise<void>} 停止命令完成后 resolve
   */
  async stop(): Promise<void> {
    this.requestSeq += 1
    try {
      await this.audio.stop()
      this.state.status = this.state.current ? 'stopped' : 'idle'
      this.state.positionSeconds = 0
      this.emit('statechange')
    } catch (error) {
      this.fail('STOP_FAILED', error)
    }
  }

  /**
   * @description: 跳转到指定播放位置
   * @param {number} positionSeconds - 目标播放位置，单位秒
   * @return {Promise<void>} seek 命令完成后 resolve
   */
  async seek(positionSeconds: number): Promise<void> {
    if (!this.state.current) return
    const position = clampNumber(
      positionSeconds,
      0,
      this.state.durationSeconds || Number.MAX_SAFE_INTEGER
    )
    try {
      await this.audio.seek(position)
      this.state.positionSeconds = position
      this.emit('statechange')
    } catch (error) {
      this.fail('SEEK_FAILED', error)
    }
  }

  /**
   * @description: 播放上一首
   * @return {Promise<void>} 切换完成后 resolve
   */
  async previous(): Promise<void> {
    const index = this.getPreviousIndex()
    if (index >= 0) await this.playIndex(index)
  }

  /**
   * @description: 播放下一首
   * @return {Promise<void>} 切换完成后 resolve
   */
  async next(): Promise<void> {
    const index = this.getRelativeIndex(1)
    if (index >= 0) await this.playIndex(index)
  }

  /**
   * @description: 处理平台上报的自然结束事件
   * @return {Promise<void>} 结束策略处理完成后 resolve
   */
  async handleEnded(): Promise<void> {
    this.state.status = 'ended'
    this.state.positionSeconds = this.state.durationSeconds
    this.emit('ended')
    this.emit('statechange')

    if (this.state.endBehavior === 'stop') {
      await this.stop()
      return
    }
    if (this.state.endBehavior === 'pause') {
      await this.resetCurrentMediaAfterEnded('paused')
      return
    }

    const index = this.getRelativeIndex(1)
    if (index >= 0) {
      await this.playIndex(index)
      return
    }
    await this.resetCurrentMediaAfterEnded('stopped')
  }

  /**
   * @description: 处理平台上报的开始播放事件
   * @return {void} 无返回值
   */
  handlePlaying(): void {
    if (!this.state.current) return
    this.state.status = 'playing'
    this.state.error = null
    this.emit('statechange')
  }

  /**
   * @description: 处理平台上报的暂停事件
   * @return {void} 无返回值
   */
  handlePaused(): void {
    if (!this.state.current) return
    this.state.status = 'paused'
    this.emit('statechange')
  }

  /**
   * @description: 处理平台上报的缓冲等待事件
   * @return {void} 无返回值
   */
  handleWaiting(): void {
    if (!this.state.current) return
    this.state.status = 'loading'
    this.emit('statechange')
  }

  /**
   * @description: 处理平台上报的停止事件
   * @return {void} 无返回值
   */
  handleStopped(): void {
    this.requestSeq += 1
    this.state.status = this.state.current ? 'stopped' : 'idle'
    this.state.positionSeconds = 0
    this.emit('statechange')
  }

  /**
   * @description: 处理平台上报的音频错误
   * @param {unknown} error - 平台原始错误
   * @return {void} 无返回值
   */
  handleError(error: unknown): void {
    this.fail('AUDIO_ERROR', error)
  }

  /**
   * @description: 同步平台上报的播放进度
   * @param {number} positionSeconds - 当前播放位置，单位秒
   * @param {number} [durationSeconds] - 可选总时长，单位秒
   * @return {void} 无返回值
   */
  updateProgress(positionSeconds: number, durationSeconds?: number): void {
    const previousPositionSeconds = this.state.positionSeconds
    this.state.positionSeconds = Math.max(0, positionSeconds)
    if (
      typeof durationSeconds === 'number' &&
      Number.isFinite(durationSeconds) &&
      durationSeconds > 0
    ) {
      this.state.durationSeconds = Math.max(0, durationSeconds)
    }
    if (this.state.status === 'loading' && this.state.positionSeconds > previousPositionSeconds) {
      // 只有进度真正推进时才把 loading 纠正为 playing，避免 load 阶段写入 0 秒时提前点亮播放态。
      this.state.status = 'playing'
      this.state.error = null
    }
    this.emit('statechange')
  }

  /**
   * @description: 设置音量
   * @param {number} volume - 音量，范围 0 到 1
   * @return {Promise<void>} 音量应用完成后 resolve
   */
  async setVolume(volume: number): Promise<void> {
    const next = clampNumber(volume, 0, 1)
    try {
      await this.audio.setVolume(next)
      this.state.volume = next
      if (next > 0) this.state.muted = false
      this.emit('statechange')
    } catch (error) {
      this.fail('VOLUME_FAILED', error)
    }
  }

  /**
   * @description: 设置静音状态
   * @param {boolean} muted - 是否静音
   * @return {Promise<void>} 静音状态应用完成后 resolve
   */
  async setMuted(muted: boolean): Promise<void> {
    try {
      await this.audio.setMuted(muted)
      this.state.muted = muted
      this.emit('statechange')
    } catch (error) {
      this.fail('MUTED_FAILED', error)
    }
  }

  /**
   * @description: 设置循环策略
   * @param {RepeatMode} mode - 循环策略
   * @return {void} 无返回值
   */
  setRepeatMode(mode: RepeatMode): void {
    this.state.repeatMode = mode
    this.emit('statechange')
  }

  /**
   * @description: 设置随机策略
   * @param {ShuffleMode} mode - 随机策略
   * @return {void} 无返回值
   */
  setShuffleMode(mode: ShuffleMode): void {
    this.state.shuffleMode = mode
    this.emit('statechange')
  }

  /**
   * @description: 设置结束策略
   * @param {EndBehavior} behavior - 结束策略
   * @return {void} 无返回值
   */
  setEndBehavior(behavior: EndBehavior): void {
    this.state.endBehavior = behavior
    this.emit('statechange')
  }

  /**
   * @description: 设置喜欢状态
   * @param {PlayerMediaId} mediaId - 媒体 ID
   * @param {boolean} liked - 是否喜欢
   * @return {void} 无返回值
   */
  setLiked(mediaId: PlayerMediaId, liked: boolean): void {
    const ids = this.state.likedIds.filter((id) => id !== mediaId)
    this.state.likedIds = liked ? [...ids, mediaId] : ids
    this.emit('statechange')
  }

  /**
   * @description: 清空最近错误
   * @return {void} 无返回值
   */
  clearError(): void {
    this.state.error = null
    if (this.state.status === 'error') {
      this.state.status = this.state.current ? 'paused' : 'idle'
    }
    this.emit('statechange')
  }

  /**
   * @description: 选择媒体并同步队列索引
   * @param {MediaItem} media - 目标媒体
   * @return {void} 无返回值
   */
  private selectMedia(media: MediaItem): void {
    const index = this.state.queue.findIndex((item) => item.id === media.id)
    if (index < 0) {
      // 直接播放队列外媒体时，播放器把它视为临时单曲队列。
      this.state.queue = [cloneMedia(media)]
      this.state.currentIndex = 0
      this.state.playlist = null
    } else {
      this.state.currentIndex = index
      this.state.queue[index] = cloneMedia(media)
    }
    this.state.current = cloneMedia(media)
    this.state.positionSeconds = 0
    this.state.durationSeconds = media.durationSeconds ?? 0
  }

  /**
   * @description: 根据方向计算相邻媒体索引
   * @param {1 | -1} direction - 1 表示下一首，-1 表示上一首
   * @return {number} 目标索引，不存在时返回 -1
   */
  private getRelativeIndex(direction: 1 | -1): number {
    if (this.state.queue.length === 0) return -1
    if (this.state.repeatMode === 'one' && this.state.currentIndex >= 0) {
      return this.state.currentIndex
    }
    if (this.state.shuffleMode === 'on' && this.state.queue.length > 1) {
      const candidates = this.state.queue
        .map((_, index) => index)
        .filter((index) => index !== this.state.currentIndex)
      return candidates[Math.floor(this.random() * candidates.length)] ?? -1
    }

    const nextIndex = this.state.currentIndex + direction
    if (nextIndex >= 0 && nextIndex < this.state.queue.length) return nextIndex
    return this.state.repeatMode === 'all' ? (direction > 0 ? 0 : this.state.queue.length - 1) : -1
  }

  /**
   * @description: 计算上一首索引
   * @return {number} 目标索引，不存在时返回 -1
   */
  private getPreviousIndex(): number {
    if (this.state.queue.length === 0) return -1
    if (this.state.repeatMode === 'one' && this.state.currentIndex >= 0) {
      return this.state.currentIndex
    }
    if (this.state.shuffleMode === 'on') {
      // 随机模式下“上一首”应回到真实听过的上一项，而不是再次随机。
      const previous = this.state.history.find((item) => item.id !== this.state.current?.id)
      const historyIndex = previous
        ? this.state.queue.findIndex((item) => item.id === previous.id)
        : -1
      if (historyIndex >= 0) return historyIndex
    }

    const previousIndex = this.state.currentIndex - 1
    if (previousIndex >= 0) return previousIndex
    return this.state.repeatMode === 'all' ? this.state.queue.length - 1 : -1
  }

  /**
   * @description: 将播放器置为错误状态
   * @param {string} code - 标准错误码
   * @param {unknown} cause - 原始错误
   * @return {void} 无返回值
   */
  private fail(code: string, cause: unknown): void {
    const message = cause instanceof Error ? cause.message : String(cause || '播放器错误')
    this.state.error = { code, message, cause }
    this.state.status = 'error'
    this.emit('error')
    this.emit('statechange')
  }

  /**
   * @description: 派发播放器事件
   * @param {PlayerEventType} event - 事件类型
   * @return {void} 无返回值
   */
  private emit(event: PlayerEventType): void {
    const snapshot = this.getState()
    this.listeners.get(event)?.forEach((listener) => listener(snapshot))
  }

  /**
   * @description: 替换队列并同步当前媒体
   * @param {MediaItem[]} items - 新队列媒体
   * @param {number} startIndex - 当前媒体索引
   * @param {{ keepPlaylist: boolean }} options - 是否保留播放列表元信息
   * @return {void} 无返回值
   */
  private replaceQueue(
    items: MediaItem[],
    startIndex: number,
    options: { keepPlaylist: boolean }
  ): void {
    this.state.queue = items.map(cloneMedia)
    if (!options.keepPlaylist) this.state.playlist = null
    this.state.currentIndex = this.state.queue.length
      ? clampInteger(startIndex, 0, this.state.queue.length - 1)
      : -1
    this.state.current =
      this.state.currentIndex >= 0 ? cloneMedia(this.state.queue[this.state.currentIndex]!) : null
    this.state.positionSeconds = 0
    this.state.durationSeconds = this.state.current?.durationSeconds ?? 0
    this.state.status = this.state.current ? 'stopped' : 'idle'
    this.state.error = null
    this.emit('statechange')
  }

  /**
   * @description: 自然结束后把当前媒体恢复为可重新播放的非播放态
   * @param {Extract<PlayerStatus, 'paused' | 'stopped'>} status - 归位后的状态
   * @return {Promise<void>} 平台 seek 归零完成后 resolve
   */
  private async resetCurrentMediaAfterEnded(
    status: Extract<PlayerStatus, 'paused' | 'stopped'>
  ): Promise<void> {
    await this.audio.seek(0)
    this.state.status = status
    this.state.positionSeconds = 0
    this.emit('statechange')
  }
}

/**
 * @description: 克隆媒体对象
 * @param {MediaItem} media - 原媒体对象
 * @return {MediaItem} 媒体副本
 */
function cloneMedia(media: MediaItem): MediaItem {
  const clone: MediaItem = { ...media }
  if (media.metadata) clone.metadata = { ...media.metadata }
  return clone
}

/**
 * @description: 将数值限制在指定范围内
 * @param {number} value - 原始数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @return {number} 限制后的数值
 */
function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * @description: 将数值取整后限制在指定范围内
 * @param {number} value - 原始数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @return {number} 限制后的整数
 */
function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max))
}

/**
 * @description: 将媒体加入列表头部并按媒体 ID 去重
 * @param {MediaItem[]} list - 原列表
 * @param {MediaItem} media - 需要加入的媒体
 * @param {number} limit - 最大保留数量
 * @return {MediaItem[]} 新列表
 */
function addUniqueHead(list: MediaItem[], media: MediaItem, limit: number): MediaItem[] {
  return [cloneMedia(media), ...list.filter((item) => item.id !== media.id).map(cloneMedia)].slice(
    0,
    limit
  )
}

/**
 * @description: 克隆播放器状态
 * @param {PlayerState} state - 原状态
 * @return {PlayerState} 状态副本
 */
function cloneState(state: PlayerState): PlayerState {
  return {
    ...state,
    current: state.current ? cloneMedia(state.current) : null,
    queue: state.queue.map(cloneMedia),
    playlist: state.playlist
      ? { ...state.playlist, items: state.playlist.items.map(cloneMedia) }
      : null,
    recent: state.recent.map(cloneMedia),
    history: state.history.map(cloneMedia),
    likedIds: [...state.likedIds],
    error: state.error ? { ...state.error } : null,
  }
}
