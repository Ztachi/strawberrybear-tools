import type { PianoWorkspaceState } from '@/features/piano-editor'
import type {
  MidiProjectEditorCommand,
  MidiProjectEditorPresentation,
  MidiProjectEditorRequest,
  MidiProjectEditorUpdate,
  MidiProjectEditorWindowHandle,
  MidiProjectEditorWindowPort,
} from './protocol'

interface MidiProjectEditorWindowSessionOptions {
  port: MidiProjectEditorWindowPort
  presentation: () => MidiProjectEditorPresentation | undefined
  viewport: () => PianoWorkspaceState | undefined
  onCommand: (command: MidiProjectEditorRequest) => void
  onDock: () => Promise<void>
  onStatus: (status: 'docked' | 'opening' | 'detached') => void
  onError: (error: unknown) => void
  onClientReset?: () => void
}

/** MIDI 项目编辑页与独立窗口之间的单实例会话。 */
export class MidiProjectEditorWindowSession {
  private session = ''
  private sequence = 0
  private received = 0
  private clientId = ''
  private ready = false
  private sending = false
  private statePending = false
  private pingPending = false
  private viewportPending = false
  private handle?: MidiProjectEditorWindowHandle
  private cleanups: (() => void)[] = []
  private timer?: ReturnType<typeof setTimeout>

  constructor(private readonly options: MidiProjectEditorWindowSessionOptions) {}

