import { ref, watch, type Ref } from 'vue'
import type { PianoRollTrack } from '@strawberrybear/piano-roll/core'
import type { PianoRollTrackOpenContext } from '@strawberrybear/piano-roll/browser'

/** 页面私有浮层选择状态；只管理打开、切换与关闭，不参与音频或模拟按键。 */
export function usePianoEditorSelection(
  tracks: Readonly<Ref<readonly PianoRollTrack[]>>,
  onClose: () => void
) {
  const selectedTrackId = ref<string | null>(null)
  const isOpen = ref(false)
  const hasTrack = (id: string): boolean => tracks.value.some((track) => track.id === id)

  /** 单击只替换当前轨道，保留浮层实例及其缩放、滚动和高度。 */
  function select(trackId: string): void {
    if (hasTrack(trackId)) selectedTrackId.value = trackId
  }

  /** 关闭只清理临时交互；保留主界面选择状态。 */
  function close(): void {
    if (!isOpen.value) return
    onClose()
    isOpen.value = false
  }

  /** 双击当前轨道关闭；双击另一轨道切换并保持打开。 */
  function activate(trackId: string, context: PianoRollTrackOpenContext): void {
    if (!hasTrack(trackId)) return
    select(trackId)
    if (isOpen.value && context.selectedTrackIdAtGestureStart === trackId) close()
    else isOpen.value = true
  }

  watch(
    tracks,
    (next) => {
      if (!next.some((track) => track.id === selectedTrackId.value)) {
        selectedTrackId.value = next[0]?.id ?? null
      }
      if (next.length === 0) close()
    },
    { immediate: true }
  )

  return { selectedTrackId, isOpen, select, activate, close }
}
