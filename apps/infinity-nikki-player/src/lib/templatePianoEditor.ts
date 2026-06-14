/**
 * @fileOverview 模板钢琴 Canvas 编辑器
 * @description 封装 88 键钢琴绘制、命中、映射捕获、预览高亮和撤销/恢复历史，Vue 组件只负责把状态绑定到界面。
 */
import type { KeyMapping } from '@/types'
import {
  isBlackKey,
  isExcludedCaptureKey,
  mappingKeyToCode,
  normalizeMappingKeyFromEvent,
  normalizeTemplateMappings,
  pitchToNoteName,
  setMappingForPitch,
  TEMPLATE_MAX_PITCH,
  TEMPLATE_MIN_PITCH,
} from '@/lib/templateKeys'

export type TemplatePianoEditorMode = 'edit' | 'overview'

/**
 * @description: Canvas 琴键矩形
 * @description 保存每个 MIDI 音高在当前 Canvas 模式下的命中区域和黑白键信息。
 */
interface PianoKeyRect {
  /** MIDI 音高 */
  pitch: number
  /** Canvas 逻辑坐标 x */
  x: number
  /** Canvas 逻辑坐标 y */
  y: number
  /** 琴键宽度 */
  width: number
  /** 琴键高度 */
  height: number
  /** 是否为黑键 */
  black: boolean
}

/**
 * @description: 钢琴编辑器对外状态
 */
export interface TemplatePianoEditorState {
  /** 编辑器模式：edit 为固定键宽编辑，overview 为 88 键缩放预览 */
  mode: TemplatePianoEditorMode
  /** 当前选中的 MIDI 音高 */
  selectedPitch: number
  /** 当前选中音高对应的映射 */
  selectedMapping: KeyMapping | null
  /** 是否开启全局映射模式 */
  isMappingMode: boolean
  /** 是否可撤销 */
  canUndo: boolean
  /** 是否可恢复 */
  canRedo: boolean
  /** 虚拟键盘需要高亮的 KeyboardEvent.code 集合 */
  previewActiveKeys: Set<string>
  /** 虚拟键盘 code 到 MIDI 音高的映射 */
  keyboardKeyCodeToPitch: Map<string, number>
}

/**
 * @description: 钢琴编辑器初始化参数
 */
export interface TemplatePianoEditorOptions {
  /** 承载横向滚动和 Canvas 的容器 */
  container: HTMLDivElement
  /** 初始模板映射列表 */
  mappings: KeyMapping[]
  /**
   * @description: 播放指定音高
   * @param {number} pitch - MIDI 音高
   * @param {number} velocity - 播放力度
   * @param {number} durationSeconds - 持续秒数
   * @return {Promise<void>} 无返回值
   */
  playNote: (pitch: number, velocity: number, durationSeconds: number) => Promise<void>
  /**
   * @description: 停止指定音高播放
   * @param {number} pitch - MIDI 音高
   * @return {void}
   */
  stopNote: (pitch: number) => void
  /**
   * @description: 通知外部映射列表变更
   * @param {KeyMapping[]} mappings - 新映射列表
   * @return {void}
   */
  onMappingsChange: (mappings: KeyMapping[]) => void
  /**
   * @description: 通知外部刷新界面状态
   * @param {TemplatePianoEditorState} state - 最新编辑器状态
   * @return {void}
   */
  onStateChange: (state: TemplatePianoEditorState) => void
  /**
   * @description: 通知外部展示不支持按键提示
   * @param {string} key - 用户按下的原始按键名
   * @return {void}
   */
  onUnsupportedKey: (key: string) => void
}

