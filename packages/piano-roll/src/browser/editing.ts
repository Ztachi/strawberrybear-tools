import type { PianoRollNote, PianoRollNoteIndex, PianoRollTimeline } from '../core'
import { canvasContext, type RenderFrame } from './renderer'
import type { PianoRollTheme } from './theme'
import type { PianoRollEditIntent, PianoRollEditingOptions } from './types'

/** 音符左右边缘的拉伸命中宽度（px）。 */
const RESIZE_EDGE_PX = 6
/** 拖动超过该像素才算移动，避免点击产生零位移意图。 */
const DRAG_THRESHOLD_PX = 3
/** 力度条中单个柱子的宽度（px）。 */
const VELOCITY_BAR_PX = 6

/** 编辑层与控制器之间的只读契约；所有坐标读取都经这里，避免复制控制器状态。 */
export interface EditingHost {
  variant: 'overview' | 'editor'
  root: HTMLElement
  pane: HTMLElement
  scroll: HTMLElement
  ruler: HTMLElement
  rulerGrid: HTMLElement
  timeline(): PianoRollTimeline
  index(): PianoRollNoteIndex
  selectedTrackId(): string | null
  /** 当前视口几何；scrollLeft 采用已绘制帧的逻辑值。 */
  geometry(): {
    scrollLeft: number
    scrollTop: number
    timeZoom: number
    pitchZoom: number
    width: number
    height: number
  }
  theme(): PianoRollTheme
  scheduleRender(): void
  /** 编辑层需要重新布局（力度条高度变化）。 */
  relayout(): void
}

/** 命中结果。 */
export interface NoteHit {
  note: PianoRollNote
  part: 'start' | 'end' | 'body'
}

/** 编辑层对控制器暴露的接口。 */
export interface EditingLayer {
  /** 替换配置；undefined 表示只读。 */
  update(options?: PianoRollEditingOptions): void
  /** 当前选中集合与高亮集合，供 Canvas 注入渲染帧。 */
  frameState(): RenderFrame['editing']
  /** 覆盖层与力度条的绘制；由控制器每帧调用，内部按脏标记决定是否重绘。 */
  render(frame: RenderFrame): void
  /** 文档替换后清理已失效的拖动。 */
  reset(): void
  destroy(): void
}

type Drag =
  | {
      kind: 'move'
      pointerId: number
      startX: number
      startY: number
      anchor: PianoRollNote
      notes: PianoRollNote[]
      minStart: number
      minPitch: number
      maxPitch: number
      deltaTick: number
      deltaPitch: number
      moved: boolean
    }
  | {
      kind: 'resize'
      pointerId: number
      startX: number
      edge: 'start' | 'end'
      anchor: PianoRollNote
      notes: PianoRollNote[]
      deltaTick: number
      moved: boolean
    }
  | {
      kind: 'box'
      pointerId: number
      startX: number
      startY: number
      currentX: number
      currentY: number
      additive: boolean
      moved: boolean
    }
  | {
      kind: 'draw'
      pointerId: number
      trackId: string
      pitch: number
      startTick: number
      endTick: number
    }
  | { kind: 'loop'; pointerId: number; anchorTick: number; startTick: number; endTick: number }
  | {
      kind: 'velocity'
      pointerId: number
      preview: Map<string, number>
      /** 拖动开始时命中的音符是否属于选区；是则整组一起改。 */
      groupIds: string[] | null
    }

/** 把编辑配置投影为渲染帧需要的最小状态。 */
function projectFrameState(options?: PianoRollEditingOptions): RenderFrame['editing'] {
  if (!options) return undefined
  return {
    selectedNoteIds: options.selectedNoteIds,
    highlightPitches: options.highlightPitches ?? null,
  }
}

/**
 * @description: 安装编辑手势层：命中测试、拖动幽灵、框选、绘制、循环区与力度条。
 * @param {EditingHost} host 控制器提供的只读上下文
 * @param {PianoRollEditingOptions | undefined} initial 初始配置
 * @return {EditingLayer} 编辑层
 */
