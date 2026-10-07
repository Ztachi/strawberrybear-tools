/** 键盘录制状态机；按键输入、音频时钟及本地编辑会话独立于页面和平台。 */
import { createEditorSession, resolutionTicks } from '@strawberrybear/midi-editor'
import type {
  EditorAction,
  PianoRollNote,
  MidiProject,
  EditorSessionState,
} from '@strawberrybear/midi-editor'
import { clipNoteToTrackRegion, createTimeline } from '@strawberrybear/piano-roll/core'
import type { KeyTemplate } from '@/types'
import type {
  RecorderAudio,
  RecorderMode,
  RecorderStatus,
  TrackRecorderInput,
  TrackRecorderResult,
} from './types'

interface HeldKey {
  key: string
  sources: Set<string>
  voice: { stop(): void } | null
  note?: PianoRollNote
}

/** 保留重录区间外的原音符；两侧都存在时右侧使用新 ID。 */
export function replaceNoteRange(
  notes: readonly PianoRollNote[],
  range: { startTick: number; endTick: number }
): PianoRollNote[] {
  return notes.flatMap((note) => {
    if (note.endTick <= range.startTick || note.startTick >= range.endTick) return [{ ...note }]
    const parts: PianoRollNote[] = []
    if (note.startTick < range.startTick) parts.push({ ...note, endTick: range.startTick })
    if (note.endTick > range.endTick)
      parts.push({
        ...note,
        id: parts.length ? crypto.randomUUID() : note.id,
        startTick: range.endTick,
      })
    return parts
  })
}

export class TrackRecorder {
  readonly editor
  status: RecorderStatus = 'idle'
  mode: RecorderMode = 'append'
  countIn = false
  metronome = false
  accompaniment = true
  template: KeyTemplate
  range?: { startTick: number; endTick: number }
  cursorTick: number
  private held = new Map<string, HeldKey>()
  private sources = new Map<string, string>()
  private pendingAuditions = new Map<string, symbol>()
  private take: PianoRollNote[] = []
  private anchorClock = 0
  private anchorTick = 0
  private takeStart = 0
  private countEnd = 0
  private countStart = 0
  private nextClickTick = 0
  private generation = 0
  private listeners = new Set<() => void>()
  private initialNotes: PianoRollNote[]
  private initialEnd: number
  private replaceBase?: PianoRollNote[]
  private restored = false
  private baseTemplate: string
  private emptyInitially: boolean