/** 编辑模式白键固定宽度，保证局部编辑时琴键可点选。 */
const WHITE_KEY_WIDTH = 38
/** 编辑模式白键固定高度。 */
const WHITE_KEY_HEIGHT = 238
/** 编辑模式黑键固定宽度。 */
const BLACK_KEY_WIDTH = 24
/** 编辑模式黑键固定高度。 */
const BLACK_KEY_HEIGHT = 146
/** 全局预览模式 Canvas 高度。 */
const OVERVIEW_HEIGHT = 168
/** 全局预览的最小逻辑宽度，避免窄窗口下键位压得不可读。 */
const OVERVIEW_MIN_WIDTH = 720
/** 点击琴键发音时的高亮持续时长。 */
const ACTIVE_PITCH_FLASH_DURATION_MS = 220
/** 键盘长按预览持续时长，keyup 会提前停止。 */
const KEYBOARD_HOLD_PREVIEW_DURATION_SECONDS = 60 * 60
/** 撤销历史上限，避免长期编辑占用过多内存。 */
const MAX_HISTORY_SIZE = 100

/**
 * @description 模板按键名在虚拟钢琴 badge 上的展示简写（短文本，避免溢出窄琴键）。
 * @description 该表是虚拟钢琴独有的展示配置，虚拟键盘保留完整文字（Space / Tab / Enter）方便识别。
 * @description 规则：单词类控制键 → 2 字母简写；方向键 → 箭头符号；其他无简写则原样回退。
 */
const PIANO_MAPPING_KEY_DISPLAY: Record<string, string> = {
  SPACE: 'SE',
  TAB: 'TB',
  ENTER: 'EN',
  ARROWUP: '↑',
  ARROWDOWN: '↓',
  ARROWLEFT: '←',
  ARROWRIGHT: '→',
}

/**
 * @description 获取模板按键名在虚拟钢琴上的展示简写（取 PIANO_MAPPING_KEY_DISPLAY，回退原文字）。
 * @param {string} key - 模板按键名，如 SPACE、ARROWUP
 * @return {string} 展示文字，1-2 字符，绝不溢出窄琴键
 */
function getPianoMappingKeyDisplay(key: string): string {
  return PIANO_MAPPING_KEY_DISPLAY[key] ?? key
}

/** 88 键钢琴覆盖的所有 MIDI 音高。 */
const ALL_PITCHES = Array.from(
  { length: TEMPLATE_MAX_PITCH - TEMPLATE_MIN_PITCH + 1 },
  (_, index) => TEMPLATE_MIN_PITCH + index
)
/** 白键音高列表，用于计算横向布局宽度和黑键相对位置。 */
const WHITE_PITCHES = ALL_PITCHES.filter((pitch) => !isBlackKey(pitch))

/**
 * @description: 模板钢琴 Canvas 编辑器
 */
export class TemplatePianoEditor {
  private readonly container: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly playNote: TemplatePianoEditorOptions['playNote']
  private readonly stopNote: TemplatePianoEditorOptions['stopNote']
  private readonly onMappingsChange: TemplatePianoEditorOptions['onMappingsChange']
  private readonly onStateChange: TemplatePianoEditorOptions['onStateChange']
  private readonly onUnsupportedKey: TemplatePianoEditorOptions['onUnsupportedKey']
  private mappings: KeyMapping[]
  private mode: TemplatePianoEditorMode = 'edit'
  private selectedPitch = 60
  private isMappingMode = false
  private activePitches = new Set<number>()
  private pressedMappedKeys = new Set<string>()
  private canvasWidth = 0
  private keyRects: PianoKeyRect[] = []
  private isDragging = false
  private dragStartX = 0
  private dragStartScrollLeft = 0
  private resizeObserver: ResizeObserver | null = null
  private undoStack: KeyMapping[][] = []
  private redoStack: KeyMapping[][] = []

  constructor(options: TemplatePianoEditorOptions) {
    this.container = options.container
    this.playNote = options.playNote
    this.stopNote = options.stopNote
    this.onMappingsChange = options.onMappingsChange
    this.onStateChange = options.onStateChange
    this.onUnsupportedKey = options.onUnsupportedKey
    this.mappings = normalizeTemplateMappings(options.mappings)

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'template-piano-editor-canvas'
    this.canvas.style.display = 'block'
    this.canvas.style.cursor = 'pointer'
    this.canvas.style.touchAction = 'none'
    this.canvas.style.setProperty('-webkit-touch-callout', 'none')
    this.canvas.style.webkitUserSelect = 'none'
    this.canvas.style.userSelect = 'none'
    this.container.appendChild(this.canvas)

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    window.addEventListener('keydown', this.handleKeyDown, true)
    window.addEventListener('keyup', this.handleKeyUp, true)

    this.resizeObserver = new ResizeObserver(() => this.setCanvasSize())
    this.resizeObserver.observe(this.container)
    this.setCanvasSize()
    this.scheduleSelectedPitchIntoView()
    this.emitState()
  }

