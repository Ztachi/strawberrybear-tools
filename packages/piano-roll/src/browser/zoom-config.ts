/**
 * 时间轴缩放的集中调节参数，总览、详情、滑块和两种触控板事件共用。
 * 仅影响视图比例；音符 tick、时长、播放时钟及 seek 语义保持不变。
 */
export const TIME_ZOOM_CONFIG = {
  /** 最大时间放大比例（CSS px/s）。从 1200 提高至 4800，同等滑块位置展开更多细节。 */
  maxPixelsPerSecond: 4800,
  /** 手势倍率的指数：1 为原比例，2 使手指放大 1.5 倍时视图放大 2.25 倍。 */
  gestureExponent: 2,
  /** Ctrl/Meta + wheel 每像素对应的对数倍率，实际灵敏度再乘 gestureExponent。 */
  wheelLogScalePerPixel: 0.01,
} as const
