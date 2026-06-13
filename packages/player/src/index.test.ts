/**
 * @fileOverview 播放器公共库单元测试
 * @description 覆盖队列、播放列表、播放模式、平台事件回灌和错误恢复等公共状态机契约。
 */
import { describe, expect, it, vi } from 'vitest'
import { Player, type AudioPlayerPort, type MediaItem } from './index'

/**
 * @description: 创建平台音频端口 mock
 * @return {AudioPlayerPort} 可断言调用次数和参数的测试端口
 */
function createAudioMock(): AudioPlayerPort {
  return {
    load: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    setMuted: vi.fn(async () => {}),
  }
}

/** 测试队列使用的固定媒体集合。 */
const tracks: MediaItem[] = [
  { id: 'a', title: 'A', url: '/a.mid', durationSeconds: 10 },
  { id: 'b', title: 'B', url: '/b.mid', durationSeconds: 20 },
  { id: 'c', title: 'C', url: '/c.mid', durationSeconds: 30 },
]

describe('Player', () => {
  it('plays a queue item and moves to the next item', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio, initialState: { repeatMode: 'all' } })
    player.setQueue(tracks)

    await player.play()
    await player.next()

    expect(player.getState().current?.id).toBe('b')
    expect(player.getState().status).toBe('playing')
    expect(audio.load).toHaveBeenCalledTimes(2)
  })

  it('loads playlists and preserves playlist metadata until the queue is edited', () => {
    const player = new Player({ audio: createAudioMock() })
    player.setPlaylist({ id: 'playlist-1', title: 'Playlist 1', items: tracks }, 2)

    expect(player.getState().playlist?.id).toBe('playlist-1')
    expect(player.getState().current?.id).toBe('c')

    player.insertNext([{ id: 'd', title: 'D', url: '/d.mid' }])
    expect(player.getState().playlist).toBeNull()
  })

  it('supports queue append, insert, remove and clear operations', () => {
    const player = new Player({ audio: createAudioMock() })
    player.addToQueue([tracks[0]])
    player.addToQueue([tracks[1]])
    player.insertNext([tracks[2]])

    expect(player.getState().queue.map((item) => item.id)).toEqual(['a', 'c', 'b'])

    player.removeFromQueue('a')
    expect(player.getState().current?.id).toBe('c')

    player.clearQueue()
    expect(player.getState()).toMatchObject({ current: null, currentIndex: -1, status: 'stopped' })
  })

  it('wraps previous and next in repeat-all mode', async () => {
    const player = new Player({ audio: createAudioMock(), initialState: { repeatMode: 'all' } })
    player.setQueue(tracks, 0)

    await player.previous()
    expect(player.getState().current?.id).toBe('c')

    await player.next()
    expect(player.getState().current?.id).toBe('a')
  })

  it('stops at queue boundaries when repeat mode is none', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio })
    player.setQueue(tracks, 0)

    await player.previous()
    expect(player.getState().current?.id).toBe('a')
    expect(audio.load).not.toHaveBeenCalled()
  })

  it('uses repeat-one only for natural endings and keeps manual next available', async () => {
    const player = new Player({ audio: createAudioMock(), initialState: { repeatMode: 'one' } })
    player.setQueue(tracks, 1)

    await player.next()
    expect(player.getState().current?.id).toBe('c')

    player.setPlaybackMode('repeat-one')
    await player.handleEnded()
    expect(player.getState().current?.id).toBe('c')
    expect(player.getState().status).toBe('playing')
  })

  it('uses shuffle for next and real history for previous', async () => {
    const player = new Player({
      audio: createAudioMock(),
      initialState: { shuffleMode: 'on' },
      random: () => 0,
    })
    player.setQueue(tracks, 0)

    await player.play()
    await player.next()
    expect(player.getState().current?.id).toBe('b')

    await player.previous()
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
    expect(audio.play).toHaveBeenCalledTimes(2)
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

  it('applies muted state and keeps volume available for unmute', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio })

    await player.setVolume(0.4)
    await player.setMuted(true)

    expect(player.getState()).toMatchObject({ volume: 0.4, muted: true })
    expect(audio.setMuted).toHaveBeenCalledWith(true)
  })

  it('advances on ended by default', async () => {
    const player = new Player({ audio: createAudioMock() })
    player.setQueue(tracks)
    await player.play()

    await player.handleEnded()

    expect(player.getState().current?.id).toBe('b')
    expect(player.getState().status).toBe('playing')
  })

  it('stops at the end of a sequential queue', async () => {
    const player = new Player({ audio: createAudioMock() })
    player.setQueue(tracks, 2)
    await player.play()

    await player.handleEnded()

    expect(player.getState()).toMatchObject({
      currentIndex: 2,
      status: 'stopped',
      positionSeconds: 0,
    })
  })

  it('uses playback mode as the public mode contract', () => {
    const player = new Player({ audio: createAudioMock() })

    player.setPlaybackMode('shuffle')
    expect(player.getState()).toMatchObject({
      playbackMode: 'shuffle',
      repeatMode: 'all',
      shuffleMode: 'on',
      endBehavior: 'advance',
    })

    player.setPlaybackMode('sequential')
    expect(player.getState()).toMatchObject({
      playbackMode: 'sequential',
      repeatMode: 'none',
      shuffleMode: 'off',
    })
  })

  it('selects next without invoking the audio port', () => {
    const audio = createAudioMock()
    const player = new Player({ audio })
    player.setQueue(tracks, 0)

    const selected = player.selectNext()

    expect(selected?.id).toBe('b')
    expect(player.getState()).toMatchObject({ currentIndex: 1, status: 'stopped' })
    expect(audio.load).not.toHaveBeenCalled()
    expect(audio.play).not.toHaveBeenCalled()
  })

  it('stops on ended when configured', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio, initialState: { endBehavior: 'stop' } })
    player.setQueue(tracks)
    await player.play()

    await player.handleEnded()

    expect(audio.stop).toHaveBeenCalledTimes(1)
    expect(player.getState()).toMatchObject({ status: 'stopped', positionSeconds: 0 })
  })

  it('pauses on ended when configured', async () => {
    const audio = createAudioMock()
    const player = new Player({ audio, initialState: { endBehavior: 'pause' } })
    player.setQueue([tracks[0]])
    await player.play()

    await player.handleEnded()

    expect(audio.seek).toHaveBeenCalledWith(0)
    expect(player.getState()).toMatchObject({ status: 'paused', positionSeconds: 0 })
  })

  it('handles platform playback callbacks', () => {
    const player = new Player({ audio: createAudioMock() })
    player.setQueue(tracks)

    player.prepare(tracks[0])
    player.handlePlaying()
    player.updateProgress(4, 10)
    player.handleWaiting()
    player.handlePaused()
    player.handleStopped()

    expect(player.getState()).toMatchObject({
      status: 'stopped',
      positionSeconds: 0,
      durationSeconds: 10,
    })
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
    expect(player.getState().status).toBe('paused')
    expect(player.getState().error).toBeNull()
  })

  it('tracks liked media ids without touching queue state', () => {
    const player = new Player({ audio: createAudioMock() })
    player.setQueue(tracks)

    player.setLiked('a', true)
    player.setLiked('a', true)
    player.setLiked('b', true)
    player.setLiked('a', false)

    expect(player.getState().likedIds).toEqual(['b'])
    expect(player.getState().queue).toHaveLength(3)
  })
})
