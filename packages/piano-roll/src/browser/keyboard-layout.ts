/** 钢琴卷帘琴键的半音行几何，与右侧网格使用同一内容坐标。 */
export interface PianoKeyGeometry {
  pitch: number
  black: boolean
  top: number
  height: number
  /** 前端凸出部分的边界；不改变主体半音行高。 */
  frontTop: number
  frontBottom: number
}

/** MIDI 半音对应是否为黑键。@param pitch MIDI 音高。@return 是否黑键。 */
export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}

/**
 * @description 半音行的唯一几何来源，避免琴键和网格分别累计坐标。
 * @param pitch MIDI 音高。
 * @param pitchZoom 每个半音行的高度。
 * @return 该行的内容坐标及高度。
 */
export function pitchRowGeometry(
  pitch: number,
  pitchZoom: number
): { top: number; height: number } {
  return { top: (127 - pitch) * pitchZoom, height: pitchZoom }
}

/**
 * @description 按高音到低音排列琴键；主体与半音行等高，白键前端延伸到相邻黑键尾部的中线，形成一体键面。
 * @param pitchZoom 每个半音行的高度。
 * @return MIDI 0–127 的完整琴键几何。
 */
export function layoutPianoKeys(pitchZoom: number): PianoKeyGeometry[] {
  return Array.from({ length: 128 }, (_, row) => {
    const pitch = 127 - row
    const black = isBlackKey(pitch)
    const { top, height } = pitchRowGeometry(pitch, pitchZoom)
    return {
      pitch,
      black,
      top,
      height,
      frontTop: top - (!black && pitch < 127 && isBlackKey(pitch + 1) ? height / 2 : 0),
      frontBottom: top + height + (!black && pitch > 0 && isBlackKey(pitch - 1) ? height / 2 : 0),
    }
  })
}

/**
 * @description 音高放大时逐级增加音名，避免缩小时文字挤占琴键。
 * @param pitch MIDI 音高。
 * @param pitchZoom 每个半音行的高度。
 * @return 带八度的音名；当前密度不展示时返回 null。
 */
export function pianoKeyLabel(pitch: number, pitchZoom: number): string | null {
  if (pitch % 12 !== 0 && (pitchZoom < 18 || (isBlackKey(pitch) && pitchZoom < 26))) return null
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`
}

/**
 * @description 依据真实键面命中音高；黑键尾部属于相邻白键，绘制和点击使用相同交界。
 * @param x 琴键区域横坐标（宽 64px，黑键长 42px）。
 * @param y 已加纵向滚动偏移的内容坐标。
 * @param pitchZoom 每半音行高。
 * @return 命中的 MIDI 音高，越出琴键时返回 null。
 */
export function keyboardPitchAt(x: number, y: number, pitchZoom: number): number | null {
  if (x < 0 || x >= 64 || y < 0 || y >= 128 * pitchZoom) return null
  const row = Math.floor(y / pitchZoom)
  const pitch = 127 - row
  if (x < 42 || !isBlackKey(pitch)) return pitch
  return y - row * pitchZoom < pitchZoom / 2 ? pitch + 1 : pitch - 1
}