  /**
   * @description: 更新映射列表
   * @param {KeyMapping[]} mappings - 外部传入的映射列表
   * @param {{ resetHistory?: boolean }} options - 是否重置撤销历史
   * @return {void}
   */
  setMappings(mappings: KeyMapping[], options: { resetHistory?: boolean } = {}): void {
    this.mappings = normalizeTemplateMappings(mappings)
    if (options.resetHistory) {
      // 外部打开模板、加载草稿或保存后替换编辑对象时，当前内容就是新的撤销基线。
      this.undoStack = []
      this.redoStack = []
    }
    this.drawCanvas()
    if (options.resetHistory) {
      this.scheduleSelectedPitchIntoView()
    }
    this.emitState()
  }

  /**
   * @description: 切换编辑模式和全局预览模式
   * @return {void}
   */
  toggleMode(): void {
    // edit/overview 互斥切换，保持操作语义明确。
    this.mode = this.mode === 'edit' ? 'overview' : 'edit'
    // 模式切换会改变 Canvas 逻辑尺寸，必须先重算再滚动到当前音高。
    this.setCanvasSize()
    this.scrollPitchIntoView(this.selectedPitch)
    this.emitState()
  }

  /**
   * @description: 设置或切换映射模式
   * @param {boolean} enabled - 目标映射模式；不传则反转
   * @return {void}
   */
  setMappingMode(enabled = !this.isMappingMode): void {
    this.isMappingMode = enabled
    this.drawCanvas()
    this.emitState()
  }

  /**
   * @description: 清除当前选中琴键映射
   * @return {void}
   */
  clearSelectedMapping(): void {
    this.applyMappings(setMappingForPitch(this.mappings, this.selectedPitch, null))
  }

  /**
   * @description: 撤销最近一次映射变更
   * @return {void}
   */
  undo(): void {
    const previous = this.undoStack.pop()
    if (!previous) return
    // 当前状态进入 redo 栈，用户才能恢复刚撤销的映射变更。
    this.redoStack.push(this.cloneMappings(this.mappings))
    this.restoreHistorySnapshot(previous)
  }

