import type { PianoRollDocument, PianoRollTrack } from '../core'
import type { PianoRollTheme, PianoRollThemeInput } from './theme'

export type { PianoRollTheme, PianoRollThemeInput } from './theme'

/** 外部权威时钟；所有位置均为原曲秒，倍速不改变音符 tick。 */
export interface PianoRollTransport {
  /** 原曲秒位置。 */
  positionSeconds: number
  /** 是否正在播放。 */
  isPlaying: boolean
  /** 时钟推进倍率。视图不自行累加时间。 */
  playbackRate: number
}

/** 宿主可以覆盖全部默认文案，无需依赖任何 i18n 框架。 */
export interface PianoRollLabels {
  overview: string
  editor: string
  follow: string
  following: string
  timeZoom: string
  pitchZoom: string
  enableTrack: string
  disableTrack: string
  notes: string
  empty: string
  playhead: string
  fit: string
  close: string
}

/** 每个视图独立维护的只读快照；缩放单位均为 CSS 像素。 */
export interface PianoRollViewport {
  /** 横向滚动偏移。 */
  scrollLeft: number
  /** 纵向滚动偏移。 */
  scrollTop: number
  /** 每原曲秒的像素数。 */
  timeZoom: number
  /** 当前容器恰好容纳完整曲目的缩放下限，与所有缩放入口一致。 */
  minTimeZoom: number
  /** 当前缩放上限；极短曲目会随整曲下限提高。 */
  maxTimeZoom: number
  /** 每个半音的像素高度。 */
  pitchZoom: number
  /** 当前是否启用播放跟随。 */
  follow: boolean
}

/** 插件只通过控制器公开契约访问视图，返回清理函数以释放订阅。 */
export interface PianoRollPlugin {
  /** 同一实例内唯一的插件 ID。 */
  id: string
  /** 安装入口；不应直接修改 document 中的音符。 */
  install(view: PianoRollView): void | (() => void)
}

/** 双击手势开始时的选择状态，避免前置 click 选轨造成错误的开关判断。 */
export interface PianoRollTrackOpenContext {
  /** 第一次 click 发生前选中的轨道。 */
  selectedTrackIdAtGestureStart: string | null
}

/** 宿主可用自己的 UI 组件渲染总览开关；公共包不绑定具体组件库。 */
export interface PianoRollTrackToggleContext {
  /** 当前轨道。 */
  track: PianoRollTrack
  /** 当前启用状态。 */
  checked: boolean
  /** 提交一次切换意图，不直接修改文档。 */
  onChange: () => void
}

/** 宿主可为可能被截断的音轨名称提供按需提示；短名称应保持普通文本。 */
export interface PianoRollTrackLabelContext {
  /** 当前音轨。 */
  track: PianoRollTrack
}

/** 宿主可在总览轨道行右侧挂载操作菜单（重命名、删除等）；公共包不绑定具体组件库。 */
export interface PianoRollTrackActionsContext {
  /** 当前音轨。 */
  track: PianoRollTrack
}

/** 循环区间（tick）。 */
export interface PianoRollLoopRange {
  startTick: number
  endTick: number
}

/**
 * 编辑手势解析出的意图。视图不修改文档，宿主应用意图后再调用 `setDocument`。
 * 前七种与 `@strawberrybear/midi-editor` 的 `EditorAction` 结构一致，可直接透传。
 */
export type PianoRollEditIntent =
  | { type: 'select'; noteIds: string[]; mode: 'replace' | 'toggle' | 'add' }
  | {
      type: 'add-note'
      trackId: string
      pitch: number
      startTick: number
      durationTicks: number
      velocity?: number
    }
  | { type: 'move'; noteIds: string[]; deltaTick: number; deltaPitch: number }
  | { type: 'resize'; noteIds: string[]; edge: 'start' | 'end'; deltaTick: number }
  | {
      type: 'set-velocity'
      changes: { noteId: string; velocity: number }[]
      coalesceKey?: string
    }
  | { type: 'delete'; noteIds: string[] }
  | { type: 'loop-change'; loop: PianoRollLoopRange | null }
  | { type: 'audition'; pitch: number; velocity: number }
  | {
      type: 'context-menu'
      noteId: string | null
      tick: number
      pitch: number
      clientX: number
      clientY: number
    }

