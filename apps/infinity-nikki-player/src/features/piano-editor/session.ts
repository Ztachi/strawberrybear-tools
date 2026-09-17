import type { PianoRollTransport } from '@strawberrybear/piano-roll/browser'
import type {
  EditorCommand,
  EditorPresentation,
  EditorRequest,
  EditorUpdate,
  EditorWindowHandle,
  EditorWindowPort,
  PianoWorkspaceState,
} from './protocol'
import { validWorkspace } from './protocol'
import { presentationNow } from './presentation-clock'

interface SessionOptions {
  port: EditorWindowPort
  state: () => EditorPresentation
  transport: () => PianoRollTransport
  viewport: () => PianoWorkspaceState | undefined
  onCommand: (command: EditorCommand) => void
  onStatus: (status: 'docked' | 'opening' | 'detached') => void
  onError: (error: unknown) => void
}

/**
 * 单个音轨面板的分离会话。按序发送元数据，播放帧只保留最新一份，绝不积压整曲数据。
 * 主页面是唯一操作权威；只接收当前 session/revision 的命令。
 */
export class PianoEditorSession {
  private session = ''
  private revision = 0
  private sequence = 0
  private received = 0
  private handle?: EditorWindowHandle
  private cleanups: (() => void)[] = []
  private timer?: ReturnType<typeof setTimeout>
  private ready = false
  private statePending = false
  private transportPending = false
  private sending = false
  private lastDocument?: EditorPresentation['document']
  private restorePending = false
  private readiness = 0
  private sample?: { transport: PianoRollTransport; sampledAt: number }
  private transportTimer?: ReturnType<typeof setTimeout>
  private lastTransportSent = -Infinity

  constructor(private readonly options: SessionOptions) {}

  /** 打开期间防重入；只有子窗口确认首屏数据后才隐藏内嵌面板。 */
  async open(): Promise<void> {
    if (this.session) {
      try {
        if (this.ready) await this.handle?.focus()
      } catch (error) {
        this.options.onError(error)
      }
      return
    }
    const session = crypto.randomUUID()
    this.session = session
    this.ready = false
    this.received = 0
    this.lastDocument = undefined
    this.restorePending = true
    this.options.onStatus('opening')
    this.timer = setTimeout(
      () => this.fail(new Error('Piano editor window did not become ready')),
      10000
    )
    try {
      const unlisten = await this.options.port.listen((request) => this.receive(request))
      if (this.session !== session) {
        unlisten()
        return
      }
      this.cleanups.push(unlisten)
      const handle = await this.options.port.open(session)
      if (this.session !== session) {
        await handle.destroy()
        return
      }
      this.handle = handle
      const unlistenDestroyed = await handle.onDestroyed(() => {
        if (this.session === session) void this.dock(false)
      })
      if (this.session !== session) unlistenDestroyed()
      else this.cleanups.push(unlistenDestroyed)
    } catch (error) {
      if (this.session === session) this.fail(error)
    }
  }

  /** 数据身份变化立即作废旧命令；切歌恢复该歌曲偏好，切轨保留子窗口独立视口。 */
  updateState(restoreViewport = false): void {
    this.revision += 1
    this.statePending = true
    this.restorePending ||= restoreViewport
    void this.flush()
  }

  /** 音频时钟保持主窗口权威，不在子窗口创建第二个播放时钟。 */
  updateTransport(): void {
    const sampledAt = presentationNow()
    const transport = this.options.transport()
    const previous = this.sample
    this.sample = { transport: { ...transport }, sampledAt }
    const expected = previous
      ? previous.transport.positionSeconds +
        (previous.transport.isPlaying
          ? ((sampledAt - previous.sampledAt) / 1000) * previous.transport.playbackRate
          : 0)
      : 0
    const discontinuity =
      !previous ||
      transport.isPlaying !== previous.transport.isPlaying ||
      transport.playbackRate !== previous.transport.playbackRate ||
      Math.abs(expected - transport.positionSeconds) > 0.025
    clearTimeout(this.transportTimer)
    // 连续时钟每 50ms 最多发布一次；暂停、倍速、seek 和拖拽预览立即发布。
    const remaining = discontinuity ? 0 : Math.max(0, 50 - (sampledAt - this.lastTransportSent))
    const publish = (): void => {
      this.transportPending = true
      void this.flush()
    }
    if (remaining === 0) publish()
    else this.transportTimer = setTimeout(publish, remaining)
  }

