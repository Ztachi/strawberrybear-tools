/**
 * @fileOverview Platform-agnostic audio player core.
 */

export type PlayerMediaId = string

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error'

export type RepeatMode = 'none' | 'all' | 'one'

export type EndBehavior = 'advance' | 'pause' | 'stop'

export type PlayerEventType = 'statechange' | 'error' | 'ended'

export type Unsubscribe = () => void

export interface PlayerError {
  code: string
  message: string
  cause?: unknown
}

export interface MediaItem {
  id: PlayerMediaId
  title: string
  url: string
  subtitle?: string
  durationSeconds?: number
  metadata?: Record<string, unknown>
}

export interface AudioPlayerPort {
  load(media: MediaItem): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  resume?(): Promise<void>
  stop(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  setVolume(volume: number): Promise<void>
  setMuted(muted: boolean): Promise<void>
}

export interface PlayerState {
  status: PlayerStatus
  current: MediaItem | null
  queue: MediaItem[]
  currentIndex: number
  positionSeconds: number
  durationSeconds: number
  volume: number
  muted: boolean
  repeatMode: RepeatMode
  endBehavior: EndBehavior
  recent: MediaItem[]
  error: PlayerError | null
}

export interface PlayerOptions {
  audio: AudioPlayerPort
  initialState?: Partial<PlayerState>
  endBehavior?: EndBehavior
  recentLimit?: number
}

export type PlayerListener = (state: PlayerState) => void

const DEFAULT_RECENT_LIMIT = 20

export function createPlayerState(initialState: Partial<PlayerState> = {}): PlayerState {
  return {
    status: 'idle',
    current: null,
    queue: [],
    currentIndex: -1,
    positionSeconds: 0,
    durationSeconds: 0,
    volume: 1,
    muted: false,
    repeatMode: 'all',
    endBehavior: 'stop',
    recent: [],
    error: null,
    ...initialState,
  }
}

export class Player {
  private readonly audio: AudioPlayerPort
  private readonly recentLimit: number
  private readonly listeners = new Map<PlayerEventType, Set<PlayerListener>>()
  private state: PlayerState
  private requestSeq = 0

  constructor(options: PlayerOptions) {
    this.audio = options.audio
    this.recentLimit = options.recentLimit ?? DEFAULT_RECENT_LIMIT
    this.state = cloneState(
      createPlayerState({
        ...options.initialState,
        endBehavior: options.endBehavior ?? options.initialState?.endBehavior ?? 'stop',
      })
    )
  }

  getState(): PlayerState {
    return cloneState(this.state)
  }

  on(event: PlayerEventType, listener: PlayerListener): Unsubscribe {
    const listeners = this.listeners.get(event) ?? new Set<PlayerListener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return () => listeners.delete(listener)
  }