/** 编辑层输入；全部为宿主状态的只读投影，视图内部不持有选择或吸附表。 */
export interface PianoRollEditingOptions {
  /** 关闭后视图退回只读，仍会绘制选中与可演奏高亮。 */
  enabled: boolean
  /** 指针工具：select 选择/移动/框选，draw 点击即落音符。 */
  tool: 'select' | 'draw'
  /** 当前选中音符 ID。 */
  selectedNoteIds: ReadonlySet<string>
  /** 由宿主注入的吸附函数；视图不了解网格分辨率。返回值应为非负 tick。 */
  snapTicks: (tick: number, mode: 'nearest' | 'floor') => number
  /** 新增音符的默认时长（tick）。 */
  defaultDurationTicks: number
  /** 新增音符的默认力度，默认 100。 */
  defaultVelocity?: number
  /** 游戏可演奏音高集合；非空时琴键/网格/音符会标记不可演奏项。null 关闭。 */
  highlightPitches?: ReadonlySet<number> | null
  /** 循环区间；null 不绘制。 */
  loop?: PianoRollLoopRange | null
  /** 力度条高度（px），0 或省略隐藏。 */
  velocityLaneHeight?: number
  /** 意图回调。 */
  onIntent: (intent: PianoRollEditIntent) => void
}

/** 浏览器控制器选项。浮层布局由宿主负责。 */
export interface PianoRollViewOptions {
  /** 编辑层配置；省略时视图只读。 */
  editing?: PianoRollEditingOptions
  /** 总览轨道行右侧操作位渲染器；返回清理函数。 */
  renderTrackActions?: (
    container: HTMLElement,
    context: PianoRollTrackActionsContext
  ) => void | (() => void)
  /** 渲染宿主，需由 CSS 提供非零高度。 */
  container: HTMLElement
  /** 不可变 MIDI 文档；修改后调用 setDocument。 */
  document: PianoRollDocument
  /** 外部播放时钟。 */
  transport?: PianoRollTransport
  /** 单轨详情当前轨道。 */
  selectedTrackId?: string | null
  /** 初始时间缩放，默认总览 42、详情 110 px/s。 */
  timeZoom?: number
  /** 初始音高行高，默认 16 px。 */
  pitchZoom?: number
  /** 初始 Follow，默认开启。 */
  follow?: boolean
  /** 每轨初始行高（56–320 px）；省略的轨道均分剩余视口高度，最低 56 px，溢出时纵向滚动。 */
  trackHeights?: Readonly<Record<string, number>>
  /** 仅在总览隐藏没有有效音符的轨道，默认 false；不改变文档、选择或轨道启用状态。 */
  hideEmptyTracks?: boolean
  /** 可本地化的无障碍和控制文案。 */
  labels?: Partial<PianoRollLabels>
  /** 主题令牌；省略时使用播放器匹配的浅粉色默认主题。 */
  theme?: PianoRollThemeInput
  /** 标尺点击或手柄松手时提交一次 seek，单位原曲秒。 */
  onSeek?: (seconds: number) => void
  /** 拖拽位置预览；null 表示完成或取消，不能直接用于音频 seek。 */
  onSeekPreview?: (seconds: number | null) => void
  /** 单击轨道。 */
  onTrackSelect?: (trackId: string) => void
  /** 双击轨道；宿主决定浮层的打开方式。 */
  onTrackOpen?: (trackId: string, context: PianoRollTrackOpenContext) => void
  /** 启用状态切换意图；具体播放策略由宿主处理。 */
  onTrackToggle?: (trackId: string) => void
  /** 可选的宿主控件渲染器；返回清理函数，避免公共包依赖具体 UI 组件库。 */
  renderTrackToggle?: (
    container: HTMLElement,
    context: PianoRollTrackToggleContext
  ) => void | (() => void)
  /** 可选的音轨名称渲染器；宿主可在实际发生截断时挂载 Tooltip。 */
  renderTrackLabel?: (
    container: HTMLElement,
    context: PianoRollTrackLabelContext
  ) => void | (() => void)
  /** 标尺左侧控件区域渲染器；返回销毁清理函数，未提供时显示默认文字。 */
  renderCorner?: (container: HTMLElement) => void | (() => void)
  /** Follow 状态变化，只作用于此视图。 */
  onFollowChange?: (enabled: boolean) => void
  /** 滚动或缩放变化的只读快照。 */
  onViewportChange?: (viewport: PianoRollViewport) => void
  /** 可选扩展，销毁控制器时统一清理。 */
  plugins?: readonly PianoRollPlugin[]
}

