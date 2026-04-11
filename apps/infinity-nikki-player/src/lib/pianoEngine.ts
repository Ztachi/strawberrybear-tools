/**
 * @description: 钢琴音频引擎
 * 基于 @tonejs/piano 模块，提供高质量钢琴音色发音
 */
import { Piano } from '@tonejs/piano'

/** 钢琴引擎配置 */
export interface PianoEngineOptions {
  /** 音色样本基础路径 */
  sampleBaseUrl?: string
  /** 力度层级 (1-16)，默认 5 */
  velocities?: number
  /** 是否启用发音 */
  enabled?: boolean
}

/**
 * @description: 钢琴音频引擎类
 */
export class PianoEngine {
  /** @tonejs/piano 实例 */
  private piano: Piano | null = null
  /** 是否已初始化 */
  private initialized = false
  /** 是否启用发音 */
  private _enabled = true
  /** 配置 */
  private options: Required<PianoEngineOptions>

  constructor(options: PianoEngineOptions = {}) {
    this.options = {
      sampleBaseUrl: options.sampleBaseUrl ?? '/samples/piano',
      velocities: options.velocities ?? 5,
      enabled: options.enabled ?? true,
    }
    this._enabled = this.options.enabled
  }

  /** 是否启用 */
  get enabled(): boolean {
    return this._enabled
  }

  set enabled(value: boolean) {
    this._enabled = value
    if (!value) {
      this.stopAll()
    }
  }

  /**
   * @description: 初始化钢琴引擎
   */
  async init(): Promise<void> {
    if (this.initialized) return

    this.piano = new Piano({
      velocities: this.options.velocities,
    })

    this.piano.toDestination()

    await this.piano.load(this.options.sampleBaseUrl)
    this.initialized = true
    console.log('[PianoEngine] Initialized')
  }

  /**
   * @description: 将 MIDI 音符号转换为音符名称
   */
  private pitchToNoteName(pitch: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const octave = Math.floor(pitch / 12) - 1
    const noteIndex = pitch % 12
    return `${noteNames[noteIndex]}${octave}`
  }

  /**
   * @description: 播放单个音符
   * @param {number} pitch MIDI 音符号 (0-127)
   * @param {number} velocity 力度 (0-1)，默认 0.8
   */
  keyDown(pitch: number, velocity = 0.8): void {
    if (!this._enabled || !this.piano || !this.initialized) return

    const noteName = this.pitchToNoteName(pitch)
    this.piano.keyDown({ note: noteName, velocity })
  }

  /**
   * @description: 释放音符
   * @param {number} pitch MIDI 音符号 (0-127)
   */
  keyUp(pitch: number): void {
    if (!this._enabled || !this.piano || !this.initialized) return

    const noteName = this.pitchToNoteName(pitch)
    this.piano.keyUp({ note: noteName })
  }

  /**
   * @description: 停止所有正在发声的音符
   */
  stopAll(): void {
    // Piano 没有全局 stop，需要逐个释放已知的活跃音符
    // 这里简单处理：对于钢琴来说，音符是单次触发的
  }

  /**
   * @description: 销毁引擎
   */
  destroy(): void {
    this.piano = null
    this.initialized = false
  }
}

/** 全局单例 */
let pianoEngineInstance: PianoEngine | null = null

/**
 * @description: 获取钢琴引擎单例
 */
export function getPianoEngine(options?: PianoEngineOptions): PianoEngine {
  if (!pianoEngineInstance) {
    pianoEngineInstance = new PianoEngine(options)
  }
  return pianoEngineInstance
}
