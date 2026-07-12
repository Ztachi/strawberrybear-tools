/**
 * @fileOverview 按键时间轴执行器
 * @description
 * 按编译好的事件时间轴驱动 onKeyDown/onKeyUp 回调。
 * 每次调度都以构造时注入的时钟为基准重新计算延迟，setTimeout 抖动不会累积。
 * 暂停、停止、跳转和销毁都会先抬起所有仍按下的物理键，避免真实键盘残留按下状态。
 */

import { compileKeystrokeTimeline } from './compile'
import type {
  KeystrokeEvent,
  KeystrokeSequencerOptions,
  KeystrokeSequencerStatus,
} from './types'

/** 事件到期判定的容差，吸收定时器提前触发的亚毫秒误差。 */
const DUE_EPSILON_MS = 1

/**
 * @description: 按键序列执行器
 * @description 构造时把音符一次性编译为事件时间轴，播放期间只做"到点派发"，不做时序决策。
 */
export class KeystrokeSequencer {
  /** 编译后的事件时间轴，按时间升序。 */
  private readonly events: KeystrokeEvent[]
  /** 播放速度倍率。 */
  private readonly speed: number
  /** 时钟函数，返回单调递增毫秒。 */
  private readonly now: () => number
  /** 按下物理键回调。 */
  private readonly onKeyDown: (key: string) => void
  /** 抬起物理键回调。 */
  private readonly onKeyUp: (key: string) => void
  /** 时间轴自然走完回调。 */
  private readonly onEnded?: () => void

  /** 时间轴总长度（最后一个事件的时刻），单位毫秒（音乐时间）。 */
  readonly durationMs: number

  /** 当前调度定时器。 */
  private timer: ReturnType<typeof setTimeout> | null = null
  /** 播放锚点：真实时刻 = anchorMs + 音乐时刻 / speed。 */
  private anchorMs = 0
  /** 下一个待派发事件在 events 中的下标。 */
  private cursor = 0
  /** 非播放状态下记住的音乐时间位置，单位毫秒。 */
  private positionMs = 0
  /** 当前运行状态。 */
  private currentStatus: KeystrokeSequencerStatus = 'idle'
  /** 当前处于按下状态的物理键集合，暂停/停止时据此统一抬起。 */
  private readonly downKeys = new Set<string>()

  /**
   * @description: 创建执行器并立即编译时间轴
   * @param {KeystrokeSequencerOptions} options 音符、时序约束与回调
   */
  constructor(options: KeystrokeSequencerOptions) {
    this.events = compileKeystrokeTimeline(options.notes, options.timing)
    this.speed =
      typeof options.speed === 'number' && Number.isFinite(options.speed) && options.speed > 0
        ? options.speed
        : 1
    this.now = options.now ?? (() => performance.now())
    this.onKeyDown = options.onKeyDown
    this.onKeyUp = options.onKeyUp
    this.onEnded = options.onEnded
    this.durationMs = this.events.length > 0 ? this.events[this.events.length - 1].atMs : 0
  }

  /** 当前运行状态。 */
  get status(): KeystrokeSequencerStatus {
    return this.currentStatus
  }

  /** 是否正在播放。 */
  get isPlaying(): boolean {
    return this.currentStatus === 'playing'
  }

  /**
   * @description: 从指定音乐时间开始播放
   * @param {number} fromMs 起始位置（毫秒），默认从上次暂停/跳转的位置开始
   * @return {void} 无返回值
   */
  play(fromMs: number = this.positionMs): void {
    this.clearTimer()
    this.releaseAllKeys()

    this.positionMs = Math.max(0, fromMs)
    // 起始位置上的事件也要派发，因此取第一个 atMs >= position 的下标
    this.cursor = this.findFirstEventIndex(this.positionMs)
    this.anchorMs = this.now() - this.positionMs / this.speed
    this.currentStatus = 'playing'

    // 重按跨越起始位置的长音：down 在起点之前、up 在起点之后的键此刻应处于按下状态
    for (const key of this.collectKeysHeldAt(this.cursor)) {
      this.dispatch({ atMs: this.positionMs, type: 'down', key })
    }

    this.scheduleNext()
  }

  /**
   * @description: 暂停播放并抬起所有按下的键
   * @return {void} 无返回值
   */
  pause(): void {
    if (this.currentStatus !== 'playing') return
    this.positionMs = this.getPositionMs()
    this.currentStatus = 'paused'
    this.clearTimer()
    this.releaseAllKeys()
  }

