import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import type { PianoRollViewport } from '@strawberrybear/piano-roll/browser'
import {
  readPianoRollZoomPreferences,
  usePianoRollZoomPersistence,
  writePianoRollZoomPreferences,
} from './usePianoRollZoomPersistence'

function fakeStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

const viewport = (timeZoom: number, pitchZoom = 16): Readonly<PianoRollViewport> => ({
  scrollLeft: 0,
  scrollTop: 0,
  timeZoom,
  minTimeZoom: 1,
  maxTimeZoom: 1200,
  pitchZoom,
  follow: true,
})

describe('shared piano roll zoom persistence', () => {
  it('uses one global preference and ignores malformed values', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    writePianoRollZoomPreferences({
      overviewTimeZoom: 72,
      editorTimeZoom: 180,
      editorPitchZoom: 24,
    })
    expect(readPianoRollZoomPreferences()).toEqual({
      overviewTimeZoom: 72,
      editorTimeZoom: 180,
      editorPitchZoom: 24,
    })
    window.localStorage.setItem(
      'infinity-nikki-player:piano-roll-zoom:v2',
      JSON.stringify({ overviewTimeZoom: -1, editorPitchZoom: 'bad' })
    )
    expect(readPianoRollZoomPreferences()).toEqual({})
    vi.unstubAllGlobals()
  })

  it('restores each view and persists only user-facing viewport changes', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    writePianoRollZoomPreferences({
      overviewTimeZoom: 60,
      editorTimeZoom: 140,
      editorPitchZoom: 20,
    })
    const scope = effectScope()
    const zoom = scope.run(usePianoRollZoomPersistence)!
    expect(zoom.overviewTimeZoom.value).toBe(60)
    expect(zoom.editorTimeZoom.value).toBe(140)
    expect(zoom.editorPitchZoom.value).toBe(20)
    await nextTick()
    zoom.persistOverview(viewport(88))
    zoom.persistEditor(viewport(200, 28))
    expect(readPianoRollZoomPreferences()).toEqual({
      overviewTimeZoom: 88,
      editorTimeZoom: 200,
      editorPitchZoom: 28,
    })
    const reopened = scope.run(usePianoRollZoomPersistence)!
    expect(reopened.overviewTimeZoom.value).toBe(88)
    expect(reopened.editorTimeZoom.value).toBe(200)
    expect(reopened.editorPitchZoom.value).toBe(28)
    scope.stop()
    vi.unstubAllGlobals()
  })
})
