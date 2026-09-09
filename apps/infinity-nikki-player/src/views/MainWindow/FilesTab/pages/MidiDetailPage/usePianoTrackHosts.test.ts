import { describe, expect, it } from 'vitest'
import { usePianoTrackHosts } from './usePianoTrackHosts'

const track = { id: '0', name: 'Piano', enabled: true, isPercussion: false }

describe('piano track Vue hosts', () => {
  it('keeps the Teleport identity when a visible track changes state', () => {
    const hosts = usePianoTrackHosts()
    const container = {} as HTMLElement
    hosts.renderToggle(container, { track, checked: true, onChange: () => {} })
    const id = hosts.toggles.get(container)?.id
    hosts.renderToggle(container, { track, checked: false, onChange: () => {} })
    expect(hosts.toggles.get(container)?.id).toBe(id)
    expect(hosts.toggles.get(container)?.context.checked).toBe(false)
  })

  it('does not let an obsolete cleanup remove a newer visible control', () => {
    const hosts = usePianoTrackHosts()
    const container = {} as HTMLElement
    const oldCleanup = hosts.renderLabel(container, { track })
    const cleanup = hosts.renderLabel(container, { track: { ...track, name: 'Strings' } })
    oldCleanup()
    expect(hosts.labels.get(container)?.context.track.name).toBe('Strings')
    cleanup()
    cleanup()
    expect(hosts.labels.size).toBe(0)
  })

  it('removes only the virtual row host that has left the viewport', () => {
    const hosts = usePianoTrackHosts()
    const first = {} as HTMLElement
    const second = {} as HTMLElement
    const cleanup = hosts.renderLabel(first, { track })
    hosts.renderLabel(second, { track: { ...track, id: '1' } })
    cleanup()
    expect([...hosts.labels.keys()]).toEqual([second])
  })
})
