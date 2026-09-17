/** 钢琴键的内容几何。白键背部连续铺满，黑键覆盖在相邻白键的接缝上。 */
export interface PianoKeyGeometry {
  pitch: number
  black: boolean
  top: number
  height: number
}

/** MIDI 半音对应是否为黑键。@param pitch MIDI 音高。@return 是否黑键。 */
export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}

/**
 * 琴键右缘仍对应等高半音格；白键向相邻黑键中心延伸，黑键绘制在接缝上。
 * E/F、B/C 没有黑键，白键直接相接。首尾裁剪到 MIDI 0–127 的内容范围。
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
      const top = rowTop - (pitch < 127 && isBlackKey(pitch + 1) ? pitchZoom / 2 : 0)
      const bottom = rowTop + pitchZoom + (pitch > 0 && isBlackKey(pitch - 1) ? pitchZoom / 2 : 0)
      white.push({ pitch, black: false, top, height: bottom - top })
    }
  }
  return [...white, ...black]
}
