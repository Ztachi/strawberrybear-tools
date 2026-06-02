import { describe, expect, it, vi } from 'vitest'
import { Player, type AudioPlayerPort, type MediaItem } from './index'

function createAudioMock(): AudioPlayerPort {
  return {
    load: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    setMuted: vi.fn(async () => {}),
  }
}

const tracks: MediaItem[] = [
  { id: 'a', title: 'A', url: '/a.mid', durationSeconds: 10 },
  { id: 'b', title: 'B', url: '/b.mid', durationSeconds: 20 },
  { id: 'c', title: 'C', url: '/c.mid', durationSeconds: 30 },
]

describe('Player', () => {
  it('plays a queue item and moves to the next item', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio })
    player.setQueue(tracks)

    await player.play()
    await player.next()

    expect(player.getState().current?.id).toBe('b')
    expect(player.getState().status).toBe('playing')
    expect(audio.load).toHaveBeenCalledTimes(2)
  })

  it('wraps previous and next in repeat-all mode', async () => {
    const player = new Player({ audio: createAudioMock() })
    player.setQueue(tracks, 0)

    await player.previous()
    expect(player.getState().current?.id).toBe('c')

    await player.next()
    expect(player.getState().current?.id).toBe('a')
  })

  it('plays a direct queue index', async () => {
    const player = new Player({ audio: createAudioMock() })
    player.setQueue(tracks)

    await player.playIndex(2)

    expect(player.getState().current?.id).toBe('c')
    expect(player.getState().currentIndex).toBe(2)
  })

  it('supports pause, resume and stop state transitions', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio })
    player.setQueue(tracks)

    await player.play()
    await player.pause()
    await player.resume()
    await player.stop()

    expect(audio.pause).toHaveBeenCalledTimes(1)
    expect(audio.resume).toHaveBeenCalledTimes(1)
    expect(audio.stop).toHaveBeenCalledTimes(1)
    expect(player.getState()).toMatchObject({ status: 'stopped', positionSeconds: 0 })
  })

  it('clamps seek and volume values', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio })
    player.setQueue(tracks)
    await player.play()

    await player.seek(999)
    await player.setVolume(2)

    expect(player.getState().positionSeconds).toBe(10)
    expect(player.getState().volume).toBe(1)
    expect(audio.seek).toHaveBeenCalledWith(10)
  })

  it('applies muted state', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio })

    await player.setMuted(true)

    expect(player.getState().muted).toBe(true)
    expect(audio.setMuted).toHaveBeenCalledWith(true)
  })

  it('stops on ended by default', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio })
    player.setQueue(tracks)
    await player.play()

    await player.handleEnded()

    expect(player.getState().status).toBe('ended')
    expect(player.getState().positionSeconds).toBe(0)
  })

  it('advances on ended when configured', async () => {
    const player = new Player({ audio: createAudioMock(), endBehavior: 'advance' })
    player.setQueue(tracks)
    await player.play()

    await player.handleEnded()

    expect(player.getState().current?.id).toBe('b')
    expect(player.getState().status).toBe('playing')
  })

  it('does not let an older play request override a newer request', async () => {
    const audio = createAudioMock()
    const resolvers: Array<() => void> = []
    vi.mocked(audio.load).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve)
        })
    )
    const player = new Player({ audio })

    const first = player.play(tracks[0])
    const second = player.play(tracks[1])
    resolvers[1]?.()
    await second
    resolvers[0]?.()
    await first

    expect(player.getState().current?.id).toBe('b')
    expect(player.getState().status).toBe('playing')
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('enters error state and clears it', () => {
    const player = new Player({ audio: createAudioMock() })
    player.setQueue(tracks)

    player.handleError(new Error('failed'))
    expect(player.getState().status).toBe('error')
    expect(player.getState().error?.code).toBe('AUDIO_ERROR')

    player.clearError()
    expect(player.getState().status).toBe('stopped')
    expect(player.getState().error).toBeNull()
  })
})
