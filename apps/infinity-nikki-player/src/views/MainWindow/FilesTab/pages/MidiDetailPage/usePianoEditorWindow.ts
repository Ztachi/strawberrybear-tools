import { computed, inject, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { PianoRollTransport } from '@strawberrybear/piano-roll/browser'
import { PianoEditorSession } from '@/features/piano-editor'
import {
  EDITOR_WINDOW_PORT,
  type EditorWindowPort,
  type EditorPresentation,
  type PianoWorkspaceState,
} from '@/features/piano-editor'
import { createPianoEditorWindowPort } from '@/platform/tauri/pianoEditorWindow'

/**
 * 详情页的窗口生命周期：路由卸载释放原生窗口；页面仍是歌曲与 seek 的唯一 owner。
 * @param state 不包含逐帧时钟的展示数据。
 * @param transport 主播放器提供的原曲时间。
 * @param onSeek 提交一次当前歌曲定位。
 * @param onPreview 更新临时定位，不调用音频 seek。
 * @param onToggleTrack 仍由主页面执行既有轨道开关动作。
 * @returns 分离状态、视口与打开/还原动作。
 */
export function usePianoEditorWindow(
  state: Readonly<Ref<EditorPresentation>>,
  transport: Readonly<Ref<PianoRollTransport>>,
  onSeek: (seconds: number) => void,
  onPreview: (seconds: number | null) => void,
  onToggleTrack: (trackId: string) => void
) {
  const status = ref<'docked' | 'opening' | 'detached'>('docked')
  const error = ref('')
  const latestViewport = shallowRef<PianoWorkspaceState>()
  const restore = shallowRef<PianoWorkspaceState>()
  const session = new PianoEditorSession({
    port:
      inject<EditorWindowPort | undefined>(EDITOR_WINDOW_PORT, undefined) ??
      createPianoEditorWindowPort(),
    state: () => state.value,
    transport: () => transport.value,
    viewport: () => latestViewport.value,
    onStatus(next) {
      if (next === 'docked' && status.value === 'detached') restore.value = latestViewport.value
      status.value = next
    },
    onError(cause) {
      error.value = String(cause)
    },
    onCommand(command) {
      if (command.kind === 'toggle-track') onToggleTrack(command.trackId)
      if (command.kind === 'seek') onSeek(command.seconds)
      if (command.kind === 'preview') onPreview(command.seconds)
      if (command.kind === 'viewport') {
        latestViewport.value = command.viewport
      }
    },
  })
  watch(
    state,
    (next, previous) => {
      const songChanged = next.filename !== previous?.filename
      if (songChanged) {
        latestViewport.value = undefined
        restore.value = undefined
      }
      session.updateState(songChanged)
    },
    { flush: 'sync' }
  )
  watch(transport, () => session.updateTransport(), { flush: 'sync' })
  onBeforeUnmount(() => {
    void session.dock()
  })
  return {
    status,
    error,
    restore,
    latestViewport,
    detached: computed(() => status.value === 'detached'),
    open: async () => {
      error.value = ''
      onPreview(null)
      await session.open()
    },
    dock: () => session.dock(),
  }
}