/** 总览与详情均实现此接口；实例之间不共享 DOM、缩放和滚动。 */
export interface PianoRollView {
  /** 替换不可变文档；不主动重置用户的缩放与横向滚动。 */
  setDocument(document: PianoRollDocument): void
  /** 更新外部时间。此调用只移动播放头，不重绘音符。 */
  setTransport(transport: PianoRollTransport): void
  /** 切换轨道；只有音域完全离开当前视口时才调整详情的纵向位置。 */
  setSelectedTrack(trackId: string | null): void
  /** 更新本地化文案，不重建实例或重置视口。 */
  setLabels(labels: Partial<PianoRollLabels>): void
  /** 动态替换颜色与字体令牌，不重建视图，也不重置滚动和缩放。 */
  setTheme(theme?: PianoRollThemeInput): void
  /** 当前已解析的完整主题，供插件或自定义 Canvas 使用。 */
  getTheme(): Readonly<PianoRollTheme>
  /** 设置每秒像素数。anchorX 是视口内锚点，默认可见播放头或中心。 */
  setTimeZoom(pixelsPerSecond: number, anchorX?: number): void
  /** 设置每半音像素数，以视口中心音高为锚。 */
  setPitchZoom(pixelsPerPitch: number): void
  /** 设置总览中某一轨道的行高，范围 56–320 px。 */
  setTrackHeight(trackId: string, height: number): void
  /** 切换总览空轨筛选并重新分配行高；保留选择、Follow 和缩放，详情视图不受影响。 */
  setHideEmptyTracks(enabled: boolean): void
  /** 开关跟随；开启后立即显示当前播放头。 */
  setFollow(enabled: boolean): void
  /** 缩放以显示全曲，保留纵向滚动。 */
  fitToSong(): void
  /** 获取独立视口快照。 */
  getViewport(): Readonly<PianoRollViewport>
  /** 将另一展示宿主保存的视口恢复到当前尺寸；越界值裁剪，开启 Follow 时遵循当前播放位置。 */
  restoreViewport(
    viewport: Readonly<
      Pick<PianoRollViewport, 'scrollLeft' | 'scrollTop' | 'timeZoom' | 'pitchZoom' | 'follow'>
    >
  ): void
  /** 替换编辑层配置；传 undefined 退回只读。不重建 DOM，不重置视口。 */
  setEditing(editing?: PianoRollEditingOptions): void
  /** 为插件订阅视口变化，返回取消订阅函数。 */
  subscribe(listener: (viewport: Readonly<PianoRollViewport>) => void): () => void
  /** 移除监听器、RAF、ResizeObserver、插件与本实例 DOM；可重复调用。 */
  destroy(): void
}

/** 默认文案仅用于开箱即用；宿主可通过 labels 覆盖。 */
export const defaultLabels: PianoRollLabels = {
  overview: '音轨总览',
  editor: '钢琴卷帘',
  follow: '跟随播放头',
  following: '跟随中',
  timeZoom: '时间缩放',
  pitchZoom: '音高缩放',
  enableTrack: '启用音轨',
  disableTrack: '禁用音轨',
  notes: '音符',
  empty: '暂无音轨',
  playhead: '播放位置',
  fit: '适合全曲',
  close: '关闭',
}
