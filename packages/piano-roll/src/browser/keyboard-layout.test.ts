import { expect, it } from 'vitest'
import { keyboardPitchAt, layoutPianoKeys, pianoKeyLabel } from './keyboard-layout'

it('所有琴键与半音网格共用边界，分数缩放和 MIDI 首尾均不产生错位', () => {
  for (const zoom of [8, 16.5, 36]) {
    const keys = layoutPianoKeys(zoom)
    expect(keys).toHaveLength(128)
    for (const key of keys) {
      expect(key.top).toBe((127 - key.pitch) * zoom)
      expect(key.height).toBe(zoom)
    }
    expect(keys[0]!.top).toBe(0)
    expect(keys.at(-1)!.top + keys.at(-1)!.height).toBe(128 * zoom)
  }
})

it('音名随音高缩放逐级展示，先 C 音、再白键、再全部半音', () => {
  expect(pianoKeyLabel(60, 8)).toBe('C4')
  expect(pianoKeyLabel(62, 16)).toBeNull()
  expect(pianoKeyLabel(62, 20)).toBe('D4')
  expect(pianoKeyLabel(61, 20)).toBeNull()
  expect(pianoKeyLabel(61, 28)).toBe('C♯4')
  expect(pianoKeyLabel(0, 36)).toBe('C-1')
  expect(pianoKeyLabel(127, 36)).toBe('G9')
})

it('等高白键之间的连接区分别命中相邻白键，不改变主体半音行边界', () => {
  for (const zoom of [8, 16.5, 36]) {
    const keys = layoutPianoKeys(zoom)
    const c = keys.find((key) => key.pitch === 60)!
    const d = keys.find((key) => key.pitch === 62)!
    expect(c.height).toBe(d.height)
    expect(c.frontTop).toBe(c.top - zoom / 2)
    expect(c.frontBottom).toBe(c.top + zoom)
    expect(d.frontBottom).toBe(c.frontTop)
    expect(keys[0]!.frontTop).toBe(0)
    expect(keys.at(-1)!.frontBottom).toBe(128 * zoom)
    expect(c.top - d.top).toBe(2 * zoom)
    expect(keys[0]!.top).toBe(0)
    expect(keys.at(-1)!.top + zoom).toBe(128 * zoom)
    const blackTop = (127 - 61) * zoom
    expect(keyboardPitchAt(20, blackTop + zoom / 4, zoom)).toBe(61)
    expect(keyboardPitchAt(54, blackTop + zoom / 4, zoom)).toBe(62)
    expect(keyboardPitchAt(54, blackTop + (zoom * 3) / 4, zoom)).toBe(60)
    expect(keyboardPitchAt(54, -1, zoom)).toBeNull()
    expect(keyboardPitchAt(54, 128 * zoom, zoom)).toBeNull()
  }
})
