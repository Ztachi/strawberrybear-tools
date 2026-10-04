/**
 * @fileOverview MIDI 编辑器试听
 * @description 用 `@strawberrybear/midi-editor` 的 EditorTransport 驱动 soundfont 发声，
 * 与全局播放器互斥：开始试听即暂停全局试听，全局试听恢复时暂停编辑器；绝不触发游戏按键。
 */
import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import type { EditorTransportState, MidiProjectLoop } from '@strawberrybear/midi-editor'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type { PianoRollTransport } from '@strawberrybear/piano-roll/browser'
import { usePlayerStore } from '@/stores/player'
import { createMidiEditorPlaybackController } from '@/features/midi-editor/playbackController'

/**
 * @description: 编辑器试听控制
 * @param {Ref<PianoRollDocument | null>} document 当前文档；变化后自动重建事件表
 * @param {Ref<MidiProjectLoop | null | undefined>} loop 循环区间
 * @param {(frame: PianoRollTransport) => void} onFrame 播放中每帧回调，宿主直接推给视图控制器
 * @param {Ref<ReadonlySet<number> | null>} playablePitches 试听允许的原始音高；null 表示不过滤
 */
export function useMidiEditorPlayback(
  document: Ref<PianoRollDocument | null>,
  loop: Ref<MidiProjectLoop | null | undefined>,
  onFrame: (frame: PianoRollTransport) => void,
  playablePitches: Ref<ReadonlySet<number> | null>
) {
  const playerStore = usePlayerStore()
  /** 状态变化（播放/暂停/seek）时更新，供视图 prop 与工具栏使用；逐帧位置走 onFrame。 */
  const transport = shallowRef<PianoRollTransport>({
    positionSeconds: 0,
    isPlaying: false,
    playbackRate: 1,
  })
  const isPlaying = shallowRef(false)
  const positionSeconds = shallowRef(0)
  /** 只记录播放/暂停/定位等语义变化，供跨窗口同步；连续位置仍在交接时从音频时钟采样。 */
  const stateChanges = shallowRef<EditorTransportState>()
  let frameHandle: number | null = null
  let disposed = false

  function toFrame(state: EditorTransportState): PianoRollTransport {
    return {
      positionSeconds: state.positionSeconds,
      isPlaying: state.isPlaying,
      playbackRate: state.playbackRate,
      activePitches: controller.getActivePitches(),
    }
  }

  function stopFrames(): void {
    if (frameHandle !== null) cancelAnimationFrame(frameHandle)
    frameHandle = null
  }
  function frame(): void {
    frameHandle = null
    if (disposed) return
    const state = controller.getState()
    positionSeconds.value = state.positionSeconds
    const next = toFrame(state)
    // 只在发音集合变化时同步 Vue prop，让关闭再打开的详情也得到当前高亮。
    // 连续播放位置继续走控制器，不让整棵编辑界面逐帧重建。
    if ((transport.value.activePitches ?? []).join(',') !== next.activePitches!.join(',')) {
      transport.value = next
    }
    onFrame(next)
    if (state.isPlaying || next.activePitches!.length > 0)
      frameHandle = requestAnimationFrame(frame)
  }

  function handleChange(state: EditorTransportState): void {
    if (disposed) return
    transport.value = toFrame(state)
    isPlaying.value = state.isPlaying
    positionSeconds.value = state.positionSeconds
    stateChanges.value = state
    onFrame(transport.value)
    if ((state.isPlaying || transport.value.activePitches!.length > 0) && frameHandle === null)
      frameHandle = requestAnimationFrame(frame)
    if (!state.isPlaying && transport.value.activePitches!.length === 0) stopFrames()
  }

  const controller = createMidiEditorPlaybackController({
    getDocument: () => document.value,
    getLoop: () => loop.value,
    getPlayablePitches: () => playablePitches.value,
    onChange: handleChange,
    pauseExternal: () => playerStore.pausePreviewPlayback(),
  })

  /**
   * @description: 开始试听；先暂停全局播放器的试听
   * @param {number} [fromSeconds] 起点
   * @return {Promise<void>}
   */
  async function play(fromSeconds?: number): Promise<void> {
    if (!document.value) return
    await controller.play(fromSeconds)
  }
  function pause(): void {
    controller.pause()
  }
  function stop(): void {
    controller.stop()
  }
  function toggle(): Promise<void> | void {
    return isPlaying.value ? pause() : play()
  }
  /**
   * @description: 跳转；未创建引擎时只更新展示位置
   * @param {number} seconds 目标秒
   * @return {void}
   */
  function seek(seconds: number): void {
    if (!document.value) {
      positionSeconds.value = Math.max(0, seconds)
      transport.value = { ...transport.value, positionSeconds: positionSeconds.value }
      onFrame(transport.value)
      return
    }
    controller.seek(seconds)
  }

  /**
   * @description: 试听单个音高（点击琴键/改音高时）
   * @param {number} pitch 音高
   * @param {number} velocity 力度
   * @param {number} [durationSeconds] 音符真实时长；琴键试听省略时使用默认短音
   * @return {Promise<void>}
   */
  async function audition(
    pitch: number,
    velocity: number,
    durationSeconds?: number
  ): Promise<void> {
    await controller.audition(pitch, velocity, durationSeconds)
    // 暂停状态下的琴键/音符试听同样需要音频帧，最后一个声部结束后自动停止。
    handleChange(controller.getState())
  }

  watch(document, () => controller.invalidate())
  // 独立窗口的每次快照都会重建集合，比较音高内容才能避免无关界面更新打断尾音。
  watch(
    () =>
      playablePitches.value == null
        ? null
        : Array.from(playablePitches.value)
            .sort((left, right) => left - right)
            .join(','),
    () => controller.invalidate()
  )
  watch(loop, (next) => controller.setLoop(next), { deep: true })
  // 全局播放器开始试听时让位，避免两路声音叠加。
  watch(
    () => playerStore.isPreviewPlaying,
    (playing) => {
      if (playing) pause()
    }
  )

  function dispose(): void {
    // 异步初始化返回后不能重新给已卸载的主窗口/独立窗口启动发音帧。
    if (disposed) return
    disposed = true
    stopFrames()
    controller.dispose()
  }
  onBeforeUnmount(dispose)

  return {
    transport,
    isPlaying,
    positionSeconds,
    stateChanges,
    getSnapshot: controller.getSnapshot,
    suspend: controller.suspend,
    restore: controller.restore,
    play,
    pause,
    stop,
    toggle,
    seek,
    audition,
    dispose,
  }
}
