/**
 * 钢琴卷帘颜色令牌。
 *
 * 令牌刻意使用语义名称，而不是“粉色/绿色”等外观名称。宿主可以像
 * Ant Design 的 token 一样只覆盖需要的字段；未提供的字段会回退到
 * `defaultPianoRollTheme`。Canvas 与 DOM 样式都从同一份解析结果读取。
 */
export interface PianoRollThemeColors {
  /** 根视图背景。 */
  surface: string
  /** 标尺、标题栏和轨道侧栏背景。 */
  surfaceRaised: string
  /** 网格中的次级背景。 */
  surfaceSubtle: string
  /** 边框和滚动条轨道。 */
  border: string
  /** 普通文字。 */
  text: string
  /** 次要文字。 */
  textMuted: string
  /** 主品牌色，用于播放头和焦点。 */
  primary: string
  /** 主品牌色的浅色背景。 */
  primarySoft: string
  /** 选中轨道背景。 */
  trackSelected: string
  /** 启用轨道的内容区域。 */
  trackEnabled: string
  /** 禁用轨道的内容区域。 */
  trackDisabled: string
  /** 总览音符颜色。 */
  overviewNote: string
  /** 详情音符颜色。 */
  editorNote: string
  /** 详情音符描边。 */
  noteOutline: string
  /** 音符内部力度指示线。 */
  noteVelocity: string
  /** 小节线。 */
  gridMajor: string
  /** 拍线。 */
  gridBeat: string
  /** 细分线。 */
  gridMinor: string
  /** 播放头线。 */
  playhead: string
  /** 播放头手柄。 */
  playheadHandle: string
  /** 白键颜色。 */
  keyWhite: string
  /** 黑键颜色。 */
  keyBlack: string
  /** 琴键边界。 */
  keyBorder: string
  /** 滚动条滑块。 */
  scrollbarThumb: string
  /** 滚动条滑块悬停色。 */
  scrollbarThumbHover: string
  /** 键盘焦点轮廓。 */
  focus: string
  /** 选中音符填充。 */
  noteSelected: string
  /** 拖动/绘制中的幽灵音符。 */
  noteGhost: string
  /** 不在可演奏音高集合内的音符。 */
  noteUnplayable: string
  /** 框选矩形填充（应带透明度）。 */
  selectionBox: string
  /** 循环区间高亮（应带透明度）。 */
  loopRegion: string
  /** 力度条颜色。 */
  velocityBar: string
  /** 不可演奏音高行/琴键遮罩（应带透明度）。 */
  pitchUnplayable: string
}

/** 可选的非颜色视觉令牌。 */
export interface PianoRollThemeMetrics {
  /** 根视图字体。 */
  fontFamily: string
  /** 控件圆角。 */
  controlRadius: string
}

/** 完整、可直接用于渲染的钢琴卷帘主题。 */
export interface PianoRollTheme {
  colors: PianoRollThemeColors
  metrics: PianoRollThemeMetrics
}

/** 创建主题时允许的部分覆盖，适合从 app CSS token 组装。 */
export interface PianoRollThemeInput {
  /** Canvas 使用原样填充颜色，请传入具体 CSS 颜色值而非 `var(--token)`。 */
  colors?: Partial<PianoRollThemeColors>
  metrics?: Partial<PianoRollThemeMetrics>
}

