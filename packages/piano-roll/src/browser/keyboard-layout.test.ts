import { expect, it } from 'vitest'
import { layoutPianoKeys } from './keyboard-layout'

it('白键连续铺满 MIDI 范围，黑键中心位于两白键接缝，E/F 和 B/C 直接相接', () => {
  for (const height of [8, 16.5, 36]) {
    const keys = layoutPianoKeys(height)
    expect(keys).toHaveLength(128)
    const whites = keys.filter((key) => !key.black)
    expect(whites[0]!.top).toBe(0)
    expect(whites.at(-1)!.top + whites.at(-1)!.height).toBe(128 * height)
    for (let i = 1; i < whites.length; i++) {
      expect(whites[i - 1]!.top + whites[i - 1]!.height).toBe(whites[i]!.top)
    }
    for (const key of keys.filter((item) => item.black)) {
      const lower = whites.find((item) => item.pitch === key.pitch - 1)!
      const higher = whites.find((item) => item.pitch === key.pitch + 1)!
      expect(key.top + key.height / 2).toBe(lower.top)
      expect(higher.top + higher.height).toBe(lower.top)
      expect(key.top + key.height / 2).toBe((127 - key.pitch + 0.5) * height)
    }
  }
})