  setQueue(items: MediaItem[], startIndex = 0): void {
    this.state.queue = items.map(cloneMedia)
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

  async play(media?: MediaItem): Promise<void> {
    const requestId = ++this.requestSeq
    if (media) {
      this.replaceCurrent(media)
    }
    if (!this.state.current) return

    this.state.status = 'loading'
    this.state.error = null
    this.emit('statechange')

    try {
      await this.audio.load(cloneMedia(this.state.current))
      if (requestId !== this.requestSeq) return
      await this.audio.play()
      if (requestId !== this.requestSeq) return
      this.state.status = 'playing'
      this.pushRecent(this.state.current)
      this.emit('statechange')
    } catch (error) {
      if (requestId === this.requestSeq) this.setError(error, 'PLAY_FAILED')
    }
  }

  async playIndex(index: number): Promise<void> {
    if (!this.state.queue.length) return
    const nextIndex = clampInteger(index, 0, this.state.queue.length - 1)
    this.state.currentIndex = nextIndex
    this.state.current = cloneMedia(this.state.queue[nextIndex]!)
    this.state.positionSeconds = 0
    this.state.durationSeconds = this.state.current.durationSeconds ?? 0
    await this.play()
  }

  async pause(): Promise<void> {
    ++this.requestSeq
    if (!this.state.current) return
    try {
      await this.audio.pause()
      this.state.status = 'paused'
      this.emit('statechange')
    } catch (error) {
      this.setError(error, 'PAUSE_FAILED')
    }
  }

  async resume(): Promise<void> {
    if (!this.state.current || this.state.status !== 'paused') return
    const requestId = ++this.requestSeq
    try {
      if (this.audio.resume) {
        await this.audio.resume()
      } else {
        await this.audio.play()
      }
      if (requestId !== this.requestSeq) return
      this.state.status = 'playing'
      this.emit('statechange')
    } catch (error) {
      this.setError(error, 'RESUME_FAILED')
    }
  }

  async stop(): Promise<void> {
    ++this.requestSeq
    try {
      await this.audio.stop()
      this.state.status = this.state.current ? 'stopped' : 'idle'
      this.state.positionSeconds = 0
      this.emit('statechange')
    } catch (error) {
      this.setError(error, 'STOP_FAILED')
    }
  }

  async seek(positionSeconds: number): Promise<void> {
    if (!this.state.current) return
    const target = clamp(positionSeconds, 0, this.state.durationSeconds)
    try {
      await this.audio.seek(target)
      this.state.positionSeconds = target
      this.state.status = 'playing'
      this.emit('statechange')
    } catch (error) {
      this.setError(error, 'SEEK_FAILED')
    }
  }

  async previous(): Promise<void> {
    if (!this.state.queue.length) return
    const lastIndex = this.state.queue.length - 1
    const nextIndex = this.state.currentIndex <= 0 ? lastIndex : this.state.currentIndex - 1
    await this.playIndex(nextIndex)
  }

  async next(): Promise<void> {
    if (!this.state.queue.length) return
    const lastIndex = this.state.queue.length - 1
    const nextIndex = this.state.currentIndex >= lastIndex ? 0 : this.state.currentIndex + 1
    await this.playIndex(nextIndex)
  }

  async setVolume(volume: number): Promise<void> {
    const nextVolume = clamp(volume, 0, 1)
    try {
      await this.audio.setVolume(nextVolume)
      this.state.volume = nextVolume
      if (nextVolume > 0) this.state.muted = false
      this.emit('statechange')
    } catch (error) {
      this.setError(error, 'VOLUME_FAILED')
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    try {
      await this.audio.setMuted(muted)
      this.state.muted = muted
      this.emit('statechange')
    } catch (error) {
      this.setError(error, 'MUTED_FAILED')
    }
  }

  updateProgress(positionSeconds: number, durationSeconds?: number): void {
    this.state.positionSeconds = clamp(positionSeconds, 0, durationSeconds ?? this.state.durationSeconds)
    if (durationSeconds !== undefined) {
      this.state.durationSeconds = Math.max(0, durationSeconds)
    }
    if (this.state.status === 'loading') this.state.status = 'playing'
    this.emit('statechange')
  }

  async handleEnded(): Promise<void> {
    this.emit('ended')
    if (this.state.endBehavior === 'advance' && this.hasNext()) {
      await this.next()
      return
    }
    if (this.state.endBehavior === 'pause') {
      this.state.status = 'paused'
      this.state.positionSeconds = this.state.durationSeconds
      this.emit('statechange')
      return
    }
    await this.stop()
    this.state.status = 'ended'
    this.emit('statechange')
  }

  handleError(error: unknown): void {
    this.setError(error, 'AUDIO_ERROR')
  }

  clearError(): void {
    this.state.error = null
    if (this.state.status === 'error') {
      this.state.status = this.state.current ? 'stopped' : 'idle'
    }
    this.emit('statechange')
  }

  setRepeatMode(mode: RepeatMode): void {
    this.state.repeatMode = mode
    this.emit('statechange')
  }

  private replaceCurrent(media: MediaItem): void {
    const cloned = cloneMedia(media)
    const existingIndex = this.state.queue.findIndex((item) => item.id === cloned.id)
    if (existingIndex >= 0) {
      this.state.currentIndex = existingIndex
      this.state.queue[existingIndex] = cloned
    } else {
      this.state.queue = [cloned]
      this.state.currentIndex = 0
    }
    this.state.current = cloned
    this.state.positionSeconds = 0
    this.state.durationSeconds = cloned.durationSeconds ?? 0
  }

  private hasNext(): boolean {
    return this.state.repeatMode === 'all' || this.state.currentIndex < this.state.queue.length - 1
  }

  private pushRecent(media: MediaItem | null): void {
    if (!media) return
    this.state.recent = [
      cloneMedia(media),
      ...this.state.recent.filter((item) => item.id !== media.id).map(cloneMedia),
    ].slice(0, this.recentLimit)
  }

  private setError(error: unknown, code: string): void {
    this.state.status = 'error'
    this.state.error = {
      code,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    }
    this.emit('statechange')
    this.emit('error')
  }

  private emit(event: PlayerEventType): void {
    const snapshot = this.getState()
    this.listeners.get(event)?.forEach((listener) => listener(snapshot))
  }
}

function cloneState(state: PlayerState): PlayerState {
  return {
    ...state,
    current: state.current ? cloneMedia(state.current) : null,
    queue: state.queue.map(cloneMedia),
    recent: state.recent.map(cloneMedia),
    error: state.error ? { ...state.error } : null,
  }
}

function cloneMedia(media: MediaItem): MediaItem {
  return {
    ...media,
    metadata: media.metadata ? { ...media.metadata } : undefined,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max))
}