/** 无限暖暖播放器当前的浅粉色默认主题。 */
export const defaultPianoRollTheme: PianoRollTheme = Object.freeze({
  colors: Object.freeze({
    surface: '#fff9fa',
    surfaceRaised: '#fff1f4',
    surfaceSubtle: '#fffafb',
    border: '#f1d9de',
    text: '#4a3f3f',
    textMuted: '#6b5a5a',
    primary: '#e36f86',
    primarySoft: '#f7b7be',
    trackSelected: '#ffe8ee',
    trackEnabled: '#fce9ed',
    trackDisabled: '#f4e4e7',
    overviewNote: '#9b3754',
    editorNote: '#e36f86',
    noteOutline: '#c9516b',
    noteVelocity: '#fff9fa',
    gridMajor: 'rgba(201, 81, 107, 0.32)',
    gridBeat: 'rgba(201, 81, 107, 0.18)',
    gridMinor: 'rgba(201, 81, 107, 0.08)',
    playhead: '#c9516b',
    playheadHandle: '#c9516b',
    keyWhite: '#ffffff',
    keyBlack: '#5f5053',
    keyBorder: '#e2d3d6',
    scrollbarThumb: '#e6a3af',
    scrollbarThumbHover: '#d97f91',
    focus: '#c9516b',
    noteSelected: '#7a2f45',
    noteGhost: 'rgba(227, 111, 134, 0.45)',
    noteUnplayable: '#b7a7aa',
    selectionBox: 'rgba(227, 111, 134, 0.16)',
    loopRegion: 'rgba(227, 111, 134, 0.14)',
    velocityBar: '#e36f86',
    pitchUnplayable: 'rgba(74, 63, 63, 0.07)',
  }),
  metrics: Object.freeze({
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    controlRadius: '6px',
  }),
})

/** 将局部主题安全合并为不可变的完整主题。 */
export function resolvePianoRollTheme(input?: PianoRollThemeInput): PianoRollTheme {
  const mergeStrings = <T extends object>(defaults: T, overrides?: Partial<T>): T => {
    const result = { ...defaults }
    if (!overrides) return result
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const value = overrides[key]
      // Vue 的可选 props 在动态更新时可能显式传入 undefined 或空白字符串；
      // 这两种情况均表示“未覆盖”，避免 Canvas 收到非法 fillStyle。
      if (typeof value === 'string' && value.trim().length > 0) {
        ;(result as Record<keyof T, unknown>)[key] = value
      }
    }
    return result
  }
  const colors = Object.freeze(
    mergeStrings(defaultPianoRollTheme.colors, input?.colors)
  ) as PianoRollThemeColors
  const metrics = Object.freeze(
    mergeStrings(defaultPianoRollTheme.metrics, input?.metrics)
  ) as PianoRollThemeMetrics
  return Object.freeze({
    colors: Object.freeze(colors),
    metrics: Object.freeze(metrics),
  })
}

/** 把主题映射为 CSS 自定义属性，供 DOM 和宿主样式读取。 */
export function pianoRollThemeVariables(theme: PianoRollTheme): Readonly<Record<string, string>> {
  return {
    '--pr-surface': theme.colors.surface,
    '--pr-surface-raised': theme.colors.surfaceRaised,
    '--pr-surface-subtle': theme.colors.surfaceSubtle,
    '--pr-border': theme.colors.border,
    '--pr-text': theme.colors.text,
    '--pr-text-muted': theme.colors.textMuted,
    '--pr-primary': theme.colors.primary,
    '--pr-primary-soft': theme.colors.primarySoft,
    '--pr-track-selected': theme.colors.trackSelected,
    '--pr-track-enabled': theme.colors.trackEnabled,
    '--pr-track-disabled': theme.colors.trackDisabled,
    '--pr-playhead': theme.colors.playhead,
    '--pr-playhead-handle': theme.colors.playheadHandle,
    '--pr-scrollbar-thumb': theme.colors.scrollbarThumb,
    '--pr-scrollbar-thumb-hover': theme.colors.scrollbarThumbHover,
    '--pr-focus': theme.colors.focus,
    '--pr-font-family': theme.metrics.fontFamily,
    '--pr-control-radius': theme.metrics.controlRadius,
  }
}

/**
 * 应用主题而不触碰子节点、滚动位置或缩放状态。
 * 控制器可以在 `setTheme` 中调用此函数，然后仅重绘 Canvas。
 */
export function applyPianoRollTheme(root: HTMLElement, theme: PianoRollTheme): void {
  for (const [name, value] of Object.entries(pianoRollThemeVariables(theme))) {
    root.style.setProperty(name, value)
  }
}
