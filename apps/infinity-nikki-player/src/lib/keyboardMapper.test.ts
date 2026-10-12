import { describe, expect, it } from 'vitest'
import { KeyboardMapper } from './keyboardMapper'

describe('模板精确音高', () => {
  it('无移调时保留黑键和键盘默认音域外音高', () => {
    const mapper = new KeyboardMapper()
    mapper.setTemplate({
      id: 't',
      name: 'T',
      is_builtin: false,
      mappings: [
        { pitch: 60, key: 'A' },
        { pitch: 61, key: 'S' },
        { pitch: 62, key: 'F' },
        { pitch: 96, key: 'G' },
        { pitch: 108, key: 'D' },
      ],
    })
    expect(mapper.mapPitch(61)?.pitch).toBe(61)
    expect(mapper.mapPitch(108)?.pitch).toBe(108)
    expect(mapper.mapPitch(59)?.pitch).toBe(60)
  })
})
