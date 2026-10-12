import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useUiPreferences, preferenceValues } from './useUiPreferences'
import { usePianoWorkspacePreferences } from './usePianoWorkspacePreferences'
import { useRecordingPreferences } from '@/features/midi-recording/preferences'
import { useMidiEditorPreferences } from '@/features/midi-editor/preferences'

function storage() {
  const values = new Map<string, string>()
  const backend = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  vi.stubGlobal('window', { localStorage: backend })
  return { values, backend }
}
afterEach(() => vi.unstubAllGlobals())

describe('shared UI preferences', () => {
  it('saves consecutive updates in one frame and syncs external changes without writing them back', async () => {
    class MemoryStorage {
      values = new Map<string, string>()
      getItem(key: string) {
        return this.values.get(key) ?? null
      }
      setItem(key: string, value: string) {
        this.values.set(key, value)
      }
      removeItem(key: string) {
        this.values.delete(key)
      }
    }
    class MemoryStorageEvent extends Event {
      key: string | null
      newValue: string | null
      storageArea: MemoryStorage
      constructor(
        type: string,
        init: { key?: string | null; newValue: string | null; storageArea: MemoryStorage }
      ) {
        super(type)
        this.key = init.key ?? null
        this.newValue = init.newValue
        this.storageArea = init.storageArea
      }
    }
    const backend = new MemoryStorage()
    const browser = Object.assign(new EventTarget(), { localStorage: backend })
    vi.stubGlobal('window', browser)
    vi.stubGlobal('Storage', MemoryStorage)
    vi.stubGlobal('StorageEvent', MemoryStorageEvent)
    const scope = effectScope()
    const normalize = (value: unknown) => {
      const saved = preferenceValues(value)
      return { first: Number(saved.first) || 0, second: Number(saved.second) || 0 }
    }
    const prefs = scope.run(() => useUiPreferences('prefs', normalize))!
    const sibling = scope.run(() => useUiPreferences('prefs', normalize))!
    await nextTick()
    prefs.value = { first: 1, second: 0 }
    prefs.value = { first: 1, second: 2 }
    await nextTick()
    expect(JSON.parse(backend.getItem('prefs')!)).toEqual({ first: 1, second: 2 })
    expect(sibling.value).toEqual({ first: 1, second: 2 })
    const writes = vi.spyOn(backend, 'setItem')
    backend.values.set('prefs', JSON.stringify({ first: 3, second: 4 }))
    browser.dispatchEvent(
      new MemoryStorageEvent('storage', {
        key: 'prefs',
        newValue: backend.getItem('prefs'),
        storageArea: backend,
      })
    )
    expect(prefs.value).toEqual({ first: 3, second: 4 })
    expect(sibling.value).toEqual({ first: 3, second: 4 })
    expect(writes).not.toHaveBeenCalled()
    backend.values.clear()
    browser.dispatchEvent(
      new MemoryStorageEvent('storage', { newValue: null, storageArea: backend })
    )
    expect(prefs.value).toEqual({ first: 0, second: 0 })
    expect(writes).not.toHaveBeenCalled()
    scope.stop()
  })
  it('does not write defaults and saves declared settings under fixed keys', () => {
    const { values } = storage()
    const scope = effectScope()
    const normalize = (value: unknown) => ({ enabled: preferenceValues(value).enabled === true })
    const prefs = scope.run(() => useUiPreferences('a', normalize))!
    expect(values.size).toBe(0)
    prefs.value = { enabled: true }
    expect(JSON.parse(values.get('a')!)).toEqual({ enabled: true })
    const otherSetting = scope.run(() => useUiPreferences('b', normalize))!
    expect(otherSetting.value.enabled).toBe(false)
    expect(values.has('b')).toBe(false)
    otherSetting.value = { enabled: false }
    expect(JSON.parse(values.get('a')!)).toEqual({ enabled: true })
    scope.stop()
  })
  it('whitelists remembered fields and rejects corrupt or out-of-range values', () => {
    const { values } = storage()
    values.set(
      'infinity-nikki-player:recording-preferences:v1',
      JSON.stringify({
        snap: 'bogus',
        mode: 'replace',
        countIn: true,
        metronome: 'true',
        accompaniment: false,
        keyboardHeight: -1,
        cursorTick: 999,
        template: {},
      })
    )
    const scope = effectScope()
    const prefs = scope.run(useRecordingPreferences)!
    expect(prefs.value).toEqual({
      snap: '1/16',
      mode: 'replace',
      countIn: true,
      metronome: false,
      accompaniment: false,
      keyboardHeight: 180,
    })
    values.set('infinity-nikki-player:midi-editor-preferences:v1', '{broken')
    const midi = scope.run(useMidiEditorPreferences)!
    expect(midi.preferences.value).toEqual({
      snap: '1/16',
      tool: 'select',
      showVelocity: false,
      dimUnplayable: false,
    })
    midi.showVelocity.value = true
    expect(
      JSON.parse(values.get('infinity-nikki-player:midi-editor-preferences:v1')!).showVelocity
    ).toBe(true)
    scope.stop()
  })
  it('keeps the current UI usable when storage is unavailable or full', () => {
    const { backend } = storage()
    backend.setItem = () => {
      throw new Error('quota')
    }
    const scope = effectScope()
    const prefs = scope.run(useRecordingPreferences)!
    prefs.value = { ...prefs.value, metronome: true }
    expect(prefs.value.metronome).toBe(true)
    scope.stop()
  })
  it('reuses layout across new content and preview or editing entries', () => {
    const { values } = storage()
    const scope = effectScope()
    const first = scope.run(() => usePianoWorkspacePreferences(true))!
    first.value = { hideEmptyTracks: true, editorHeight: 60, showOtherTracks: false }
    const nextEditor = scope.run(() => usePianoWorkspacePreferences(true))!
    const preview = scope.run(() => usePianoWorkspacePreferences(false))!
    expect(nextEditor.value).toEqual(first.value)
    expect(preview.value).toEqual(first.value)
    expect([...values.keys()]).toEqual(['infinity-nikki-player:piano-workspace:v1'])
    scope.stop()
  })
})
