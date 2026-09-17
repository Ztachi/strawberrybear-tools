import { expect, it, vi } from 'vitest'
import {
  dispatchPreviewControl,
  isPreviewControlCommand,
  type PreviewControlPort,
} from './previewControls'

it('rejects non-string actions without coercing malformed IPC objects', () => {
  expect(isPreviewControlCommand({ action: { toString: () => 'stop' } })).toBe(false)
  expect(isPreviewControlCommand({ action: 'mode', mode: 'invalid' })).toBe(false)
  expect(isPreviewControlCommand(null)).toBe(false)
})

function fixture(): PreviewControlPort {
  return {
    isPreviewPlaying: false,
    isPreviewPaused: false,
    currentTemporaryOnlineSongId: null,
    startPreview: vi.fn(),
    pausePreviewPlayback: vi.fn(),
    resumePreviewPlayback: vi.fn(),
    stopPreviewPlayback: vi.fn(),
    restoreTemporaryOnlinePreview: vi.fn(),
    setPreviewTime: vi.fn(),
    playPrev: vi.fn(),
    playNext: vi.fn(),
    setPlaylistPlaybackMode: vi.fn(),
  }
}
it('shared play control resumes a paused session and pauses a playing session', async () => {
  const port = fixture()
  await dispatchPreviewControl(port, { action: 'toggle-play' })
  expect(port.startPreview).toHaveBeenCalledOnce()
  port.isPreviewPaused = true
  await dispatchPreviewControl(port, { action: 'toggle-play' })
  expect(port.resumePreviewPlayback).toHaveBeenCalledOnce()
  expect(port.startPreview).toHaveBeenCalledOnce()
  port.isPreviewPlaying = true
  port.isPreviewPaused = false
  await dispatchPreviewControl(port, { action: 'toggle-play' })
  expect(port.pausePreviewPlayback).toHaveBeenCalledOnce()
})
it('shared stop preserves temporary-preview restoration instead of stopping its original queue', async () => {
  const port = fixture()
  port.currentTemporaryOnlineSongId = 'online'
  await dispatchPreviewControl(port, { action: 'stop' })
  expect(port.restoreTemporaryOnlinePreview).toHaveBeenCalledOnce()
  expect(port.stopPreviewPlayback).not.toHaveBeenCalled()
  port.currentTemporaryOnlineSongId = null
  await dispatchPreviewControl(port, { action: 'stop' })
  expect(port.stopPreviewPlayback).toHaveBeenCalledOnce()
  expect(port.setPreviewTime).toHaveBeenCalledWith(0)
})
it('queue navigation and mode changes use the existing preview actions', async () => {
  const port = fixture()
  await dispatchPreviewControl(port, { action: 'previous' })
  await dispatchPreviewControl(port, { action: 'next' })
  await dispatchPreviewControl(port, { action: 'mode', mode: 'repeat-one' })
  expect(port.playPrev).toHaveBeenCalledOnce()
  expect(port.playNext).toHaveBeenCalledOnce()
  expect(port.setPlaylistPlaybackMode).toHaveBeenCalledWith('repeat-one')
})