  /**
   * @description: 从暂停位置恢复播放
   * @return {void} 无返回值
   */
  resume(): void {
    if (this.currentStatus === 'playing') return
    this.play(this.positionMs)
  }

  /**
   * @description: 跳转到指定音乐时间
   * @param {number} positionMs 目标位置（毫秒）；播放中会立即从新位置继续
   * @return {void} 无返回值
   */
  seek(positionMs: number): void {
    const targetMs = Math.max(0, positionMs)
    if (this.currentStatus === 'playing') {
      this.play(targetMs)
      return
    }
    this.positionMs = targetMs
  }

  /**
   * @description: 停止播放，抬起所有键并把位置归零
   * @return {void} 无返回值
   */
  stop(): void {
    this.clearTimer()
    this.releaseAllKeys()
    this.currentStatus = 'idle'
    this.positionMs = 0
    this.cursor = 0
  }

  /**
   * @description: 获取当前音乐时间位置
   * @return {number} 位置（毫秒），播放中按时钟实时推算
   */
  getPositionMs(): number {
    if (this.currentStatus !== 'playing') return this.positionMs
    return Math.min(this.durationMs, (this.now() - this.anchorMs) * this.speed)
  }

  /**
   * @description: 销毁执行器，等价于 stop
   * @return {void} 无返回值
   */
  dispose(): void {
    this.stop()
  }

  /**
   * @description: 二分查找第一个时刻不早于指定位置的事件下标
   * @param {number} positionMs 音乐时间位置（毫秒）
   * @return {number} 事件下标，全部早于该位置时返回 events.length
   */
  private findFirstEventIndex(positionMs: number): number {
    let low = 0
    let high = this.events.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (this.events[mid].atMs < positionMs) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }

  /**
   * @description: 计算指定下标之前的事件回放后仍处于按下状态的键
   * @param {number} endIndex 事件下标上界（不含）
   * @return {Set<string>} 应处于按下状态的物理键集合
   */
  private collectKeysHeldAt(endIndex: number): Set<string> {
    const held = new Set<string>()
    for (let i = 0; i < endIndex; i++) {
      const event = this.events[i]
      if (event.type === 'down') {
        held.add(event.key)
      } else {
        held.delete(event.key)
      }
    }
    return held
  }

  /**
   * @description: 调度下一个事件；时间轴走完时进入 ended 状态
   * @return {void} 无返回值
   */
  private scheduleNext(): void {
    if (this.cursor >= this.events.length) {
      this.currentStatus = 'ended'
      this.positionMs = this.durationMs
      // 编译结果保证此刻不会有键残留按下，这里是防御性兜底
      this.releaseAllKeys()
      this.onEnded?.()
      return
    }

    const nextAtWallMs = this.anchorMs + this.events[this.cursor].atMs / this.speed
    const delayMs = Math.max(0, nextAtWallMs - this.now())
    this.timer = setTimeout(() => {
      this.timer = null
      this.flushDueEvents()
    }, delayMs)
  }

  /**
   * @description: 派发所有已到期的事件，然后调度下一批
   * @description 每次都以真实时钟换算当前音乐时刻，定时器抖动由此自我纠正、不累积。
   * @return {void} 无返回值
   */
  private flushDueEvents(): void {
    const nowMusicMs = (this.now() - this.anchorMs) * this.speed
    while (
      this.cursor < this.events.length &&
      this.events[this.cursor].atMs <= nowMusicMs + DUE_EPSILON_MS
    ) {
      this.dispatch(this.events[this.cursor])
      this.cursor++
    }
    this.scheduleNext()
  }

  /**
   * @description: 派发单个按键事件并维护按下状态集合
   * @param {KeystrokeEvent} event 待派发事件
   * @return {void} 无返回值
   */
  private dispatch(event: KeystrokeEvent): void {
    if (event.type === 'down') {
      if (this.downKeys.has(event.key)) {
        // 编译结果同键 down/up 严格交替，正常不会走到；兜底先抬起避免游戏丢事件
        this.onKeyUp(event.key)
      }
      this.downKeys.add(event.key)
      this.onKeyDown(event.key)
      return
    }
    // down 因暂停/跳转被跳过时，对应的 up 直接忽略
    if (!this.downKeys.delete(event.key)) return
    this.onKeyUp(event.key)
  }

  /**
   * @description: 抬起所有仍按下的物理键
   * @return {void} 无返回值
   */
  private releaseAllKeys(): void {
    for (const key of this.downKeys) {
      this.onKeyUp(key)
    }
    this.downKeys.clear()
  }

  /**
   * @description: 清除调度定时器
   * @return {void} 无返回值
   */
  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
