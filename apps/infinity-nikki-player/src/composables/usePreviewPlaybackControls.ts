import { computed, ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import {
  dispatchPreviewControl,
  type PreviewControlCommand,
  type PreviewControlState,
} from '@/features/player/previewControls'

/** 主窗口的预览控制绑定；独立窗口只接收快照，不能创建另一个 store 或播放实例。 */
export function usePreviewPlaybackControls() {
  const player = usePlayerStore()
  const error = ref('')
  const state = computed<PreviewControlState>(() => ({
    mediaId: player.currentMidi?.filename ?? null,
    isPlaying: player.isPreviewPlaying && !player.isPreviewPaused,
    isPaused: player.isPreviewPaused,
    mode: player.previewPlaybackMode,
    error: error.value,
  }))
  async function execute(command: PreviewControlCommand): Promise<void> {
    error.value = ''
    try {
      await dispatchPreviewControl(player, command)
    } catch (cause) {
      error.value = String(cause)
    }
  }
  return { state, execute }
}
