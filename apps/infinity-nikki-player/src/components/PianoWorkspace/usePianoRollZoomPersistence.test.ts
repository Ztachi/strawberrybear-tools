import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
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

describe('piano roll zoom persistence', () => {
  it('isolates preferences by filename and ignores malformed values', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    writePianoRollZoomPreferences('song/a.mid', {
      overviewTimeZoom: 72,
      editorTimeZoom: 180,
      editorPitchZoom: 24,
    })
    expect(readPianoRollZoomPreferences('song/a.mid')).toEqual({
      overviewTimeZoom: 72,
      editorTimeZoom: 180,
      editorPitchZoom: 24,
    })
    expect(readPianoRollZoomPreferences('song/b.mid')).toEqual({})
    window.localStorage.setItem(
      'infinity-nikki-player:piano-roll-zoom:v1:broken',
      JSON.stringify({ overviewTimeZoom: -1, editorPitchZoom: 'bad' })
    )
    expect(readPianoRollZoomPreferences('broken')).toEqual({})
    vi.unstubAllGlobals()
  })

  it('restores each view and persists only user-facing viewport changes', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    writePianoRollZoomPreferences('song.mid', {
      overviewTimeZoom: 60,
      editorTimeZoom: 140,
      editorPitchZoom: 20,
    })
    const filename = shallowRef('song.mid')
    const scope = effectScope()
    const zoom = scope.run(() => usePianoRollZoomPersistence(filename))!
    expect(zoom.overviewTimeZoom.value).toBe(60)
    expect(zoom.editorTimeZoom.value).toBe(140)
    expect(zoom.editorPitchZoom.value).toBe(20)
    await nextTick()
    zoom.persistOverview(viewport(88))
    zoom.persistEditor(viewport(200, 28))
    expect(readPianoRollZoomPreferences('song.mid')).toEqual({
      overviewTimeZoom: 88,
      editorTimeZoom: 200,
      editorPitchZoom: 28,
    })
    filename.value = 'other.mid'
    await nextTick()
    expect(zoom.overviewTimeZoom.value).toBeUndefined()
    expect(zoom.editorTimeZoom.value).toBeUndefined()
    expect(zoom.editorPitchZoom.value).toBeUndefined()
    scope.stop()
    vi.unstubAllGlobals()
  })
})