  /**
   * @description: 恢复最近一次撤销的映射变更
   * @return {void}
   */
  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    // 当前状态进入 undo 栈，恢复后仍可再次撤销。
    this.pushUndoSnapshot(this.mappings)
    this.restoreHistorySnapshot(next)
  }

  /**
   * @description: 处理虚拟键盘点击
   * @description 点击已映射虚拟键会选中对应钢琴音高并试听。
   * @param {string} code - 虚拟键盘按键 code
   * @return {void}
   */
  handleKeyboardKeyClick(code: string): void {
    const pitch = this.getKeyboardKeyCodeToPitch().get(code)
    if (pitch === undefined) return
    this.selectedPitch = pitch
    void this.previewPitch(pitch)
    this.scrollPitchIntoView(pitch)
    this.drawCanvas()
    this.emitState()
  }

  /**
   * @description: 滚动编辑模式 Canvas，使指定音高尽量居中
   * @param {number} pitch - MIDI 音高
   * @return {void}
   */
  scrollPitchIntoView(pitch: number): void {
    if (this.mode !== 'edit') return
    const whiteIndex = this.getWhiteKeyIndex(isBlackKey(pitch) ? pitch - 1 : pitch)
    if (whiteIndex < 0) return
    const keyLeft = whiteIndex * WHITE_KEY_WIDTH
    const keyRight = keyLeft + WHITE_KEY_WIDTH
    const visibleLeft = this.container.scrollLeft
    const visibleRight = visibleLeft + this.container.clientWidth
    // 目标琴键已经完整在可视范围内时不改 scrollLeft，避免连续按键时界面来回滚动。
    if (keyLeft >= visibleLeft && keyRight <= visibleRight) return
    const targetLeft =
      whiteIndex * WHITE_KEY_WIDTH - this.container.clientWidth / 2 + WHITE_KEY_WIDTH
    this.container.scrollLeft = Math.max(0, targetLeft)
  }

  /**
   * @description: 销毁编辑器并释放 DOM、监听器和正在播放的预览音
   * @return {void}
   */
  destroy(): void {
    this.resizeObserver?.disconnect()
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    window.removeEventListener('keydown', this.handleKeyDown, true)
    window.removeEventListener('keyup', this.handleKeyUp, true)
    for (const key of this.pressedMappedKeys) {
      const mapping = this.mappings.find((item) => item.key === key)
      if (mapping) this.stopNote(mapping.pitch)
    }
    this.canvas.remove()
  }

  private handlePointerDown = (event: PointerEvent): void => {
    // 记录拖拽起点，用于 pointermove 中换算横向滚动距离。
    this.isDragging = true
    this.dragStartX = event.clientX
    this.dragStartScrollLeft = this.container.scrollLeft
    // 捕获指针，避免拖动过程中鼠标离开 Canvas 导致 pointerup 丢失。
    this.canvas.setPointerCapture(event.pointerId)
  }

  private handlePointerMove = (event: PointerEvent): void => {
    // 只有编辑模式需要横向拖拽；预览模式已经缩放到一屏。
    if (!this.isDragging || this.mode === 'overview') return
    // 鼠标向右拖时内容向左回滚，因此 scrollLeft 使用反向距离。
    const distance = event.clientX - this.dragStartX
    // 小于 3px 的移动视为点击抖动，避免误触发滚动。
    if (Math.abs(distance) > 3) {
      this.container.scrollLeft = this.dragStartScrollLeft - distance
    }
  }

  private handlePointerUp = (event: PointerEvent): void => {
    // 释放时先尝试解析当前指针命中的琴键。
    const pitch = this.getPointerPitch(event)
    // scrollLeft 实际变化超过阈值时视为拖拽，不触发琴键点击。
    const wasDrag =
      this.mode === 'edit' && Math.abs(this.container.scrollLeft - this.dragStartScrollLeft) > 4
    this.isDragging = false

    if (!wasDrag && pitch !== null) {
      this.selectedPitch = pitch
      void this.previewPitch(pitch)
      this.drawCanvas()
      this.emitState()
    }
  }

  private handlePointerCancel = (): void => {
    this.isDragging = false
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // 保存快捷键由模板抽屉统一处理，映射模式下也不能拦截或写入映射。
    if (this.isSaveShortcut(event)) return

    // 非映射模式下，用户在输入框里打字不应触发钢琴发音或映射预览。
    if (!this.isMappingMode && this.isEditableEventTarget(event.target)) return

    if (this.handleHistoryShortcut(event)) {
      return
    }

    // 先归一化按键，后续捕获和预览共用同一个键名。
    const normalized = normalizeMappingKeyFromEvent(event)
    // 非捕获状态下，如果物理键已有映射，就找到对应琴键用于预览高亮。
    const pressedMappedPitch = normalized
      ? this.mappings.find((mapping) => mapping.key === normalized)?.pitch
      : undefined

    if (this.isMappingMode) {
      // 映射期间阻止按键继续冒泡，避免触发页面快捷键或输入到其他控件。
      event.preventDefault()
      event.stopPropagation()

      // Escape 快速清除当前琴键映射，符合连续编辑时的键盘操作直觉。
      if (event.key === 'Escape') {
        this.clearSelectedMapping()
        return
      }

      // Backspace/Delete 在映射模式下也作为清除当前琴键映射的快捷键。
      if (event.key === 'Backspace' || event.key === 'Delete') {
        this.clearSelectedMapping()
        return
      }

      if (!normalized || isExcludedCaptureKey(event)) {
        // 系统键和组合键修饰键不进入模板，也不提示，避免 Command+S 先按 Command 就打扰用户。
        if (!this.isSilentUnsupportedKey(event)) {
          this.onUnsupportedKey(event.key)
        }
        return
      }

      // 映射模式持续开启，方便用户连续点琴键并按物理键完成多组映射。
      this.applyMappings(setMappingForPitch(this.mappings, this.selectedPitch, normalized))
      return
    }

    if (normalized && pressedMappedPitch !== undefined) {
      if (event.repeat || this.pressedMappedKeys.has(normalized)) return
      // 使用新 Set 保存按下状态，驱动 Canvas 和虚拟键盘反向高亮。
      this.pressedMappedKeys = new Set(this.pressedMappedKeys).add(normalized)
      this.selectedPitch = pressedMappedPitch
      this.scrollPitchIntoView(pressedMappedPitch)
      void this.playNote(pressedMappedPitch, 88, KEYBOARD_HOLD_PREVIEW_DURATION_SECONDS)
      this.drawCanvas()
      this.emitState()
    }
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (this.isSaveShortcut(event)) return

    // 释放时同样归一化，和 keydown 中保存到 Set 的键名保持一致。
    const normalized = normalizeMappingKeyFromEvent(event)
    if (!normalized) return
    const wasPressed = this.pressedMappedKeys.has(normalized)
    const releasedMapping = wasPressed
      ? this.mappings.find((mapping) => mapping.key === normalized)
      : undefined
    if (releasedMapping) {
      this.stopNote(releasedMapping.pitch)
    }
    // 替换 Set 实例，保持状态快照不可变。
    const next = new Set(this.pressedMappedKeys)
    next.delete(normalized)
    this.pressedMappedKeys = next
    this.drawCanvas()
    this.emitState()
  }

  private handleHistoryShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()
    const withModifier = event.ctrlKey || event.metaKey
    if (!withModifier) return false

    if (key === 'z' && event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      this.redo()
      return true
    }

    if (key === 'z') {
      event.preventDefault()
      event.stopPropagation()
      this.undo()
      return true
    }

    if (key === 'y') {
      event.preventDefault()
      event.stopPropagation()
      this.redo()
      return true
    }

    return false
  }

  private applyMappings(nextMappings: KeyMapping[]): void {
    const normalized = normalizeTemplateMappings(nextMappings)
    if (this.areMappingsEqual(this.mappings, normalized)) {
      return
    }
    this.pushUndoSnapshot(this.mappings)
    this.redoStack = []
    this.mappings = normalized
    this.drawCanvas()
    this.emitState()
    this.onMappingsChange(this.cloneMappings(this.mappings))
  }

  private restoreHistorySnapshot(snapshot: KeyMapping[]): void {
    this.mappings = this.cloneMappings(snapshot)
    this.drawCanvas()
    this.emitState()
    this.onMappingsChange(this.cloneMappings(this.mappings))
  }

  private pushUndoSnapshot(snapshot: KeyMapping[]): void {
    this.undoStack.push(this.cloneMappings(snapshot))
    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      // 超出上限时丢弃最旧快照，新近编辑路径优先保留。
      this.undoStack.shift()
    }
  }

  private cloneMappings(mappings: KeyMapping[]): KeyMapping[] {
    return mappings.map((mapping) => ({ pitch: mapping.pitch, key: mapping.key }))
  }

  private areMappingsEqual(left: KeyMapping[], right: KeyMapping[]): boolean {
    const normalizedLeft = normalizeTemplateMappings(left)
    const normalizedRight = normalizeTemplateMappings(right)
    if (normalizedLeft.length !== normalizedRight.length) return false
    return normalizedLeft.every((mapping, index) => {
      const compared = normalizedRight[index]
      return mapping.pitch === compared.pitch && mapping.key === compared.key
    })
  }

  private getSelectedMapping(): KeyMapping | null {
    return this.mappings.find((mapping) => mapping.pitch === this.selectedPitch) ?? null
  }

  private getKeyboardKeyCodeToPitch(): Map<string, number> {
    const map = new Map<string, number>()
    for (const mapping of this.mappings) {
      map.set(mappingKeyToCode(mapping.key), mapping.pitch)
    }
    return map
  }

  private getPreviewActiveKeys(): Set<string> {
    const active = new Set<string>()
    const selectedMapping = this.getSelectedMapping()
    if (selectedMapping) {
      active.add(mappingKeyToCode(selectedMapping.key))
    }
    for (const key of this.pressedMappedKeys) {
      active.add(mappingKeyToCode(key))
    }
    return active
  }

  private emitState(): void {
    this.onStateChange({
      mode: this.mode,
      selectedPitch: this.selectedPitch,
      selectedMapping: this.getSelectedMapping(),
      isMappingMode: this.isMappingMode,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      previewActiveKeys: this.getPreviewActiveKeys(),
      keyboardKeyCodeToPitch: this.getKeyboardKeyCodeToPitch(),
    })
  }

  private async previewPitch(pitch: number): Promise<void> {
    // 先高亮再发音，即使音频初始化稍慢也能马上给用户反馈。
    this.flashPitch(pitch)
    await this.playNote(pitch, 88, 0.55)
  }

  private flashPitch(pitch: number): void {
    this.activePitches = new Set(this.activePitches).add(pitch)
    this.drawCanvas()
    window.setTimeout(() => {
      // 延迟清理也替换 Set，避免异步回调修改旧状态。
      const current = new Set(this.activePitches)
      current.delete(pitch)
      this.activePitches = current
      this.drawCanvas()
    }, ACTIVE_PITCH_FLASH_DURATION_MS)
  }

  private setCanvasSize(): void {
    // CSS 逻辑尺寸用于布局和命中计算。
    const width = this.getContentWidth()
    const height = this.getCanvasHeight()
    // 真实像素尺寸乘设备像素比，避免 Retina 屏 Canvas 模糊。
    const ratio = window.devicePixelRatio || 1
    this.canvasWidth = width
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.canvas.width = Math.floor(width * ratio)
    this.canvas.height = Math.floor(height * ratio)
    // 尺寸变化后必须重绘，否则 Canvas 会被浏览器清空。
    this.drawCanvas()
  }

  private scheduleSelectedPitchIntoView(): void {
    // 抽屉打开和容器 resize 会让布局晚于编辑器构造稳定，延后一帧再滚动才能拿到真实宽度。
    window.requestAnimationFrame(() => this.scrollPitchIntoView(this.selectedPitch))
    // 抽屉过渡结束前可能再次改变宽度，再补一次轻量定位，保证首次进入能看到当前选中音。
    window.setTimeout(() => this.scrollPitchIntoView(this.selectedPitch), 120)
  }

  private getContentWidth(): number {
    if (this.mode === 'overview') {
      // 全局预览需要填满当前容器；最小宽度避免键位压得不可读。
      return Math.max(this.container.clientWidth, OVERVIEW_MIN_WIDTH)
    }
    // 编辑模式保持固定白键宽度，让用户能精确点击单个琴键。
    return WHITE_PITCHES.length * WHITE_KEY_WIDTH
  }

  private getCanvasHeight(): number {
    // 预览模式降低高度，让 88 键一屏查看；编辑模式保留足够点击面积。
    return this.mode === 'overview' ? OVERVIEW_HEIGHT : WHITE_KEY_HEIGHT
  }

  private getWhiteKeyIndex(pitch: number): number {
    return WHITE_PITCHES.indexOf(pitch)
  }

  private getWhiteKeyIndexBefore(pitch: number): number {
    return WHITE_PITCHES.filter((whitePitch) => whitePitch < pitch).length
  }

  private buildRects(width: number, height: number): PianoKeyRect[] {
    // 当前模式下的白键宽度：编辑模式固定，预览模式按容器均分。
    const whiteWidth = width / WHITE_PITCHES.length
    // 预览模式黑键随白键缩放，同时设置最小宽度保证可见。
    const blackWidth = this.mode === 'overview' ? Math.max(12, whiteWidth * 0.72) : BLACK_KEY_WIDTH
    // 黑键高度按白键高度缩放，编辑模式使用固定高度保证观感稳定。
    const blackHeight = this.mode === 'overview' ? height * 0.62 : BLACK_KEY_HEIGHT
    // rects 既用于绘制也用于鼠标命中检测，因此必须保存完整几何信息。
    const rects: PianoKeyRect[] = []

    for (const pitch of WHITE_PITCHES) {
      // 白键从左到右连续排列，x 坐标由白键索引决定。
      rects.push({
        pitch,
        x: this.getWhiteKeyIndex(pitch) * whiteWidth,
        y: 0,
        width: whiteWidth,
        height,
        black: false,
      })
    }

    for (const pitch of ALL_PITCHES.filter(isBlackKey)) {
      // 黑键位于其前方白键边界附近，因此用“前方白键数量”定位。
      const whiteIndexBefore = this.getWhiteKeyIndexBefore(pitch)
      rects.push({
        pitch,
        x: whiteIndexBefore * whiteWidth - blackWidth / 2,
        y: 0,
        width: blackWidth,
        height: blackHeight,
        black: true,
      })
    }

    return rects
  }

  private drawCanvas(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return

    // 重新设置 transform，避免多次 resize 后设备像素比被重复叠乘。
    const ratio = window.devicePixelRatio || 1
    const width = this.canvasWidth
    const height = this.getCanvasHeight()
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    // 全量清理上一帧内容，避免映射 badge 或高亮残留。
    ctx.clearRect(0, 0, width, height)
    // 先铺底色，保证透明背景下黑白键对比稳定。
    ctx.fillStyle = '#fff7f8'
    ctx.fillRect(0, 0, width, height)

    // 每次绘制前重算矩形，保证滚动/缩放/容器变化后命中区域同步。
    const rects = this.buildRects(width, height)
    this.keyRects = rects

    // 白键先绘制、黑键后绘制，保持真实钢琴的覆盖关系。
    for (const rect of rects.filter((item) => !item.black)) {
      this.drawKey(ctx, rect)
    }
    for (const rect of rects.filter((item) => item.black)) {
      this.drawKey(ctx, rect)
    }
  }

  private drawKey(ctx: CanvasRenderingContext2D, rect: PianoKeyRect): void {
    // 映射按键用于绘制 badge，也用于判断物理键按下时是否需要高亮。
    const mappingKey = this.mappings.find((mapping) => mapping.pitch === rect.pitch)?.key ?? null
    // selected 表示用户当前正在查看/操作的琴键。
    const selected = this.selectedPitch === rect.pitch
    // mappingTarget 表示映射模式下当前琴键会接收下一次物理按键输入。
    const mappingTarget = this.isMappingMode && selected
    // active 表示用户刚点击琴键发音，需要短暂视觉反馈。
    const active = this.activePitches.has(rect.pitch)
    // mappedPressed 表示用户按下了已映射的物理键，需要反向高亮对应琴键。
    const mappedPressed = mappingKey ? this.pressedMappedKeys.has(mappingKey) : false
    // 任意一种交互状态都应该让琴键进入高亮态。
    const isHighlighted = selected || mappingTarget || active || mappedPressed

    // 保存上下文状态，避免字体、颜色和线宽影响后续琴键。
    ctx.save()
    if (rect.black) {
      // 黑键用深色底；交互高亮时使用品牌粉色。
      ctx.fillStyle = isHighlighted ? '#f7a5b0' : '#3d3030'
      this.fillRoundRect(ctx, rect.x, rect.y, rect.width, rect.height, 5)
      // 映射目标使用更醒目的边框，帮助用户确认下一次按键会写入哪颗琴键。
      ctx.strokeStyle = mappingTarget ? '#f43f5e' : '#5a4646'
      ctx.lineWidth = mappingTarget ? 3 : 1
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
      ctx.fillStyle = '#ffffff'
    } else {
      // 白键保持浅色底；交互高亮时用浅粉底色。
      ctx.fillStyle = isHighlighted ? '#ffe2e8' : '#ffffff'
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      // 映射目标同样加强边框，和黑键保持一致语义。
      ctx.strokeStyle = mappingTarget ? '#f43f5e' : '#f4c4cb'
      ctx.lineWidth = mappingTarget ? 3 : 1
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
      ctx.fillStyle = '#4a3f3f'
    }

    // 黑白键音名上下错开，密集预览时不会糊成一条直线。
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 黑键高度比白键短约 40%，字号同步缩放避免遮挡。
    const noteFontSize = this.mode === 'overview' ? 6 : rect.black ? 9 : 11
    ctx.font = `${noteFontSize}px sans-serif`
    // 映射 badge 靠近琴键底部（黑键距底 14，白键距底 24，badge 实际高度 14-18）
    const mappingBadgeY = rect.black ? rect.height - 14 : rect.height - 24
    // 黑白键 note 都放在底部 badge 上方，与白键视觉一致；黑键略向上提一点防止与 badge 重叠
    const noteLabelY =
      this.mode === 'overview'
        ? mappingBadgeY - 22
        : rect.black
          ? mappingBadgeY - 16
          : mappingBadgeY - 36
    ctx.fillText(pitchToNoteName(rect.pitch), rect.x + rect.width / 2, noteLabelY)

    if (mappingKey) {
      // 用虚拟钢琴独立的简写表展示（SE / EN / ↑ 等），避免长键名溢出琴键宽度
      const displayKey = getPianoMappingKeyDisplay(mappingKey)
      // 映射 badge 靠近琴键底部；黑键高度更短，badge 高度同步缩短。
      // badge 宽度使用 measureText 实际测量 + padding，精确控制不溢出。
      const badgeFontSize = this.mode === 'overview' ? 7 : rect.black ? 9 : 11
      ctx.font = `${badgeFontSize}px sans-serif`
      const textWidth = ctx.measureText(displayKey).width
      const horizontalPadding = this.mode === 'overview' ? 4 : 6
      const badgeWidth = Math.min(
        rect.width - 4,
        Math.max(this.mode === 'overview' ? 12 : 18, textWidth + horizontalPadding * 2)
      )
      ctx.fillStyle = rect.black ? 'rgba(255,255,255,0.92)' : '#f7c0c1'
      this.fillRoundRect(
        ctx,
        rect.x + (rect.width - badgeWidth) / 2,
        mappingBadgeY - (this.mode === 'overview' ? 7 : 9),
        badgeWidth,
        this.mode === 'overview' ? 14 : rect.black ? 14 : 18,
        9
      )
      ctx.fillStyle = '#4a3f3f'
      ctx.fillText(displayKey, rect.x + rect.width / 2, mappingBadgeY)
    }

    if (mappingTarget) {
      // 映射目标底部画一条状态条，避免只靠边框在密集琴键中不明显。
      ctx.fillStyle = '#f43f5e'
      this.fillRoundRect(ctx, rect.x + 4, rect.height - 8, rect.width - 8, 4, 2)
    }

    // 恢复 Canvas 上下文，确保下一颗琴键从干净状态绘制。
    ctx.restore()
  }

  private fillRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    // 每次绘制圆角矩形都从新路径开始，避免承接上一个 key 的路径。
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, radius)
    ctx.fill()
  }

  private getPointerPitch(event: PointerEvent): number | null {
    // client 坐标转换为 Canvas CSS 逻辑坐标；绘制和命中都使用同一坐标系。
    const bounds = this.canvas.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    // 黑键覆盖在白键上方，必须优先命中黑键，否则黑键区域会被白键抢走。
    const blackHit = this.keyRects
      .filter((rect) => rect.black)
      .find(
        (rect) =>
          x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
      )
    if (blackHit) return blackHit.pitch
    // 黑键未命中时再查白键。
    const whiteHit = this.keyRects
      .filter((rect) => !rect.black)
      .find(
        (rect) =>
          x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
      )
    return whiteHit?.pitch ?? null
  }

  private isEditableEventTarget(target: EventTarget | null): boolean {
    // 非 HTMLElement 没有 input/contentEditable 语义，直接视为不可编辑目标。
    if (!(target instanceof HTMLElement)) return false
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    )
  }

  private isSaveShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
  }

  private isSilentUnsupportedKey(event: KeyboardEvent): boolean {
    // 组合键修饰键属于用户正在输入快捷键的一部分，不应该弹不支持提示。
    if (event.metaKey || event.ctrlKey || event.altKey) return true
    // Escape、Command、Ctrl、Alt、Shift 等明确排除键静默忽略；清除键在上方已单独处理。
    return isExcludedCaptureKey(event)
  }
}
