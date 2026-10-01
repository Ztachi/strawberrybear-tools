import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import { usePianoEditorSelection } from './usePianoEditorSelection'

const track = (id: string): PianoRollTrack => ({ id, name: id, enabled: true, isPercussion: false })

describe('piano editor selection', () => {
  it('opens on double click and closes on the same track without losing selection', () => {
    const scope = effectScope()
    const onClose = vi.fn()
    const view = scope.run(() =>
      usePianoEditorSelection(shallowRef([track('a'), track('b')]), onClose)
    )!
    view.select('a')
    expect(view.isOpen.value).toBe(false)
    view.activate('a', { selectedTrackIdAtGestureStart: 'a' })
    expect(view.isOpen.value).toBe(true)
    view.activate('a', { selectedTrackIdAtGestureStart: 'a' })
    expect(view.isOpen.value).toBe(false)
    expect(view.selectedTrackId.value).toBe('a')
    expect(onClose).toHaveBeenCalledOnce()
    view.close()
    expect(onClose).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('keeps a different-track double click open despite its preceding click selections', () => {
    const scope = effectScope()
    const onClose = vi.fn()
    const view = scope.run(() =>
      usePianoEditorSelection(shallowRef([track('a'), track('b')]), onClose)
    )!
    view.activate('a', { selectedTrackIdAtGestureStart: 'a' })
    // 浏览器顺序是 click(detail=1)、click(detail=2)、dblclick。
    view.select('b')
    view.select('b')
    view.activate('b', { selectedTrackIdAtGestureStart: 'a' })
    expect(view.selectedTrackId.value).toBe('b')
    expect(view.isOpen.value).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    view.select('a')
    expect(view.isOpen.value).toBe(true)
    view.activate('a', { selectedTrackIdAtGestureStart: 'a' })
    expect(view.isOpen.value).toBe(false)
    scope.stop()
  })

  it('ignores stale track events and closes cleanly if no tracks remain', async () => {
    const scope = effectScope()
    const tracks = shallowRef([track('a'), track('b')])
    const onClose = vi.fn()
    const view = scope.run(() => usePianoEditorSelection(tracks, onClose))!
    view.activate('a', { selectedTrackIdAtGestureStart: 'a' })
    view.select('missing')
    view.activate('missing', { selectedTrackIdAtGestureStart: 'a' })
    expect(view.selectedTrackId.value).toBe('a')
    tracks.value = [track('b')]
    await nextTick()
    expect(view.selectedTrackId.value).toBe('b')
    expect(view.isOpen.value).toBe(true)
    tracks.value = []
    await nextTick()
    expect(view.selectedTrackId.value).toBeNull()
    expect(view.isOpen.value).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
    scope.stop()
  })
})
