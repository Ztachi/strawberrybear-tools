import { expect, it } from 'vitest'
import { layoutPianoKeys } from './keyboard-layout'

it('每个完整八度的七个白键等宽，连续覆盖 MIDI 范围', () => {
  for (const zoom of [8, 16.5, 36]) {
    const keys = layoutPianoKeys(zoom)
    expect(keys).toHaveLength(128)
    const whites = keys.filter((key) => !key.black)
    expect(whites[0]!.top).toBe(0)
    expect(whites.at(-1)!.top + whites.at(-1)!.height).toBeCloseTo(128 * zoom)
    for (let i = 1; i < whites.length; i++) {
      expect(whites[i - 1]!.top + whites[i - 1]!.height).toBeCloseTo(whites[i]!.top)
    }
    for (const key of whites) {
      // 最高的 G9 在 MIDI 127 边界裁剪，其余白键保持统一尺寸。
      if (key.pitch !== 127) expect(key.height).toBeCloseTo(12 * zoom / 7)
      const rowCenter = (127 - key.pitch + 0.5) * zoom
      expect(rowCenter).toBeGreaterThan(key.top)
      expect(rowCenter).toBeLessThan(key.top + key.height)
    }
  }
})

it('黑键保持半音网格对齐，并覆盖相邻白键接缝', () => {
  for (const zoom of [8, 16.5, 36]) {
    const keys = layoutPianoKeys(zoom)
    for (const key of keys.filter((item) => item.black)) {
      expect(key.top).toBe((127 - key.pitch) * zoom)
      expect(key.height).toBe(zoom)
      const lower = keys.find((item) => item.pitch === key.pitch - 1)!
      const higher = keys.find((item) => item.pitch === key.pitch + 1)!
      expect(higher.top + higher.height).toBeCloseTo(lower.top)
      expect(lower.top).toBeGreaterThan(key.top)
      expect(lower.top).toBeLessThan(key.top + key.height)
    }
  }
})