  constructor(
    readonly input: TrackRecorderInput,
    readonly audio: RecorderAudio
  ) {
    const project = JSON.parse(JSON.stringify(input.project)) as MidiProject
    const saved = project.extensions?.keyboardRecording as { template?: KeyTemplate } | undefined
    this.template = JSON.parse(
      JSON.stringify(
        saved?.template ??
          input.templates.find((t) => t.id === input.templateId) ??
          input.templates[0] ?? { id: '', name: '', is_builtin: false, mappings: [] }
      )
    )
    this.baseTemplate = JSON.stringify(this.template)
    this.editor = createEditorSession(project, { snap: 'off' })
    this.editor.subscribe(() => this.notify())
    this.range = input.range
    this.cursorTick = input.startTick
    this.initialNotes = project.document.notes.filter((note) => note.trackId === input.trackId)
    const track = project.document.tracks.find((t) => t.id === input.trackId)
    if (!track) throw new Error('Recording track does not exist')
    this.initialEnd = track.endTick ?? project.document.durationTicks
    this.emptyInitially = !this.initialNotes.some((note) => clipNoteToTrackRegion(note, track))
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private notify(): void {
    for (const listener of this.listeners) listener()
  }
  get busy(): boolean {
    return ['preparing', 'armed', 'counting', 'recording', 'paused'].includes(this.status)
  }
  get dirty(): boolean {
    return (
      this.restored ||
      this.editor.getState().dirty ||
      this.take.length > 0 ||
      JSON.stringify(this.template) !== this.baseTemplate
    )
  }
  private timeline() {
    return createTimeline(this.editor.getState().document)
  }
  private lastEnd(): number {
    const doc = this.editor.getState().document
    const track = doc.tracks.find((t) => t.id === this.input.trackId)!
    return Math.max(
      track.startTick ?? 0,
      ...doc.notes
        .filter((n) => n.trackId === track.id)
        .flatMap((n) => {
          const visible = clipNoteToTrackRegion(n, track)
          return visible ? [visible.endTick] : []
        })
    )
  }
  selectTemplate(template: KeyTemplate): void {
    if (this.busy) return
    this.releaseAll()
    this.template = JSON.parse(JSON.stringify(template))
    this.notify()
  }
  setRange(range: { startTick: number; endTick: number } | null): void {
    if (this.busy) return
    this.range = range && range.endTick > range.startTick ? { ...range } : undefined
    this.notify()
  }
  /** 修改录制方式前收尾暂停的 take，避免使用新方式提交旧录音。 */
  configureMode(mode: RecorderMode, range?: { startTick: number; endTick: number }): void {
    if (this.status === 'paused') this.stop()
    if (this.busy || this.status === 'disposed') return
    if (range) this.setRange(range)
    this.mode = mode
    this.notify()
  }
  private recordedEnd(state: EditorSessionState): number {
    const originalEnd =
      state.document.tracks.find((track) => track.id === this.input.trackId)!.endTick ??
      this.initialEnd
    if (!this.take.length) return originalEnd
    const extent = Math.max(
      ...this.take.map((note) => note.endTick),
      this.countIn ? this.cursorTick : 0,
      this.mode === 'replace' ? (this.range?.endTick ?? 0) : 0
    )
    return this.emptyInitially && !this.restored && !state.dirty && this.mode === 'append'
      ? extent
      : Math.max(originalEnd, extent)
  }
  async start(): Promise<void> {
    if (this.busy || this.status === 'disposed') return
    if (!this.template.mappings.length) throw new Error('No keyboard mapping')
    if (this.mode === 'replace' && !this.range) throw new Error('No recording range')
    this.take = []
    this.releaseAll()
    this.replaceBase =
      this.mode === 'replace' && this.range
        ? replaceNoteRange(
            this.editor.getState().document.notes.filter((n) => n.trackId === this.input.trackId),
            this.range
          )
        : undefined
    this.takeStart =
      this.mode === 'append'
        ? this.lastEnd()
        : this.mode === 'replace'
          ? this.range!.startTick
          : Math.max(0, this.cursorTick)
    this.cursorTick = this.takeStart
    await this.arm()
  }
  async resume(): Promise<void> {
    if (this.status !== 'paused') return
    await this.arm()
  }
  private async arm(): Promise<void> {
    const generation = ++this.generation
    this.status = 'preparing'
    this.notify()
    try {
      await this.audio.prepare()
      if (generation !== this.generation) return
      if (this.countIn) {
        this.countStart = this.audio.now()
        const bar = resolutionTicks('bar', this.editor.getState().document, this.cursorTick)
        this.countEnd =
          this.countStart +
          this.timeline().tickToSeconds(this.cursorTick + bar) -
          this.timeline().tickToSeconds(this.cursorTick)
        this.status = 'counting'
        this.nextClickTick = this.cursorTick
        this.scheduleClicks(this.countStart, this.cursorTick, this.countEnd)
      } else this.status = 'armed'
      this.notify()
    } catch (error) {
      if (generation === this.generation) {
        this.status = this.take.length ? 'paused' : 'idle'
        this.notify()
      }
      throw error
    }
  }
  private begin(clock: number): void {
    this.anchorClock = clock
    this.anchorTick = this.cursorTick
    this.status = 'recording'
    this.nextClickTick = this.cursorTick
    if (this.accompaniment) {
      const doc = this.editor.getState().document
      // 自由续录不回放目标轨；叠加保留目标轨，重录只静音选段。
      const tracks = doc.tracks.map((t) => ({
        ...t,
        enabled: t.enabled && (t.id !== this.input.trackId || this.mode !== 'append'),
      }))
      this.audio.startAccompaniment(
        { ...doc, tracks },
        this.cursorTick,
        this.mode === 'replace' ? this.range : undefined,
        clock
      )
    }
  }
  private tickNow(): number {
    const timeline = this.timeline()
    const tick = Math.round(
      timeline.secondsToTick(
        timeline.tickToSeconds(this.anchorTick) + Math.max(0, this.audio.now() - this.anchorClock)
      )
    )
    return this.mode === 'replace' && this.range ? Math.min(tick, this.range.endTick) : tick
  }
  /** 试听准备也受输入来源生命周期约束，释放或取消后不启动迟到的声音。 */
  async auditionPress(key: string, source: string): Promise<void> {
    if (this.busy || this.status === 'disposed' || this.pendingAuditions.has(source)) return
    const token = Symbol(source)
    this.pendingAuditions.set(source, token)
    try {
      await this.audio.prepare()
      if (this.pendingAuditions.get(source) === token && !this.busy) this.press(key, source)
    } finally {
      if (this.pendingAuditions.get(source) === token) this.pendingAuditions.delete(source)
    }
  }
  /** 同一映射键的不同输入来源共用一个音符，最后一个来源释放才结束。 */
  press(key: string, source: string): void {
    if (this.status === 'disposed' || this.status === 'preparing' || this.sources.has(source))
      return
    const normalized = key.trim().toUpperCase()
    const mapping = this.template.mappings.find((m) => m.key.trim().toUpperCase() === normalized)
    if (!mapping) return
    this.advance()
    if (this.status === 'armed') this.begin(this.audio.now())
    this.sources.set(source, normalized)
    const existing = this.held.get(normalized)
    if (existing) {
      existing.sources.add(source)
      return
    }
    const held: HeldKey = {
      key: normalized,
      sources: new Set([source]),
      voice: this.audio.note(mapping.pitch, 80),
    }
    if (this.status === 'recording') {
      held.note = {
        id: crypto.randomUUID(),
        trackId: this.input.trackId,
        pitch: mapping.pitch,
        velocity: 80,
        startTick: this.tickNow(),
        endTick: this.tickNow() + 1,
      }
      this.take.push(held.note)
    }
    this.held.set(normalized, held)
    this.notify()
  }
  release(source: string): void {
    this.pendingAuditions.delete(source)
    const key = this.sources.get(source)
    if (!key) return
    this.sources.delete(source)
    const held = this.held.get(key)
    if (!held) return
    held.sources.delete(source)
    if (held.sources.size) return
    this.closeHeld(held)
    this.held.delete(key)
    this.notify()
  }
  private closeHeld(held: HeldKey): void {
    held.voice?.stop()
    if (held.note)
      held.note.endTick = Math.max(
        held.note.startTick + 1,
        this.status === 'recording' ? this.tickNow() : this.cursorTick
      )
  }
  releaseAll(): void {
    for (const held of this.held.values()) this.closeHeld(held)
    this.held.clear()
    this.sources.clear()
    this.pendingAuditions.clear()
  }
  activeKeys(): string[] {
    return [...this.held.keys()]
  }
  advance(): void {
    if (this.status === 'counting') {
      this.scheduleClicks(this.countStart, this.cursorTick, this.countEnd)
      if (this.audio.now() >= this.countEnd) this.begin(this.countEnd)
    }
    if (this.status === 'recording') {
      this.cursorTick = this.tickNow()
      for (const held of this.held.values())
        if (held.note) held.note.endTick = Math.max(held.note.startTick + 1, this.cursorTick)
      if (this.metronome) this.scheduleClicks(this.anchorClock, this.anchorTick)
      if (this.mode === 'replace' && this.range && this.cursorTick >= this.range.endTick)
        this.stop()
    }
  }
  private scheduleClicks(clock: number, tick: number, until = Infinity): void {
    const timeline = this.timeline()
    const horizon = Math.min(this.audio.now() + 0.1, until)
    for (let count = 0; count < 128; count++) {
      const when = clock + timeline.tickToSeconds(this.nextClickTick) - timeline.tickToSeconds(tick)
      if (when >= until || when > horizon) break
      const position = timeline.tickToBarPosition(this.nextClickTick)
      if (when >= this.audio.now() - 0.1) this.audio.click?.(position.beat === 1, when)
      const meter = [...timeline.timeSignatureMap]
        .reverse()
        .find((point) => point.tick <= this.nextClickTick)
      const beatTicks = (timeline.ticksPerBeat * 4) / (meter?.denominator ?? 4)
      const next = this.nextClickTick + beatTicks - position.tickInBeat
      const change = timeline.timeSignatureMap.find(
        (point) => point.tick > this.nextClickTick && point.tick < next
      )
      this.nextClickTick = change?.tick ?? next
    }
  }
  pause(): void {
    if (!this.busy) {
      this.releaseAll()
      return
    }
    if (this.status === 'recording') this.cursorTick = this.tickNow()
    this.releaseAll()
    this.audio.stopAccompaniment()
    ++this.generation
    if (!this.countIn)
      this.cursorTick = Math.max(this.takeStart, ...this.take.map((n) => n.endTick))
    this.status = 'paused'
    this.notify()
  }
  stop(): void {
    if (!this.busy) return
    if (this.status === 'recording') this.cursorTick = this.tickNow()
    this.releaseAll()
    this.audio.stopAccompaniment()
    ++this.generation
    if (this.take.length) {
      const state = this.editor.getState()
      let notes = state.document.notes.filter((n) => n.trackId === this.input.trackId)
      if (this.mode === 'replace' && this.range)
        notes = this.replaceBase ?? replaceNoteRange(notes, this.range)
      notes = [...notes, ...this.take.map((n) => ({ ...n }))]
      const takeEnd = Math.max(...this.take.map((n) => n.endTick))
      const end = this.recordedEnd(state)
      this.editor.dispatch({
        type: 'apply-track-edit',
        trackId: this.input.trackId,
        notes,
        endTick: end,
      })
      if (!this.countIn) this.cursorTick = takeEnd
    }
    this.take = []
    this.status = 'stopped'
    this.notify()
  }
  dispatch(action: EditorAction): void {
    if (this.status === 'paused') this.stop()
    if (this.busy || this.status === 'disposed') return
    if (action.type === 'loop-change') {
      this.setRange(action.loop)
      return
    }
    // 单轨工作区不能通过全选或剪贴板越界修改其他轨。
    const ids = new Set(
      this.editor
        .getState()
        .document.notes.filter((n) => n.trackId === this.input.trackId)
        .map((n) => n.id)
    )
    const permitted = [
      'select',
      'select-all',
      'clear-selection',
      'add-note',
      'move',
      'resize',
      'set-velocity',
      'delete',
      'undo',
      'redo',
      'copy',
      'cut',
      'paste',
      'duplicate',
      'quantize',
      'transpose',
      'set-selected-velocity',
      'nudge',
      'set-snap',
      'set-tool',
      'resize-track-region',
    ]
    if (!permitted.includes(action.type)) return
    if (action.type === 'resize-track-region' && action.trackId !== this.input.trackId) return
    if (action.type === 'select-all') action = { ...action, trackId: this.input.trackId }
    if ('noteIds' in action)
      action = { ...action, noteIds: action.noteIds.filter((id) => ids.has(id)) }
    if (action.type === 'set-velocity')
      action = { ...action, changes: action.changes.filter((change) => ids.has(change.noteId)) }
    if (action.type === 'add-note' || action.type === 'paste')
      action = { ...action, trackId: this.input.trackId }
    this.editor.dispatch(action)
  }
  restoreDraft(project: MidiProject): void {
    this.editor.replaceProject({ ...project, id: this.input.project.id })
    const draft = project.extensions?.recordingDraft as { cursorTick?: number } | undefined
    const binding = project.extensions?.keyboardRecording as { template?: KeyTemplate } | undefined
    if (binding?.template) this.template = JSON.parse(JSON.stringify(binding.template))
    if (Number.isFinite(draft?.cursorTick)) this.cursorTick = draft!.cursorTick!
    this.restored = true
    this.notify()
  }
  /** 录制中的预览投影不进入撤销栈，也不修改输入项目。 */
  preview(): EditorSessionState {
    const state = this.editor.getState()
    if (!this.take.length)
      return { ...state, project: { ...state.project, loop: this.range ?? null } }
    const document = {
      ...state.document,
      notes: [
        ...state.document.notes.filter((n) =>
          this.replaceBase ? n.trackId !== this.input.trackId : true
        ),
        ...(this.replaceBase ?? []),
        ...this.take.map((n) => ({ ...n })),
      ],
      tracks: state.document.tracks.map((t) =>
        t.id === this.input.trackId
          ? {
              ...t,
              endTick: Math.max(t.endTick ?? 0, this.cursorTick + state.document.ticksPerBeat),
            }
          : t
      ),
      durationTicks: Math.max(
        state.document.durationTicks,
        this.cursorTick + state.document.ticksPerBeat
      ),
    }
    return { ...state, document, project: { ...state.project, document, loop: this.range ?? null } }
  }
  result(): TrackRecorderResult {
    const doc = this.editor.getState().document
    return {
      projectId: this.input.project.id,
      trackId: this.input.trackId,
      baseRevision: this.input.baseRevision,
      notes: doc.notes.filter((n) => n.trackId === this.input.trackId).map((n) => ({ ...n })),
      endTick: doc.tracks.find((t) => t.id === this.input.trackId)!.endTick ?? this.initialEnd,
      template: JSON.parse(JSON.stringify(this.template)),
      cursorTick: this.cursorTick,
    }
  }
  checkpoint(): MidiProject {
    this.advance()
    const state = this.preview()
    const original = this.editor.getState()
    const endTick = this.recordedEnd(original)
    const document = {
      ...state.document,
      tracks: state.document.tracks.map((track) =>
        track.id === this.input.trackId ? { ...track, endTick } : track
      ),
    }
    return {
      ...state.project,
      document,
      loop: this.input.project.loop,
      extensions: {
        ...state.project.extensions,
        keyboardRecording: { template: this.template },
        recordingDraft: {
          baseRevision: this.input.baseRevision,
          trackId: this.input.trackId,
          cursorTick: this.cursorTick,
        },
      },
    }
  }
  dispose(): void {
    this.pause()
    ++this.generation
    this.status = 'disposed'
    this.releaseAll()
    this.audio.stopAccompaniment()
    this.listeners.clear()
  }
}
