/** MIDI 速度变化点；保留原始微秒精度，不经过整数 BPM 换算。 */
export interface TempoPoint {
  /** 变化发生的绝对 tick。 */
  tick: number
  /** 每四分音符的微秒数。 */
  microsecondsPerQuarter: number
}

/** MIDI 拍号变化点。 */
export interface TimeSignaturePoint {
  /** 变化发生的绝对 tick。 */
  tick: number
  /** 每小节拍数，例如 6/8 的 6。 */
  numerator: number
  /** 一拍所用音符的分母，例如 6/8 的 8（不是 MIDI 文件中的指数）。 */
  denominator: number
}

/** 只读音符数据；稳定 ID 可供后续选择、编辑和撤销功能引用。 */
export interface PianoRollNote {
  /** 文档范围内稳定且唯一的音符标识。 */
  id: string
  /** 所属轨道的稳定标识，不限定为连续数值。 */
  trackId: string
  /** MIDI 音高，范围 0–127。 */
  pitch: number
  /** MIDI 力度，范围 0–127。 */
  velocity: number
  /** 音符开始的绝对 tick。 */
  startTick: number
  /** 音符结束的绝对 tick；允许等于 startTick。 */
  endTick: number
}

/** 单条 MIDI 轨道的展示元数据。 */
export interface PianoRollTrack {
  /** 文档范围内稳定且唯一的轨道标识。 */
  id: string
  /** 显示名称。 */
  name: string
  /** 可选 MIDI 通道，范围 0–15。 */
  channel?: number
  /** 是否为打击乐轨道。 */
  isPercussion: boolean
  /** 可选 CSS 颜色；未指定时由渲染器选择。 */
  color?: string
  /** 轨道是否启用；与轨道选择状态独立。 */
  enabled: boolean
}

/** 平台无关的钢琴卷帘文档；时间事实由 MIDI 原始数据提供。 */
export interface PianoRollDocument {
  /** MIDI 完整结束 tick，必须包含尾部静音，不使用最后一个音符结束值替代。 */
  durationTicks: number
  /** 每四分音符的 tick 数（PPQ）；不是当前拍号分母所对应一拍的 tick 数。 */
  ticksPerBeat: number
  /** 速度映射；空数组使用 MIDI 默认速度 500000 微秒/四分音符。 */
  tempoMap: TempoPoint[]
  /** 拍号映射；空数组使用 4/4。 */
  timeSignatureMap: TimeSignaturePoint[]
  /** 全部轨道，允许存在没有音符的轨道。 */
  tracks: PianoRollTrack[]
  /** 全部音符，输入数组顺序不影响时间索引。 */
  notes: PianoRollNote[]
}

/** 音乐时间位置，小节和拍均从 1 开始。 */
export interface TickBarPosition {
  /** 小节序号。 */
  bar: number
  /** 小节内拍号分母所定义的拍序号。 */
  beat: number
  /** 当前拍内尚未满一拍的 tick。 */
  tickInBeat: number
}

/** 小节标尺的线条层级。 */
export type RulerMarkKind = 'bar' | 'beat' | 'subdivision'

/** 一条可见的标尺刻度；所有坐标由同一 tick 时间轴投射。 */
export interface RulerMark {
  /** 刻度的绝对 tick。 */
  tick: number
  /** 刻度对应的原曲秒数。 */
  seconds: number
  /** 内容坐标（不减去 scrollLeft，不含固定琴键栏宽度）。 */
  x: number
  /** 小节、拍或细分线。 */
  kind: RulerMarkKind
  /** 所属小节，从 1 开始。 */
  bar: number
  /** 所属拍，从 1 开始。 */
  beat: number
  /** 小节使用“1”，拍使用“1.2”，细分线使用空字符串。 */
  label: string
}

/** 仅生成当前视口附近的音乐刻度，避免长曲目创建全量网格。 */
export interface RulerMarkOptions {
  /** 可见区间左边界，单位原曲秒。 */
  startSeconds: number
  /** 可见区间右边界，单位原曲秒。 */
  endSeconds: number
  /** 每原曲秒的内容像素数。 */
  pixelsPerSecond: number
  /** 希望保留的最小刻度间距，默认 12 像素。缩小时优先保留小节线。 */
  minSpacingPx?: number
  /** 每一拍的最大细分数，默认 4，归一化为 1–64 的 2 次幂。 */
  subdivisions?: number
  /** 单次返回上限，默认 2000，最多 10000；极端缩小时自动降低密度。 */
  maxMarks?: number
}

/** 一次预处理后可重复查询的精确时间轴，导入和构造均不依赖 DOM。 */
export interface PianoRollTimeline {
  /** 已归一化的 PPQ。 */
  ticksPerBeat: number
  /** 按 tick 排序的速度映射，同 tick 最后一条有效输入生效。 */
  tempoMap: TempoPoint[]
  /** 按 tick 排序的有效拍号映射，同 tick 最后一条有效输入生效。 */
  timeSignatureMap: TimeSignaturePoint[]
  /** 文档声明的完整结束 tick。 */
  durationTicks: number
  /** 完整结束 tick 经速度映射积分所得的原曲秒数。 */
  durationSeconds: number
  /** 以二分查找把绝对 tick 转为原曲秒数。 */
  tickToSeconds(tick: number): number
  /** 以二分查找把原曲秒数转为绝对 tick，保留小数精度。 */
  secondsToTick(seconds: number): number
  /** 把 tick 转为从 0 开始的四分音符拍数，不受拍号影响。 */
  tickToBeat(tick: number): number
  /** 转为小节/拍位置；拍号改变时开启新小节，截断前一不完整小节。 */
  tickToBarPosition(tick: number): TickBarPosition
  /** 秒转内容像素；不包含固定侧栏，不减去视口滚动量。 */
  secondsToContentX(seconds: number, pixelsPerSecond: number): number
  /** 内容像素转原曲秒数；无效缩放值回退为 1 像素/秒。 */
  contentXToSeconds(x: number, pixelsPerSecond: number): number
  /** 生成可见秒区间内的小节、拍和细分刻度，位置由 tick 投射到秒。 */
  getRulerMarks(options: RulerMarkOptions): RulerMark[]
}
