import { describe, expect, it } from 'vitest'
import { defaultPianoRollTheme, pianoRollThemeVariables, resolvePianoRollTheme } from './theme'

describe('piano roll theme', () => {
  it('uses the player pink palette by default', () => {
    expect(defaultPianoRollTheme.colors.primarySoft).toBe('#f7b7be')
    expect(defaultPianoRollTheme.colors.text).toBe('#4a3f3f')
    expect(defaultPianoRollTheme.colors.overviewNote).toBe('#9b3754')
  })

  it('deep merges partial tokens without mutating the default', () => {
    const theme = resolvePianoRollTheme({
      colors: { primary: '#111111' },
      metrics: { controlRadius: '10px' },
    })
    expect(theme.colors.primary).toBe('#111111')
    expect(theme.colors.text).toBe(defaultPianoRollTheme.colors.text)
    expect(theme.metrics.controlRadius).toBe('10px')
    expect(defaultPianoRollTheme.colors.primary).not.toBe('#111111')
  })

  it('ignores undefined and blank overrides from optional props', () => {
    const theme = resolvePianoRollTheme({
      colors: { primary: undefined, text: '   ' },
      metrics: { fontFamily: undefined },
    })
    expect(theme.colors.primary).toBe(defaultPianoRollTheme.colors.primary)
    expect(theme.colors.text).toBe(defaultPianoRollTheme.colors.text)
    expect(theme.metrics.fontFamily).toBe(defaultPianoRollTheme.metrics.fontFamily)
  })

  it('freezes the shared defaults and each resolved snapshot', () => {
    expect(Object.isFrozen(defaultPianoRollTheme)).toBe(true)
    expect(Object.isFrozen(defaultPianoRollTheme.colors)).toBe(true)
    expect(Object.isFrozen(resolvePianoRollTheme())).toBe(true)
  })

  it('exposes matching CSS variables for DOM consumers', () => {
    const theme = resolvePianoRollTheme({ colors: { primary: '#abcdef' } })
    const variables = pianoRollThemeVariables(theme)
    expect(variables['--pr-primary']).toBe('#abcdef')
    expect(variables['--pr-surface']).toBe(theme.colors.surface)
  })
})