export function installEditing(host: EditingHost, initial?: PianoRollEditingOptions): EditingLayer {
  const owner = host.root.ownerDocument
  const window = owner.defaultView!
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
    const element = owner.createElement(tag)
    element.className = className
    return element
  }
  let options = initial
  /** 注入渲染帧的投影；仅在配置替换时重建，控制器据引用变化决定是否重绘音符层。 */
  let frameState = projectFrameState(initial)
  let drag: Drag | null = null
  let hover: NoteHit | null = null
  /** 上一帧的绘制输入，决定覆盖层是否需要重绘。 */
  let painted: { frame: RenderFrame; version: number } | undefined
  let version = 0
  const cleanups: (() => void)[] = []

  // 覆盖层位于音符层之上、滚动层之下；指针事件仍由透明的滚动层接收。
  const overlay = make('canvas', 'pr-layer pr-overlay')
  host.pane.append(overlay)
  const rulerOverlay = make('canvas', 'pr-layer pr-ruler-overlay')
  host.rulerGrid.append(rulerOverlay)
  // 力度条占据第三行；高度由 --pr-lane 控制，0 时不占空间。
  const laneGutter = make('div', 'pr-lane-gutter')
  const lane = make('div', 'pr-lane')
  const laneCanvas = make('canvas', 'pr-layer')
  lane.append(laneCanvas)
  host.root.append(laneGutter, lane)

  function bump(): void {
    version += 1
    host.scheduleRender()
  }
  function editable(): boolean {
    return !!options?.enabled && host.variant === 'editor'
  }
  function laneHeight(): number {
    return host.variant === 'editor' && options?.enabled ? Math.max(0, options.velocityLaneHeight ?? 0) : 0
  }
  function applyLane(): void {
    const height = laneHeight()
    host.root.style.setProperty('--pr-lane', `${height}px`)
    laneGutter.hidden = lane.hidden = height <= 0
  }
  applyLane()

  /** 指针坐标 → 内容坐标（含滚动）。 */
  function toContent(clientX: number, clientY: number): { x: number; y: number } {
    const rect = host.scroll.getBoundingClientRect()
    const geometry = host.geometry()
    return {
      x: clientX - rect.left + geometry.scrollLeft,
      y: clientY - rect.top + geometry.scrollTop,
    }
  }
  function xToTick(x: number): number {
    const { timeZoom } = host.geometry()
    return host.timeline().secondsToTick(Math.max(0, x) / timeZoom)
  }
  function tickToX(tick: number): number {
    const { timeZoom } = host.geometry()
    return host.timeline().tickToSeconds(tick) * timeZoom
  }
  function yToPitch(y: number): number {
    const { pitchZoom } = host.geometry()
    return Math.min(127, Math.max(0, 127 - Math.floor(y / pitchZoom)))
  }
  function snap(tick: number, mode: 'nearest' | 'floor', altKey: boolean): number {
    const safe = Math.max(0, Math.round(tick))
    if (altKey || !options) return safe
    return Math.max(0, Math.round(options.snapTicks(safe, mode)))
  }
  function minStep(): number {
    // 吸附步长：两次 floor 吸附之差；网格关闭时回退到 1 tick。
    if (!options) return 1
    const probe = options.snapTicks(1, 'floor')
    const next = options.snapTicks(probe + 1, 'floor')
    let step = 1
    for (let tick = probe + 1; tick <= probe + 4096; tick += 1) {
      const value = options.snapTicks(tick, 'floor')
      if (value > next) {
        step = value - next
        break
      }
    }
    return Math.max(1, step)
  }

  /** 命中测试：先按时间窗查索引，再按音高与像素边界过滤。 */
  function hitTest(clientX: number, clientY: number): NoteHit | null {
    const trackId = host.selectedTrackId()
    if (!trackId) return null
    const { x, y } = toContent(clientX, clientY)
    const geometry = host.geometry()
    if (x < 0 || y < 0 || y > 128 * geometry.pitchZoom) return null
    const pitch = yToPitch(y)
    const timeline = host.timeline()
    const slack = RESIZE_EDGE_PX / geometry.timeZoom
    const from = timeline.secondsToTick(Math.max(0, x / geometry.timeZoom - slack))
    const to = timeline.secondsToTick(x / geometry.timeZoom + slack)
    let best: NoteHit | null = null
    for (const note of host.index().query(trackId, from, to)) {
      if (note.pitch !== pitch) continue
      const startX = tickToX(note.startTick)
      const endX = Math.max(startX + 2, tickToX(note.endTick))
      if (x < startX - RESIZE_EDGE_PX / 2 || x > endX + RESIZE_EDGE_PX / 2) continue
      const width = endX - startX
      // 窄音符只允许从右缘拉伸，避免完全无法移动。
      const edge = Math.min(RESIZE_EDGE_PX, width / 3)
      const part: NoteHit['part'] =
        x >= endX - edge ? 'end' : width > RESIZE_EDGE_PX * 2 && x <= startX + edge ? 'start' : 'body'
      // 后开始的音符绘制在上层，优先命中。
      if (!best || note.startTick >= best.note.startTick) best = { note, part }
    }
    return best
  }

  function selectionNotes(): PianoRollNote[] {
    const trackId = host.selectedTrackId()
    const selected = options?.selectedNoteIds
    if (!trackId || !selected || selected.size === 0) return []
    const range = host.index().getTimeRange(trackId)
    if (!range) return []
    return host.index().query(trackId, range.startTick, range.endTick).filter((note) => selected.has(note.id))
  }

  function emit(intent: PianoRollEditIntent): void {
    ;((window as any).__prIntents ??= []).push(intent)
    options?.onIntent(intent)
  }
  function updateCursor(hit: NoteHit | null): void {
    if (!editable()) {
      host.scroll.style.cursor = ''
      return
    }
    host.scroll.style.cursor = hit
      ? hit.part === 'body'
        ? 'grab'
        : 'ew-resize'
      : options?.tool === 'draw'
        ? 'crosshair'
        : 'default'
  }

  function beginMove(event: PointerEvent, hit: NoteHit): void {
    const selected = options!.selectedNoteIds
    const notes = selected.has(hit.note.id) ? selectionNotes() : [hit.note]
    let minStart = Number.POSITIVE_INFINITY
    let minPitch = 127
    let maxPitch = 0
    for (const note of notes) {
      minStart = Math.min(minStart, note.startTick)
      minPitch = Math.min(minPitch, note.pitch)
      maxPitch = Math.max(maxPitch, note.pitch)
    }
    drag = {
      kind: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      anchor: hit.note,
      notes,
      minStart,
      minPitch,
      maxPitch,
      deltaTick: 0,
      deltaPitch: 0,
      moved: false,
    }
  }
  function beginResize(event: PointerEvent, hit: NoteHit): void {
    const selected = options!.selectedNoteIds
    const notes = selected.has(hit.note.id) ? selectionNotes() : [hit.note]
    drag = {
      kind: 'resize',
      pointerId: event.pointerId,
      startX: event.clientX,
      edge: hit.part === 'start' ? 'start' : 'end',
      anchor: hit.note,
      notes,
      deltaTick: 0,
      moved: false,
    }
  }
  function addNoteAt(clientX: number, clientY: number, altKey: boolean): void {
    const trackId = host.selectedTrackId()
    if (!trackId || !options) return
    const { x, y } = toContent(clientX, clientY)
    const startTick = snap(xToTick(x), 'floor', altKey)
    emit({
      type: 'add-note',
      trackId,
      pitch: yToPitch(y),
      startTick,
      durationTicks: Math.max(1, Math.round(options.defaultDurationTicks)),
      velocity: options.defaultVelocity,
    })
  }

  function onPointerDown(event: PointerEvent): void {
    if (!editable() || event.button !== 0 || drag) return
    const trackId = host.selectedTrackId()
    if (!trackId) return
    const hit = hitTest(event.clientX, event.clientY)
    const shift = event.shiftKey
    if (hit) {
      event.preventDefault()
      const selected = options!.selectedNoteIds
      if (!selected.has(hit.note.id)) {
        emit({ type: 'select', noteIds: [hit.note.id], mode: shift ? 'add' : 'replace' })
        // 意图同步应用后选区已包含该音符；本地也当作已选中处理。
        emit({ type: 'audition', pitch: hit.note.pitch, velocity: hit.note.velocity })
      } else if (shift) {
        emit({ type: 'select', noteIds: [hit.note.id], mode: 'toggle' })
        return
      }
      host.scroll.setPointerCapture(event.pointerId)
      if (hit.part === 'body') beginMove(event, hit)
      else beginResize(event, hit)
      return
    }
    if (options!.tool === 'draw') {
      event.preventDefault()
      const { x, y } = toContent(event.clientX, event.clientY)
      const startTick = snap(xToTick(x), 'floor', event.altKey)
      host.scroll.setPointerCapture(event.pointerId)
      drag = {
        kind: 'draw',
        pointerId: event.pointerId,
        trackId,
        pitch: yToPitch(y),
        startTick,
        endTick: startTick + Math.max(1, Math.round(options!.defaultDurationTicks)),
      }
      bump()
      return
    }
    // 选择工具空白处：清空（非 Shift）并开始框选。
    if (!shift && options!.selectedNoteIds.size > 0) emit({ type: 'select', noteIds: [], mode: 'replace' })
    host.scroll.setPointerCapture(event.pointerId)
    drag = {
      kind: 'box',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      additive: shift,
      moved: false,
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || drag.kind === 'loop' || drag.kind === 'velocity') {
      if (!drag) {
        const hit = editable() ? hitTest(event.clientX, event.clientY) : null
        if (hit?.note.id !== hover?.note.id || hit?.part !== hover?.part) {
          hover = hit
          updateCursor(hit)
        }
      }
      return
    }
    if (drag.pointerId !== event.pointerId) return
    const geometry = host.geometry()
    switch (drag.kind) {
      case 'move': {
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        drag.moved = true
        host.scroll.style.cursor = 'grabbing'
        // 以按住的音符为吸附基准，整组沿相同位移平移。
        const anchorX = tickToX(drag.anchor.startTick) + dx
        const targetStart = snap(xToTick(anchorX), 'nearest', event.altKey)
        const deltaTick = Math.max(-drag.minStart, targetStart - drag.anchor.startTick)
        const rawPitch = Math.round(-dy / geometry.pitchZoom)
        const deltaPitch = Math.min(127 - drag.maxPitch, Math.max(-drag.minPitch, rawPitch))
        if (deltaPitch !== drag.deltaPitch)
          emit({ type: 'audition', pitch: drag.anchor.pitch + deltaPitch, velocity: drag.anchor.velocity })
        drag.deltaTick = deltaTick
        drag.deltaPitch = deltaPitch
        bump()
        return
      }
      case 'resize': {
        const dx = event.clientX - drag.startX
        if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return
        drag.moved = true
        const edgeTick = drag.edge === 'start' ? drag.anchor.startTick : drag.anchor.endTick
        const target = snap(xToTick(tickToX(edgeTick) + dx), 'nearest', event.altKey)
        let delta = target - edgeTick
        // 基准音符至少保留一格（无网格时 1 tick）；其它音符由宿主命令各自兜底。
        const minimum = minStep()
        if (drag.edge === 'end') delta = Math.max(delta, drag.anchor.startTick + minimum - drag.anchor.endTick)
        else delta = Math.min(delta, drag.anchor.endTick - minimum - drag.anchor.startTick)
        drag.deltaTick = delta
        bump()
        return
      }
      case 'box': {
        drag.currentX = event.clientX
        drag.currentY = event.clientY
        drag.moved =
          drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= DRAG_THRESHOLD_PX
        bump()
        return
      }
      case 'draw': {
        const { x } = toContent(event.clientX, event.clientY)
        const target = snap(xToTick(x), 'nearest', event.altKey)
        drag.endTick = Math.max(drag.startTick + minStep(), target)
        bump()
        return
      }
      default:
        return
    }
  }

  function finish(commit: boolean): void {
    if (!drag) return
    const current = drag
    drag = null
    if (host.scroll.hasPointerCapture(current.pointerId)) host.scroll.releasePointerCapture(current.pointerId)
    if (host.ruler.hasPointerCapture(current.pointerId)) host.ruler.releasePointerCapture(current.pointerId)
    if (lane.hasPointerCapture(current.pointerId)) lane.releasePointerCapture(current.pointerId)
    updateCursor(hover)
    if (commit) {
      switch (current.kind) {
        case 'move':
          if (current.moved && (current.deltaTick !== 0 || current.deltaPitch !== 0))
            emit({
              type: 'move',
              noteIds: current.notes.map((note) => note.id),
              deltaTick: current.deltaTick,
              deltaPitch: current.deltaPitch,
            })
          break
        case 'resize':
          if (current.moved && current.deltaTick !== 0)
            emit({
              type: 'resize',
              noteIds: current.notes.map((note) => note.id),
              edge: current.edge,
              deltaTick: current.deltaTick,
            })
          break
        case 'box': {
          if (!current.moved) break
          const trackId = host.selectedTrackId()
          if (!trackId) break
          const a = toContent(current.startX, current.startY)
          const b = toContent(current.currentX, current.currentY)
          const from = xToTick(Math.min(a.x, b.x))
          const to = xToTick(Math.max(a.x, b.x))
          const low = yToPitch(Math.max(a.y, b.y))
          const high = yToPitch(Math.min(a.y, b.y))
          const ids = host
            .index()
            .query(trackId, from, to)
            .filter((note) => note.pitch >= low && note.pitch <= high)
            .map((note) => note.id)
          emit({ type: 'select', noteIds: ids, mode: current.additive ? 'add' : 'replace' })
          break
        }
        case 'draw':
          emit({
            type: 'add-note',
            trackId: current.trackId,
            pitch: current.pitch,
            startTick: current.startTick,
            durationTicks: current.endTick - current.startTick,
            velocity: options?.defaultVelocity,
          })
          break
        case 'loop':
          emit({
            type: 'loop-change',
            loop:
              current.endTick > current.startTick
                ? { startTick: current.startTick, endTick: current.endTick }
                : null,
          })
          break
        case 'velocity':
          if (current.preview.size > 0)
            emit({
              type: 'set-velocity',
              changes: Array.from(current.preview, ([noteId, velocity]) => ({ noteId, velocity })),
            })
          break
        default:
          break
      }
    }
    bump()
  }

  /** 选择工具下双击空白直接落音符；PointerEvent.detail 恒为 0，须监听 dblclick。 */
  function onDoubleClick(event: MouseEvent): void {
    if (!editable() || options!.tool !== 'select' || hitTest(event.clientX, event.clientY)) return
    event.preventDefault()
    addNoteAt(event.clientX, event.clientY, event.altKey)
  }

  function onContextMenu(event: MouseEvent): void {
    if (!editable()) return
    event.preventDefault()
    finish(false)
    const hit = hitTest(event.clientX, event.clientY)
    const { x, y } = toContent(event.clientX, event.clientY)
    if (hit && !options!.selectedNoteIds.has(hit.note.id))
      emit({ type: 'select', noteIds: [hit.note.id], mode: 'replace' })
    emit({
      type: 'context-menu',
      noteId: hit?.note.id ?? null,
      tick: snap(xToTick(x), 'floor', event.altKey),
      pitch: yToPitch(y),
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  /** 标尺：Alt+拖拽设置循环，双击清除。捕获阶段先于控制器的 seek 处理。 */
  function onRulerPointerDown(event: PointerEvent): void {
    if (!editable() || event.button !== 0 || !event.altKey) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const rect = host.ruler.getBoundingClientRect()
    const x = event.clientX - rect.left + host.geometry().scrollLeft
    const tick = snap(xToTick(x), 'floor', false)
    host.ruler.setPointerCapture(event.pointerId)
    drag = { kind: 'loop', pointerId: event.pointerId, anchorTick: tick, startTick: tick, endTick: tick }
    bump()
  }
  function onRulerPointerMove(event: PointerEvent): void {
    if (drag?.kind !== 'loop' || drag.pointerId !== event.pointerId) return
    const rect = host.ruler.getBoundingClientRect()
    const x = event.clientX - rect.left + host.geometry().scrollLeft
    const tick = snap(xToTick(x), 'nearest', false)
    drag.startTick = Math.min(drag.anchorTick, tick)
    drag.endTick = Math.max(drag.anchorTick, tick)
    bump()
  }
  function onRulerDoubleClick(event: MouseEvent): void {
    if (!editable() || !options?.loop) return
    event.preventDefault()
    event.stopImmediatePropagation()
    emit({ type: 'loop-change', loop: null })
  }

  /** 力度条：命中音符起点附近的柱子，垂直拖动改力度，横向经过其它柱子时一并涂改。 */
  function laneHit(clientX: number): PianoRollNote | null {
    const trackId = host.selectedTrackId()
    if (!trackId) return null
    const rect = lane.getBoundingClientRect()
    const geometry = host.geometry()
    const x = clientX - rect.left + geometry.scrollLeft
    const slack = (VELOCITY_BAR_PX + 2) / geometry.timeZoom
    const timeline = host.timeline()
    const from = timeline.secondsToTick(Math.max(0, x / geometry.timeZoom - slack))
    const to = timeline.secondsToTick(x / geometry.timeZoom + slack)
    let best: PianoRollNote | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const note of host.index().query(trackId, from, to)) {
      const startX = tickToX(note.startTick)
      if (x < startX - 2 || x > startX + VELOCITY_BAR_PX + 2) continue
      const distance = Math.abs(x - startX)
      const preferred = options?.selectedNoteIds.has(note.id) ? -1 : 0
      if (distance + preferred < bestDistance) {
        bestDistance = distance + preferred
        best = note
      }
    }
    return best
  }
  function laneVelocity(clientY: number): number {
    const rect = lane.getBoundingClientRect()
    const ratio = 1 - (clientY - rect.top) / Math.max(1, rect.height)
    return Math.min(127, Math.max(1, Math.round(ratio * 127)))
  }
  function onLanePointerDown(event: PointerEvent): void {
    if (!editable() || event.button !== 0 || drag) return
    const hit = laneHit(event.clientX)
    if (!hit) return
    event.preventDefault()
    lane.setPointerCapture(event.pointerId)
    const selected = options!.selectedNoteIds
    const groupIds = selected.has(hit.id) ? Array.from(selected) : null
    const preview = new Map<string, number>()
    const velocity = laneVelocity(event.clientY)
    for (const id of groupIds ?? [hit.id]) preview.set(id, velocity)
    drag = { kind: 'velocity', pointerId: event.pointerId, preview, groupIds }
    bump()
  }
  function onLanePointerMove(event: PointerEvent): void {
    if (drag?.kind !== 'velocity' || drag.pointerId !== event.pointerId) return
    const velocity = laneVelocity(event.clientY)
    if (drag.groupIds) {
      for (const id of drag.groupIds) drag.preview.set(id, velocity)
    } else {
      const hit = laneHit(event.clientX)
      if (hit) drag.preview.set(hit.id, velocity)
    }
    bump()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && drag) {
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    }
  }

  function listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    type: K | string,
    callback: (event: never) => void,
    settings?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, callback as EventListener, settings)
    cleanups.push(() => target.removeEventListener(type, callback as EventListener, settings))
  }
  ;(window as any).__prDebug = { hitTest, toContent, yToPitch, xToTick, host, get options() { return options } }
  listen(host.scroll, 'pointerdown', onPointerDown)
  listen(host.scroll, 'pointermove', onPointerMove)
  listen(host.scroll, 'pointerup', (event: PointerEvent) => {
    if (drag && drag.pointerId === event.pointerId && drag.kind !== 'loop' && drag.kind !== 'velocity') {
      onPointerMove(event)
      finish(true)
    }
  })
  listen(host.scroll, 'pointercancel', () => finish(false))
  listen(host.scroll, 'lostpointercapture', (event: PointerEvent) => {
    if (drag && drag.pointerId === event.pointerId && drag.kind !== 'loop' && drag.kind !== 'velocity') finish(false)
  })
  listen(host.scroll, 'pointerleave', () => {
    if (!drag) {
      hover = null
      updateCursor(null)
    }
  })
  listen(host.scroll, 'dblclick', onDoubleClick)
  listen(host.scroll, 'contextmenu', onContextMenu)
  listen(host.ruler, 'pointerdown', onRulerPointerDown, { capture: true })
  listen(host.ruler, 'pointermove', onRulerPointerMove)
  listen(host.ruler, 'pointerup', (event: PointerEvent) => {
    if (drag?.kind === 'loop' && drag.pointerId === event.pointerId) {
      onRulerPointerMove(event)
      finish(true)
    }
  })
  listen(host.ruler, 'pointercancel', () => {
    if (drag?.kind === 'loop') finish(false)
  })
  listen(host.ruler, 'dblclick', onRulerDoubleClick, { capture: true })
  listen(lane, 'pointerdown', onLanePointerDown)
  listen(lane, 'pointermove', onLanePointerMove)
  listen(lane, 'pointerup', (event: PointerEvent) => {
    if (drag?.kind === 'velocity' && drag.pointerId === event.pointerId) {
      onLanePointerMove(event)
      finish(true)
    }
  })
  listen(lane, 'pointercancel', () => {
    if (drag?.kind === 'velocity') finish(false)
  })
  listen(window, 'keydown', onKeyDown, { capture: true })
  listen(window, 'blur', () => finish(false))

  /** 覆盖层：幽灵音符、框选矩形、循环区。 */
  function drawOverlay(frame: RenderFrame): void {
    const context = canvasContext(overlay, frame.width, frame.height)
    const rulerContext = canvasContext(rulerOverlay, frame.width, 32)
    if (!context || !rulerContext) return
    const theme = frame.theme ?? host.theme()
    const { scrollLeft, scrollTop, timeZoom, pitchZoom, width, height } = frame
    const timeline = frame.timeline
    const xOf = (tick: number) => timeline.tickToSeconds(tick) * timeZoom - scrollLeft
    const loop = drag?.kind === 'loop' ? drag : options?.loop
    if (loop && loop.endTick > loop.startTick) {
      const left = xOf(loop.startTick)
      const right = xOf(loop.endTick)
      if (right > 0 && left < width) {
        context.fillStyle = theme.colors.loopRegion
        context.fillRect(left, 0, right - left, height)
        rulerContext.fillStyle = theme.colors.primary
        rulerContext.globalAlpha = 0.85
        rulerContext.fillRect(left, 0, right - left, 5)
        rulerContext.globalAlpha = 1
      }
    }
    if (frame.variant !== 'editor' || !drag) return
    const noteHeight = Math.max(3, pitchZoom - 3)
    const ghost = (pitch: number, startTick: number, endTick: number) => {
      const x = xOf(startTick)
      const w = Math.max(2, xOf(endTick) - x)
      const y = (127 - pitch) * pitchZoom - scrollTop + 1
      if (y > height || y + noteHeight < 0 || x > width || x + w < 0) return
      context.fillStyle = theme.colors.noteGhost
      context.fillRect(x, y, w, noteHeight)
      context.strokeStyle = theme.colors.noteOutline
      context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), noteHeight - 1)
    }
    switch (drag.kind) {
      case 'move':
        if (!drag.moved) return
        for (const note of drag.notes)
          ghost(note.pitch + drag.deltaPitch, note.startTick + drag.deltaTick, note.endTick + drag.deltaTick)
        return
      case 'resize':
        if (!drag.moved) return
        for (const note of drag.notes) {
          const start = drag.edge === 'start' ? Math.max(0, Math.min(note.endTick - 1, note.startTick + drag.deltaTick)) : note.startTick
          const end = drag.edge === 'end' ? Math.max(note.startTick + 1, note.endTick + drag.deltaTick) : note.endTick
          ghost(note.pitch, start, end)
        }
        return
      case 'draw':
        ghost(drag.pitch, drag.startTick, drag.endTick)
        return
      case 'box': {
        if (!drag.moved) return
        const rect = host.scroll.getBoundingClientRect()
        const x0 = Math.min(drag.startX, drag.currentX) - rect.left
        const x1 = Math.max(drag.startX, drag.currentX) - rect.left
        const y0 = Math.min(drag.startY, drag.currentY) - rect.top
        const y1 = Math.max(drag.startY, drag.currentY) - rect.top
        context.fillStyle = theme.colors.selectionBox
        context.fillRect(x0, y0, x1 - x0, y1 - y0)
        context.strokeStyle = theme.colors.primary
        context.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1)
        return
      }
      default:
        return
    }
  }

  /** 力度条：当前轨可见音符的起点柱。 */
  function drawLane(frame: RenderFrame): void {
    const height = laneHeight()
    if (height <= 0) return
    const context = canvasContext(laneCanvas, frame.width, height)
    if (!context) return
    const theme = frame.theme ?? host.theme()
    context.fillStyle = theme.colors.surfaceRaised
    context.fillRect(0, 0, frame.width, height)
    context.fillStyle = theme.colors.gridMinor
    context.fillRect(0, 0, frame.width, 1)
    const trackId = frame.selectedTrackId
    if (!trackId) return
    const { scrollLeft, timeZoom, width } = frame
    const timeline = frame.timeline
    const from = timeline.secondsToTick(Math.max(0, (scrollLeft - VELOCITY_BAR_PX) / timeZoom))
    const to = timeline.secondsToTick((scrollLeft + width) / timeZoom)
    const preview = drag?.kind === 'velocity' ? drag.preview : null
    const selected = options?.selectedNoteIds
    for (const note of frame.index.query(trackId, from, to)) {
      const x = timeline.tickToSeconds(note.startTick) * timeZoom - scrollLeft
      if (x > width || x + VELOCITY_BAR_PX < 0) continue
      const velocity = preview?.get(note.id) ?? note.velocity
      const barHeight = Math.max(2, ((height - 4) * velocity) / 127)
      const isSelected = selected?.has(note.id) ?? false
      context.fillStyle = isSelected ? theme.colors.noteSelected : theme.colors.velocityBar
      context.globalAlpha = isSelected ? 1 : 0.75
      context.fillRect(x, height - barHeight, VELOCITY_BAR_PX, barHeight)
      context.fillStyle = theme.colors.surface
      context.fillRect(x + 1, height - barHeight, VELOCITY_BAR_PX - 2, 1)
    }
    context.globalAlpha = 1
  }

  return {
    update(next) {
      const laneChanged = laneHeight() !== (next && host.variant === 'editor' && next.enabled ? Math.max(0, next.velocityLaneHeight ?? 0) : 0)
      options = next
      frameState = projectFrameState(next)
      if (!editable()) finish(false)
      applyLane()
      updateCursor(hover)
      if (laneChanged) host.relayout()
      bump()
    },
    frameState: () => frameState,
    render(frame) {
      const previous = painted?.frame
      const unchanged =
        painted?.version === version &&
        previous &&
        previous.width === frame.width &&
        previous.height === frame.height &&
        previous.scrollLeft === frame.scrollLeft &&
        previous.scrollTop === frame.scrollTop &&
        previous.timeZoom === frame.timeZoom &&
        previous.pitchZoom === frame.pitchZoom &&
        previous.timeline === frame.timeline &&
        previous.index === frame.index &&
        previous.selectedTrackId === frame.selectedTrackId &&
        previous.theme === frame.theme
      if (unchanged) return
      drawOverlay(frame)
      drawLane(frame)
      painted = { frame, version }
    },
    reset() {
      finish(false)
      hover = null
    },
    destroy() {
      finish(false)
      for (const cleanup of cleanups.reverse()) cleanup()
      overlay.remove()
      rulerOverlay.remove()
      laneGutter.remove()
      lane.remove()
    },
  }
}
