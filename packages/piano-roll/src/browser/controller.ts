import { createNoteIndex, createTimeline } from '../core'
import { drawGrid, drawKeyboard, drawNotes, visibleRows, type TrackRow } from './renderer'
import { installStyles } from './styles'
import { applyPianoRollTheme, resolvePianoRollTheme } from './theme'
import { installGestureZoom } from './gesture-zoom'
import {
  defaultLabels,
  type PianoRollTransport,
  type PianoRollView,
  type PianoRollViewOptions,
  type PianoRollViewport,
} from './types'
import {
  clamp,
  createResizeScheduler,
  dragScrollVelocity,
  followScrollLeft,
  resizeScrollLeft,
  timeZoomBounds,
  zoomScrollLeft,
} from './viewport'

/** 两种视图共用的浏览器控制器；只有纵向布局策略不同。 */
export function createView(
  variant: 'overview' | 'editor',
  options: PianoRollViewOptions
): PianoRollView {
  const owner = options.container.ownerDocument
  const window = owner.defaultView
  if (!window) throw new Error('钢琴卷帘需要有效的浏览器文档')
  installStyles(owner)
  let labels = { ...defaultLabels, ...options.labels }
  let theme = resolvePianoRollTheme(options.theme)
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string
  ): HTMLElementTagNameMap[K] => {
    const element = owner.createElement(tag)
    element.className = className
    return element
  }
  const root = make('div', 'pr-view')
  applyPianoRollTheme(root, theme)
  root.dataset.variant = variant
  root.style.setProperty('--pr-gutter', variant === 'overview' ? '160px' : '64px')
  const corner = make('div', 'pr-corner')
  // 总览左上角只作为轨道栏的留白，标题已经由 Vue 工具栏提供，避免重复占据视野。
  corner.textContent = variant === 'overview' ? '' : labels.editor
  const ruler = make('div', 'pr-ruler')
  ruler.setAttribute('aria-label', labels.playhead)
  const rulerCanvas = make('canvas', 'pr-layer')
  const handle = make('button', 'pr-handle')
  handle.type = 'button'
  handle.setAttribute('role', 'slider')
  handle.setAttribute('aria-label', labels.playhead)
  handle.setAttribute('aria-valuemin', '0')
  ruler.append(rulerCanvas, handle)
  const gutter = make('div', 'pr-gutter')
  const keyboard = make('canvas', 'pr-layer')
  if (variant === 'editor') gutter.append(keyboard)
  const pane = make('div', 'pr-pane')
  const scroll = make('div', 'pr-scroll')
  scroll.tabIndex = 0
  scroll.setAttribute('role', 'region')
  scroll.setAttribute('aria-label', variant === 'overview' ? labels.overview : labels.editor)
  const spacer = make('div', 'pr-spacer')
  scroll.append(spacer)
  const grid = make('canvas', 'pr-layer')
  const notes = make('canvas', 'pr-layer')
  const line = make('div', 'pr-line')
  const empty = make('div', 'pr-empty')
  empty.textContent = labels.empty
  pane.append(scroll, grid, notes, line, empty)
  root.append(corner, ruler, gutter, pane)
  options.container.append(root)

  let document = options.document
  let timeline = createTimeline(document)
  let noteIndex = createNoteIndex(document.notes)
  let rows: TrackRow[] = []
  let selected: string | null = options.selectedTrackId ?? document.tracks[0]?.id ?? null
  let transport: PianoRollTransport = options.transport ?? {
    positionSeconds: 0,
    isPlaying: false,
    playbackRate: 1,
  }
  let timeZoom = clamp(options.timeZoom ?? (variant === 'overview' ? 42 : 110), 0.001, 1200)
  let { minTimeZoom, maxTimeZoom } = timeZoomBounds(0, timeline.durationSeconds)
  let fitting = false
  let pitchZoom = clamp(options.pitchZoom ?? 16, 8, 36)
  let follow = options.follow ?? true
  let width = 0
  let height = 0
  let layoutDirty = true
  let destroyed = false
  let renderFrame = 0
  let expectedScroll: { left: number; top: number } | null = null
  let pitchFocused = false
  const heights = new Map(Object.entries(options.trackHeights ?? {}))
  const subscribers = new Set<(viewport: Readonly<PianoRollViewport>) => void>()
  const trackToggleCleanups = new WeakMap<HTMLElement, () => void>()
  const trackLabelCleanups = new WeakMap<HTMLElement, () => void>()
  const cleanups: (() => void)[] = []
  let drag: {
    pointerId: number
    clientX: number
    seconds: number
    lastFrame: number
    raf: number
  } | null = null
  let pointerPreview: number | null = null
  let selectionBeforeGesture: string | null | undefined
  let gestureActive = false

  function selectTrack(trackId: string, event: MouseEvent): void {
    // 双击之前的两次 click 会先改变选轨，必须保留第一次 click 前的选择供宿主判断关闭。
    if (event.detail === 1) selectionBeforeGesture = selected
    options.onTrackSelect?.(trackId)
  }
  function openTrack(trackId: string): void {
    options.onTrackOpen?.(trackId, {
      selectedTrackIdAtGestureStart:
        selectionBeforeGesture === undefined ? selected : selectionBeforeGesture,
    })
    selectionBeforeGesture = undefined
  }

  function snapshot(): Readonly<PianoRollViewport> {
    return Object.freeze({
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
      timeZoom,
      minTimeZoom,
      maxTimeZoom,
      pitchZoom,
      follow,
    })
  }
  function changed(): void {
    const state = snapshot()
    options.onViewportChange?.(state)
    for (const subscriber of subscribers) subscriber(state)
  }
  function setFollow(enabled: boolean): void {
    if (follow !== enabled) {
      follow = enabled
      options.onFollowChange?.(enabled)
      changed()
    }
    if (enabled) catchPlayhead()
  }
  function position(): number {
    return clamp(pointerPreview ?? transport.positionSeconds, 0, timeline.durationSeconds)
  }
  function setScroll(left: number, top = scroll.scrollTop): void {
    const oldLeft = scroll.scrollLeft
    const oldTop = scroll.scrollTop
    scroll.scrollLeft = Math.max(0, left)
    scroll.scrollTop = Math.max(0, top)
    if (oldLeft === scroll.scrollLeft && oldTop === scroll.scrollTop) return
    expectedScroll = { left: scroll.scrollLeft, top: scroll.scrollTop }
    scheduleRender()
    changed()
  }
  function catchPlayhead(): void {
    if (!follow || drag) return
    const left = followScrollLeft(
      position() * timeZoom,
      scroll.scrollLeft,
      width,
      scroll.scrollWidth
    )
    if (left !== null) setScroll(left)
    updatePlayhead()
  }
  function updatePlayhead(): void {
    const seconds = position()
    const x = timeline.secondsToContentX(seconds, timeZoom) - scroll.scrollLeft
    const visible = x >= 0 && x <= width
    line.hidden = !visible
    handle.hidden = !visible
    line.style.transform = `translateX(${x}px)`
    line.style.height = `${height}px`
    handle.style.transform = `translateX(${x}px)`
    handle.setAttribute('aria-valuemax', String(timeline.durationSeconds))
    handle.setAttribute('aria-valuenow', String(seconds))
    handle.setAttribute('aria-valuetext', `${seconds.toFixed(2)} s`)
  }
  function rebuildRows(): void {
    let top = 0
    rows = document.tracks.map((track) => {
      const row = { track, top, height: clamp(heights.get(track.id) ?? 104, 56, 320) }
      top += row.height
      return row
    })
  }
  function resizeContent(): void {
    const last = rows[rows.length - 1]
    // fit 的宽度直接取 clientWidth，避免浮点乘法把一屏变成多出 1px 的可滚动内容。
    spacer.style.width = `${fitting ? width : Math.max(width, timeline.durationSeconds * timeZoom)}px`
    spacer.style.height = `${variant === 'editor' ? 128 * pitchZoom : Math.max(height, last ? last.top + last.height : height)}px`
    // 内容缩小时浏览器会自行裁剪偏移，这也是程序滚动，不能误暂停本视图的 Follow。
    expectedScroll = { left: scroll.scrollLeft, top: scroll.scrollTop }
  }
  function focusPitch(force: boolean): void {
    if (variant !== 'editor' || !selected || height <= 0) return
    const range = noteIndex.getPitchRange(selected)
    if (!range) return
    pitchFocused = true
    const top = (127 - range.max) * pitchZoom
    const bottom = (128 - range.min) * pitchZoom
    if (force || bottom < scroll.scrollTop || top > scroll.scrollTop + height) {
      setScroll(scroll.scrollLeft, (top + bottom) / 2 - height / 2)
    }
  }
  function trackAt(clientY: number): TrackRow | undefined {
    const localY = clientY - scroll.getBoundingClientRect().top
    if (localY < 0 || localY >= height) return undefined
    const y = localY + scroll.scrollTop
    return visibleRows(rows, y, 0)[0]
  }
  function renderGutter(visible: TrackRow[]): void {
    if (variant === 'editor') {
      drawKeyboard(keyboard, height, pitchZoom, scroll.scrollTop, theme)
      return
    }
    // 只为可见轨道建立可键盘操作的控件，保持现有节点以保留焦点。
    const ids = new Set(visible.map((row) => row.track.id))
    for (const child of Array.from(gutter.children)) {
      if (!ids.has((child as HTMLElement).dataset.trackId ?? '')) {
        trackToggleCleanups.get(child.children[1] as HTMLElement)?.()
        trackLabelCleanups.get(child.children[0] as HTMLElement)?.()
        child.remove()
      }
    }
    for (const row of visible) {
      let item = Array.from(gutter.children).find(
        (child) => (child as HTMLElement).dataset.trackId === row.track.id
      ) as HTMLElement | undefined
      if (!item) {
        item = make('div', 'pr-track')
        item.dataset.trackId = row.track.id
        const select = make('button', 'pr-track-select')
        select.type = 'button'
        const labelHost = make('span', 'pr-track-label-host')
        labelHost.append(make('strong', ''))
        select.append(labelHost, make('small', ''))
        select.addEventListener('click', (event) => selectTrack(row.track.id, event))
        select.addEventListener('dblclick', () => openTrack(row.track.id))
        const toggleHost = make('span', 'pr-track-toggle-host')
        if (!options.renderTrackToggle) {
          const toggle = make('button', 'pr-track-toggle')
          toggle.type = 'button'
          toggle.setAttribute('role', 'switch')
          // 开关是独立的交互目标，阻止事件继续冒泡，避免误触轨道选择或打开详情。
          toggle.addEventListener('click', (event) => {
            event.stopPropagation()
            options.onTrackToggle?.(row.track.id)
          })
          toggleHost.append(toggle)
        }
        item.append(select, toggleHost)
        gutter.append(item)
      }
      item.dataset.selected = String(row.track.id === selected)
      item.style.top = `${row.top - scroll.scrollTop}px`
      item.style.height = `${row.height}px`
      const select = item.children[0] as HTMLButtonElement
      select.removeAttribute('title')
      select.setAttribute('aria-label', row.track.name)
      select.setAttribute('aria-pressed', String(row.track.id === selected))
      const labelHost = select.children[0] as HTMLElement
      if (options.renderTrackLabel) {
        const stateKey = `${row.track.id}:${row.track.name}`
        if (labelHost.dataset.stateKey !== stateKey) {
          trackLabelCleanups.get(labelHost)?.()
          const cleanup = options.renderTrackLabel(labelHost, { track: row.track })
          labelHost.dataset.stateKey = stateKey
          if (cleanup) trackLabelCleanups.set(labelHost, cleanup)
          else trackLabelCleanups.delete(labelHost)
        }
      } else {
        const strong = labelHost.firstElementChild as HTMLElement
        strong.textContent = row.track.name
      }
      const range = noteIndex.getPitchRange(row.track.id)
      select.children[1]!.textContent = range ? `${range.min}–${range.max} · MIDI` : labels.empty
      const toggleHost = item.children[1] as HTMLElement
      if (options.renderTrackToggle) {
        const stateKey = `${row.track.id}:${row.track.name}:${row.track.enabled}`
        if (toggleHost.dataset.stateKey !== stateKey) {
          trackToggleCleanups.get(toggleHost)?.()
          const cleanup = options.renderTrackToggle(toggleHost, {
            track: row.track,
            checked: row.track.enabled,
            onChange: () => options.onTrackToggle?.(row.track.id),
          })
          toggleHost.dataset.stateKey = stateKey
          if (cleanup) trackToggleCleanups.set(toggleHost, cleanup)
          else trackToggleCleanups.delete(toggleHost)
        }
      } else {
        const toggle = toggleHost.firstElementChild as HTMLButtonElement
        toggle.setAttribute('aria-checked', String(row.track.enabled))
        toggle.removeAttribute('title')
        toggle.setAttribute(
          'aria-label',
          `${row.track.enabled ? labels.disableTrack : labels.enableTrack}: ${row.track.name}`
        )
      }
    }
  }
  function render(): void {
    renderFrame = 0
    if (destroyed || width <= 0 || height <= 0) return
    const visible =
      variant === 'overview'
        ? visibleRows(rows, scroll.scrollTop, height)
        : rows.filter((row) => row.track.id === selected)
    const frame = {
      variant,
      timeline,
      index: noteIndex,
      rows: visible,
      selectedTrackId: selected,
      width,
      height,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
      timeZoom,
      pitchZoom,
      theme,
    }
    drawGrid(grid, rulerCanvas, frame)
    drawNotes(notes, frame)
    renderGutter(visible)
    empty.hidden = rows.length > 0
    updatePlayhead()
  }
  function scheduleRender(): void {
    if (!destroyed && !renderFrame) renderFrame = window!.requestAnimationFrame(render)
  }
  function resize(force = false): void {
    if (destroyed) return
    const nextWidth = scroll.clientWidth
    const nextHeight = scroll.clientHeight
    // v-show / display:none 不应把已保存的缩放和滚动状态压缩到零尺寸。
    if (nextWidth <= 0 || nextHeight <= 0) return
    if (!force && !layoutDirty && width === nextWidth && height === nextHeight) return
    const previousWidth = width
    const previousZoom = timeZoom
    const previousLeft = scroll.scrollLeft
    width = nextWidth
    height = nextHeight
    layoutDirty = false
    ;({ minTimeZoom, maxTimeZoom } = timeZoomBounds(width, timeline.durationSeconds))
    timeZoom = fitting ? minTimeZoom : clamp(timeZoom, minTimeZoom, maxTimeZoom)
    fitting = timeZoom === minTimeZoom
    resizeContent()
    setScroll(
      fitting ? 0 : resizeScrollLeft(previousLeft, previousZoom, timeZoom, previousWidth, width)
    )
    if (!pitchFocused) focusPitch(true)
    scheduleRender()
    updatePlayhead()
    changed()
  }
  function eventSeconds(clientX: number): number {
    const x = clientX - ruler.getBoundingClientRect().left + scroll.scrollLeft
    return clamp(timeline.contentXToSeconds(x, timeZoom), 0, timeline.durationSeconds)
  }
  function previewDrag(): void {
    if (!drag) return
    drag.seconds = eventSeconds(drag.clientX)
    pointerPreview = drag.seconds
    options.onSeekPreview?.(drag.seconds)
    updatePlayhead()
  }
  function stepDrag(now: number): void {
    if (!drag) return
    const x = drag.clientX - ruler.getBoundingClientRect().left
    const velocity = dragScrollVelocity(x, width)
    const elapsed = Math.min(0.05, (now - drag.lastFrame) / 1000)
    drag.lastFrame = now
    if (velocity) {
      setScroll(scroll.scrollLeft + velocity * elapsed)
      previewDrag()
    }
    drag.raf = window!.requestAnimationFrame(stepDrag)
  }
  function finishDrag(commit: boolean): void {
    if (!drag) return
    const finished = drag
    drag = null
    window!.cancelAnimationFrame(finished.raf)
    if (handle.hasPointerCapture(finished.pointerId))
      handle.releasePointerCapture(finished.pointerId)
    pointerPreview = null
    if (commit) options.onSeek?.(finished.seconds)
    options.onSeekPreview?.(null)
    updatePlayhead()
  }

  function listen(
    target: EventTarget,
    type: string,
    callback: EventListener,
    settings?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, callback, settings)
    cleanups.push(() => target.removeEventListener(type, callback, settings))
  }
  listen(
    scroll,
    'scroll',
    () => {
      const own =
        expectedScroll &&
        Math.abs(expectedScroll.left - scroll.scrollLeft) < 1 &&
        Math.abs(expectedScroll.top - scroll.scrollTop) < 1
      expectedScroll = null
      if (!own && !drag) setFollow(false)
      scheduleRender()
      updatePlayhead()
      changed()
    },
    { passive: true }
  )
  listen(
    root,
    'wheel',
    ((event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        // Safari gesturechange 可能同时伴随 wheel；同一根区域只接受手势事件一次。
        if (gestureActive) return
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1
        view.setTimeZoom(
          timeZoom * Math.exp(clamp(-event.deltaY * unit * 0.01, -100, 100)),
          event.clientX - scroll.getBoundingClientRect().left
        )
      }
    }) as EventListener,
    { passive: false }
  )
  listen(
    scroll,
    'wheel',
    ((event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) setFollow(false)
    }) as EventListener,
    { passive: true }
  )
  listen(
    gutter,
    'wheel',
    ((event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      event.preventDefault()
      setFollow(false)
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1
      setScroll(scroll.scrollLeft + event.deltaX * unit, scroll.scrollTop + event.deltaY * unit)
    }) as EventListener,
    { passive: false }
  )
  listen(scroll, 'click', ((event: MouseEvent) => {
    if (variant !== 'overview') return
    const row = trackAt(event.clientY)
    if (row) selectTrack(row.track.id, event)
  }) as EventListener)
  listen(scroll, 'dblclick', ((event: MouseEvent) => {
    if (variant !== 'overview') return
    const row = trackAt(event.clientY)
    if (row) openTrack(row.track.id)
  }) as EventListener)
  listen(ruler, 'pointerdown', ((event: PointerEvent) => {
    if (event.target === handle || event.button !== 0) return
    options.onSeek?.(eventSeconds(event.clientX))
  }) as EventListener)
  listen(handle, 'pointerdown', ((event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    handle.focus()
    handle.setPointerCapture(event.pointerId)
    drag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      seconds: position(),
      lastFrame: window!.performance.now(),
      raf: 0,
    }
    previewDrag()
    drag.raf = window!.requestAnimationFrame(stepDrag)
  }) as EventListener)
  listen(handle, 'pointermove', ((event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.clientX = event.clientX
    previewDrag()
  }) as EventListener)
  listen(handle, 'pointerup', ((event: PointerEvent) => {
    if (drag?.pointerId !== event.pointerId) return
    drag.clientX = event.clientX
    previewDrag()
    finishDrag(true)
  }) as EventListener)
  listen(handle, 'pointercancel', () => finishDrag(false))
  listen(handle, 'lostpointercapture', () => finishDrag(false))
  listen(window, 'blur', () => finishDrag(false))
  listen(handle, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      finishDrag(false)
      return
    }
    const increment = event.shiftKey ? 1 : 0.1
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? timeline.durationSeconds
          : event.key === 'ArrowLeft'
            ? position() - increment
            : event.key === 'ArrowRight'
              ? position() + increment
              : null
    if (next === null) return
    event.preventDefault()
    options.onSeek?.(clamp(next, 0, timeline.durationSeconds))
  }) as EventListener)
  const resizeScheduler = createResizeScheduler(() => resize())
  listen(window, 'resize', resizeScheduler.schedule)
  const resizeObserver = new ResizeObserver(resizeScheduler.schedule)
  resizeObserver.observe(scroll)
  cleanups.push(() => resizeObserver.disconnect())
  cleanups.push(resizeScheduler.cancel)
  const view: PianoRollView = {
    setTheme(next) {
      if (destroyed) return
      theme = resolvePianoRollTheme(next)
      applyPianoRollTheme(root, theme)
      // 换肤仅使静态图层失效，不替换节点、数据或交互状态。
      scheduleRender()
    },
    getTheme() {
      return Object.freeze({
        colors: Object.freeze({ ...theme.colors }),
        metrics: Object.freeze({ ...theme.metrics }),
      })
    },
    setDocument(next) {
      if (destroyed) return
      finishDrag(false)
      selectionBeforeGesture = undefined
      layoutDirty = true
      const notesChanged = document.notes !== next.notes
      document = next
      timeline = createTimeline(next)
      if (notesChanged) noteIndex = createNoteIndex(next.notes)
      if (!document.tracks.some((track) => track.id === selected))
        selected = document.tracks[0]?.id ?? null
      rebuildRows()
      resize(true)
      focusPitch(false)
      scheduleRender()
    },
    setTransport(next) {
      if (destroyed) return
      transport = next
      if (transport.isPlaying) catchPlayhead()
      updatePlayhead()
    },
    setSelectedTrack(trackId) {
      if (destroyed || selected === trackId) return
      selected = trackId
      focusPitch(false)
      scheduleRender()
    },
    setLabels(next) {
      labels = { ...defaultLabels, ...next }
      corner.textContent = variant === 'overview' ? '' : labels.editor
      empty.textContent = labels.empty
      ruler.setAttribute('aria-label', labels.playhead)
      handle.setAttribute('aria-label', labels.playhead)
      scroll.setAttribute('aria-label', variant === 'overview' ? labels.overview : labels.editor)
      scheduleRender()
    },
    setTimeZoom(value, anchorX) {
      if (destroyed) return
      // 若用户在防抖尚未结束时操作缩放，先使用最新容器宽度更新边界。
      resize()
      const next = clamp(value, minTimeZoom, maxTimeZoom, timeZoom)
      const playhead = position() * timeZoom - scroll.scrollLeft
      const anchor = clamp(
        anchorX ?? (playhead >= 0 && playhead <= width ? playhead : width / 2),
        0,
        width
      )
      const left = zoomScrollLeft(scroll.scrollLeft, timeZoom, next, anchor)
      timeZoom = next
      fitting = next === minTimeZoom
      resizeContent()
      setScroll(fitting ? 0 : left)
      scheduleRender()
      changed()
    },
    setPitchZoom(value) {
      const next = clamp(value, 8, 36, pitchZoom)
      const top = ((scroll.scrollTop + height / 2) / pitchZoom) * next - height / 2
      pitchZoom = next
      resizeContent()
      setScroll(scroll.scrollLeft, top)
      scheduleRender()
      changed()
    },
    setTrackHeight(trackId, value) {
      heights.set(trackId, clamp(value, 56, 320))
      rebuildRows()
      resizeContent()
      scheduleRender()
    },
    setFollow,
    fitToSong() {
      if (destroyed) return
      resize()
      fitting = true
      view.setTimeZoom(minTimeZoom, 0)
      setScroll(0)
    },
    getViewport: snapshot,
    subscribe(listener) {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
    destroy() {
      if (destroyed) return
      finishDrag(false)
      destroyed = true
      window!.cancelAnimationFrame(renderFrame)
      for (const cleanup of cleanups.reverse()) cleanup()
      for (const child of Array.from(gutter.children)) {
        trackToggleCleanups.get(child.children[1] as HTMLElement)?.()
        trackLabelCleanups.get(child.children[0] as HTMLElement)?.()
      }
      subscribers.clear()
      root.remove()
    },
  }
  const gestureZoom = installGestureZoom(root, {
    getZoom: () => view.getViewport().timeZoom,
    viewportElement: scroll,
    onActiveChange: (active) => {
      gestureActive = active
    },
    onZoom: (value, anchorX) => {
      view.setTimeZoom(value, anchorX)
    },
  })
  cleanups.push(gestureZoom.destroy)
  rebuildRows()
  resize()
  focusPitch(true)
  // DPR 变化可能没有 CSS resize，重新注册 resolution 监听以覆盖跨屏拖动。
  let removeDprListener = () => {}
  function observeDpr(): void {
    removeDprListener()
    const query = window!.matchMedia(`(resolution: ${window!.devicePixelRatio}dppx)`)
    const update = () => {
      scheduleRender()
      observeDpr()
    }
    query.addEventListener('change', update, { once: true })
    removeDprListener = () => query.removeEventListener('change', update)
  }
  observeDpr()
  cleanups.push(() => removeDprListener())
  const pluginIds = new Set<string>()
  try {
    for (const plugin of options.plugins ?? []) {
      if (pluginIds.has(plugin.id)) throw new Error(`重复钢琴卷帘插件 ID: ${plugin.id}`)
      pluginIds.add(plugin.id)
      const cleanup = plugin.install(view)
      if (cleanup) cleanups.push(cleanup)
    }
  } catch (error) {
    view.destroy()
    throw error
  }
  return view
}