  /** 打开独立窗口；已有会话只激活原窗口。 */
  async open(): Promise<void> {
    if (this.session) {
      try {
        await this.handle?.focus()
      } catch (error) {
        this.options.onError(error)
      }
      return
    }
    const session = crypto.randomUUID()
    this.session = session
    this.ready = false
    this.received = 0
    this.clientId = ''
    this.sequence = 0
    this.statePending = true
    this.pingPending = false
    this.viewportPending = true
    this.options.onStatus('opening')
    this.timer = setTimeout(
      () => this.fail(new Error('MIDI project editor window did not become ready')),
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
        if (this.session === session) this.release(false)
      })
      if (this.session !== session) unlistenDestroyed()
      else this.cleanups.push(unlistenDestroyed)
    } catch (error) {
      if (this.session === session) this.fail(error)
    }
  }

  /** 激活已经打开的窗口。 */
  async focus(): Promise<void> {
    if (!this.session) return
    try {
      await this.handle?.focus()
    } catch (error) {
      this.options.onError(error)
    }
  }

  /** 从主窗口把编辑器还原回当前页面。 */
  async restore(): Promise<void> {
    if (!this.session || !this.ready) {
      await this.dock()
      return
    }
    const session = this.session
    try {
      await this.options.port.send({
        kind: 'dock',
        session,
        clientId: this.clientId,
        sequence: ++this.sequence,
      })
    } catch (error) {
      if (this.session === session) this.fail(error)
    }
  }

  /** 编辑状态变化后合并为最新快照发送。 */
  updateState(includeViewport = false): void {
    this.statePending = true
    this.viewportPending ||= includeViewport
    void this.flush()
  }

  /** 向独立窗口显示一次操作反馈。 */
  notify(level: 'success' | 'error' | 'warning', title: string, description?: string): void {
    if (!this.ready || !this.session) return
    const update: MidiProjectEditorUpdate = {
      kind: 'notice',
      session: this.session,
      clientId: this.clientId,
      sequence: ++this.sequence,
      level,
      title,
      ...(description ? { description } : {}),
    }
    void this.options.port.send(update).catch((error) => this.fail(error))
  }

  /** 录制准备/结果应用的回执，子窗口收到成功后才关闭本地工作区。 */
  replyRecording(requestId: string, error?: string): void {
    if (!this.ready || !this.session) return
    void this.options.port
      .send({
        kind: 'recording-reply',
        session: this.session,
        clientId: this.clientId,
        sequence: ++this.sequence,
        requestId,
        ...(error ? { error } : {}),
      })
      .catch((cause) => this.fail(cause))
  }

  /** 主窗口主动结束编辑时关闭子窗口，不执行还原导航。 */
  async close(): Promise<void> {
    await this.release(true)
  }

  /** 独立窗口请求还原：先恢复主页面，再销毁窗口。 */
  private async dock(): Promise<void> {
    const session = this.session
    try {
      await this.options.onDock()
      if (this.session === session) await this.release(true)
    } catch (error) {
      if (this.session === session) this.options.onError(error)
    }
  }

  private fail(error: unknown): void {
    this.options.onError(error)
    void this.release(true)
  }

  private async release(destroy: boolean): Promise<void> {
    if (!this.session && !this.handle) return
    this.session = ''
    this.ready = false
    clearTimeout(this.timer)
    const handle = this.handle
    this.handle = undefined
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    if (destroy && handle) {
      try {
        await handle.destroy()
      } catch (error) {
        this.options.onError(error)
      }
    }
    this.options.onStatus('docked')
  }

  private receive(request: MidiProjectEditorRequest): void {
    if (!request || !this.session || request.session !== this.session) return
    if (
      !Number.isSafeInteger(request.sequence) ||
      typeof request.clientId !== 'string' ||
      !request.clientId
    )
      return
    if (request.kind === 'ready') {
      if (this.clientId && this.clientId !== request.clientId) this.options.onClientReset?.()
      this.clientId = request.clientId
      this.received = request.sequence
      this.ready = true
      this.statePending = true
      this.viewportPending = true
      this.pingPending = false
      void this.flush()
      return
    }
    // 刷新使用新客户端身份；旧窗口的高序号回包不能覆盖新快照或阻断新请求。
    if (request.clientId !== this.clientId || request.sequence <= this.received) return
    this.received = request.sequence
    if (request.kind === 'ping') {
      this.pingPending = true
      void this.flush()
      return
    }
    if (request.kind === 'shown') {
      clearTimeout(this.timer)
      this.options.onStatus('detached')
      return
    }
    if (request.kind === 'dock') {
      void this.dock()
      return
    }
    this.options.onCommand(request)
  }

  private async flush(): Promise<void> {
    if (this.sending || !this.ready || !this.session) return
    const session = this.session
    this.sending = true
    try {
      while (this.session === session && this.ready && (this.statePending || this.pingPending)) {
        if (this.statePending) {
          this.statePending = false
          const presentation = this.options.presentation()
          if (!presentation) {
            // 路由换源会先释放旧会话再装配新会话；等待下一次有效状态，不能销毁独立窗口。
            this.statePending = true
            // 临时空状态也要续租，避免子窗口把仍然有效的宿主误判为失联。
            if (this.pingPending) {
              this.pingPending = false
              await this.options.port.send({
                kind: 'pong',
                session,
                clientId: this.clientId,
                sequence: ++this.sequence,
              })
            }
            break
          }
          const viewport = this.viewportPending ? this.options.viewport() : undefined
          this.viewportPending = false
          await this.options.port.send({
            kind: 'state',
            session,
            clientId: this.clientId,
            sequence: ++this.sequence,
            presentation,
            ...(viewport ? { viewport } : {}),
          })
        } else {
          this.pingPending = false
          await this.options.port.send({
            kind: 'pong',
            session,
            clientId: this.clientId,
            sequence: ++this.sequence,
          })
        }
      }
    } catch (error) {
      if (this.session === session) this.fail(error)
    } finally {
      this.sending = false
      const presentationReady =
        !!this.session && this.ready && this.statePending && !!this.options.presentation()
      if (
        this.session &&
        (this.session !== session || (this.ready && (this.pingPending || presentationReady)))
      )
        void this.flush()
    }
  }
}

export type { MidiProjectEditorCommand, MidiProjectEditorPresentation }