  /** 关闭、路由离开或创建失败都释放同一个会话，迟到回包不能重新打开窗口。 */
  async dock(destroy = true): Promise<void> {
    this.session = ''
    this.ready = false
    clearTimeout(this.timer)
    clearTimeout(this.transportTimer)
    this.sample = undefined
    this.lastTransportSent = -Infinity
    const handle = this.handle
    this.handle = undefined
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.options.onCommand({ kind: 'preview', seconds: null })
    this.options.onStatus('docked')
    if (destroy && handle) {
      try {
        await handle.destroy()
      } catch (error) {
        this.options.onError(error)
      }
    }
  }

  private fail(error: unknown): void {
    this.options.onError(error)
    void this.dock()
  }

  private receive(request: EditorRequest): void {
    if (
      !request ||
      request.session !== this.session ||
      !this.session ||
      !Number.isSafeInteger(request.sequence)
    )
      return
    if (request.kind === 'ready') {
      this.readiness += 1
      this.received = request.sequence
      this.ready = true
      this.lastDocument = undefined
      this.restorePending = true
      this.statePending = true
      this.transportPending = true
      void this.flush()
      return
    }
    if (request.sequence <= this.received) return
    this.received = request.sequence
    if (request.kind === 'ping') {
      // 心跳只续约，不是音频采样。重发时保留原始时刻，否则缓存进度会周期性拉回显示时钟。
      this.transportPending = true
      void this.flush()
      return
    }
    // 还原窗口是会话操作，切歌中的 dock 也应响应；其它动作必须匹配当前数据身份。
    if (request.kind === 'dock') {
      void this.dock()
      return
    }
    if (request.revision !== this.revision) return
    if (this.options.state().loading) return
    if (request.kind === 'shown') {
      clearTimeout(this.timer)
      this.options.onStatus('detached')
    } else if (request.kind === 'viewport' && validWorkspace(request.viewport))
      this.options.onCommand(request)
    else if (
      request.kind === 'toggle-track' &&
      this.options.state().document.tracks.some((track) => track.id === request.trackId)
    )
      this.options.onCommand(request)
    else if (
      (request.kind === 'seek' || request.kind === 'preview') &&
      (Number.isFinite(request.seconds) || (request.kind === 'preview' && request.seconds === null))
    )
      this.options.onCommand(request)
  }

  private async flush(): Promise<void> {
    if (this.sending || !this.ready || !this.session) return
    const session = this.session
    this.sending = true
    try {
      while (
        this.session === session &&
        this.ready &&
        (this.statePending || this.transportPending)
      ) {
        let update: EditorUpdate
        if (this.statePending) {
          this.statePending = false
          const state = this.options.state()
          const readiness = this.readiness
          update = {
            kind: 'state',
            session,
            revision: this.revision,
            sequence: ++this.sequence,
            state: {
              ...state,
              document:
                state.loading || state.document === this.lastDocument ? undefined : state.document,
            },
            viewport: this.restorePending ? this.options.viewport() : undefined,
          }
          this.restorePending = false
          await this.options.port.send(update)
          // 子窗口可能在大文档发送期间刷新；旧发送完成不能覆盖新握手的缓存失效。
          // loading 通知不装配曲谱；只有子窗口会实际应用的快照才能进入已发送缓存。
          if (!state.loading && this.session === session && this.readiness === readiness)
            this.lastDocument = state.document
          this.transportPending = true
        } else {
          this.transportPending = false
          // 首次握手也保存样本，保证没有新采样时的心跳／元数据更新不会重新生成时间戳。
          this.sample ??= {
            transport: { ...this.options.transport() },
            sampledAt: presentationNow(),
          }
          update = {
            kind: 'transport',
            session,
            revision: this.revision,
            sequence: ++this.sequence,
            ...this.sample,
          }
          this.lastTransportSent = presentationNow()
          await this.options.port.send(update)
        }
      }
    } catch (error) {
      if (this.session === session) this.fail(error)
    } finally {
      this.sending = false
      if (this.session && this.session !== session) void this.flush()
    }
  }
}
