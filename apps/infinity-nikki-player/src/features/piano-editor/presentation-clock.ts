import type { PianoRollTransport } from '@strawberrybear/piano-roll/browser'

/** 跨 WebView 可比较的单调时间：不同窗口的 performance.now() 起点并不相同。 */
export function presentationNow(): number {
  return performance.timeOrigin + performance.now()
}

/**
 * 独立窗口的展示时钟，只外推主播放器给出的源时间，不调度音频或改变音符时间。
 * IPC 不再决定显示帧率；窗口每个 RAF 根据同一锚点计算连续位置。
 */
export class PianoPresentationClock {
  private transport: PianoRollTransport = { positionSeconds: 0, isPlaying: false, playbackRate: 1 }
  private sampledAt = 0

  /** @param transport 主播放器的快照。@param sampledAt 快照采样时刻，而非接收时刻。 */
  receive(transport: PianoRollTransport, sampledAt: number): void {
    if (
      !Number.isFinite(sampledAt) ||
      !Number.isFinite(transport.positionSeconds) ||
      !Number.isFinite(transport.playbackRate)
    )
      return
    this.transport = { ...transport }
    this.sampledAt = sampledAt
  }

  /** @param now 当前显示帧时刻。@param duration 曲目完整秒数。@return 当前只读展示位置。 */
  read(now: number, duration: number): PianoRollTransport {
    // 最小化恢复仍读取最近权威锚点；失联超过两秒冻结，不无限播放一份过期画面。
    const elapsed = this.transport.isPlaying
      ? Math.max(0, Math.min(2000, now - this.sampledAt)) / 1000
      : 0
    return {
      ...this.transport,
      positionSeconds: Math.max(
        0,
        Math.min(duration, this.transport.positionSeconds + elapsed * this.transport.playbackRate)
      ),
    }
  }
}
