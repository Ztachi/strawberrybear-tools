import { isPlaybackMode, type PlaybackMode } from '@strawberrybear/player'

/** 可跨窗口传递的预览控制状态；不包含音频、队列实例或按键模拟器。 */
export interface PreviewControlState {
  mediaId: string | null
  isPlaying: boolean
  isPaused: boolean
  mode: PlaybackMode
  error: string
}

/** 所有入口共用相同的预览动作语义。 */
export type PreviewControlCommand =
  | { action: 'previous' | 'next' | 'toggle-play' | 'stop' }
  | { action: 'mode'; mode: PlaybackMode }

/** 仅使用既有预览 actions，不能触达游戏演奏入口。 */
export interface PreviewControlPort {
  isPreviewPlaying: boolean
  isPreviewPaused: boolean
  currentTemporaryOnlineSongId: string | null
  startPreview(): unknown
  pausePreviewPlayback(): unknown
  resumePreviewPlayback(): unknown
  stopPreviewPlayback(): unknown
  restoreTemporaryOnlinePreview(): unknown
  setPreviewTime(time: number): unknown
  playPrev(): unknown
  playNext(): unknown
  setPlaylistPlaybackMode(mode: PlaybackMode): unknown
}

/** 校验来自独立窗口的动作，拒绝未知动作或播放模式。 */
export function isPreviewControlCommand(value: unknown): value is PreviewControlCommand {
  if (!value || typeof value !== 'object' || !('action' in value)) return false
  if (value.action === 'mode') return 'mode' in value && isPlaybackMode(value.mode)
  return (
    typeof value.action === 'string' &&
    ['previous', 'next', 'toggle-play', 'stop'].includes(value.action)
  )
}

/** 执行全局播放器既有动作；暂停恢复与临时在线试听的停止语义在所有入口保持一致。 */
export async function dispatchPreviewControl(
  port: PreviewControlPort,
  command: PreviewControlCommand
): Promise<void> {
  switch (command.action) {
    case 'previous':
      await port.playPrev()
      break
    case 'next':
      await port.playNext()
      break
    case 'mode':
      await port.setPlaylistPlaybackMode(command.mode)
      break
    case 'toggle-play':
      if (port.isPreviewPlaying && !port.isPreviewPaused) await port.pausePreviewPlayback()
      else if (port.isPreviewPaused) await port.resumePreviewPlayback()
      else await port.startPreview()
      break
    case 'stop':
      if (port.currentTemporaryOnlineSongId) await port.restoreTemporaryOnlinePreview()
      else {
        const stopping = port.stopPreviewPlayback()
        port.setPreviewTime(0)
        await stopping
      }
      break
  }
}
