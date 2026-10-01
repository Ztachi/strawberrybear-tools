/** 钢琴键的内容几何。等宽白键连续铺满，黑键覆盖在相邻白键的接缝上。 */
export interface PianoKeyGeometry {
  pitch: number
  black: boolean
  top: number
  height: number
}

/** 一个八度内按 C、D、E、F、G、A、B 排列的白键音级。 */
const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11] as const

/** MIDI 半音对应是否为黑键。@param pitch MIDI 音高。@return 是否黑键。 */
export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}

/**
 * 每个八度的 12 个半音格均分为 7 个等宽白键，黑键仍对齐半音格。
 * 黑键跨过白键接缝但不强制居中，避免用半音间距决定白键宽度。
 * 白键音高行中心仍落在对应键面内；首尾裁剪到 MIDI 0–127 的内容范围。
 * @param pitchZoom 每个半音格的高度。
 * @return 按白键、黑键分层的完整键盘几何，仅 128 项。
 */
export function layoutPianoKeys(pitchZoom: number): PianoKeyGeometry[] {
  const white: PianoKeyGeometry[] = []
  const black: PianoKeyGeometry[] = []
  for (let pitch = 127; pitch >= 0; pitch -= 1) {
    const rowTop = (127 - pitch) * pitchZoom
    if (isBlackKey(pitch)) black.push({ pitch, black: true, top: rowTop, height: pitchZoom })
    else {
      const octaveStart = Math.floor(pitch / 12) * 12
      const whiteIndex = WHITE_PITCH_CLASSES.findIndex((value) => value === pitch % 12)
      // 从同一八度基准直接计算每条边，避免逐键累加带来的缩放误差。
      const top = Math.max(0, (128 - octaveStart - (whiteIndex + 1) * 12 / 7) * pitchZoom)
      const bottom = Math.min(128 * pitchZoom, (128 - octaveStart - whiteIndex * 12 / 7) * pitchZoom)
      white.push({ pitch, black: false, top, height: bottom - top })
    }
  }
  return [...white, ...black]
}
