import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import type { MidiInfo } from '@/types'

interface DetailQueue {
  items: MidiInfo[]
  context: ReturnType<typeof usePlayerStore>['previewQueueContext']
}

interface PianoDetailSeek {
  matchesPlayback: ComputedRef<boolean>
  previewSeconds: Ref<number | null>
  error: Ref<string>
  preview: (seconds: number | null) => void
  seek: (seconds: number) => Promise<void>
  getQueue: (midi: MidiInfo) => DetailQueue
}

/**
 * @description: 将详情页的秒单位定位绑定到正确预览歌曲，隔离拖拽预览与异步提交。
 * @param {Readonly<Ref<MidiInfo | null>>} detailMidi 当前详情 MIDI
 * @param {Readonly<Ref<string>>} filename 路由歌曲标识，用于使离开页面的请求失效
 * @return {PianoDetailSeek} 播放身份、局部预览状态和安全定位动作
 */
export function usePianoDetailSeek(
  detailMidi: Readonly<Ref<MidiInfo | null>>,
  filename: Readonly<Ref<string>>
): PianoDetailSeek {
  const playerStore = usePlayerStore()
  const { t } = useI18n()
  const previewSeconds = ref<number | null>(null)
  const error = ref('')
  let committing = false
  let active = true
  let requestId = 0
  let selectionTask: Promise<void> | null = null

  const matchesPlayback = computed(
    () =>
      Boolean(detailMidi.value) &&
      playerStore.currentMidi?.filename === detailMidi.value?.filename &&
      playerStore.previewState.current?.id === detailMidi.value?.filename
  )

  function preview(seconds: number | null): void {
    // 公共库在松手后发送 null；异步 commit 完成前保留最终预览，避免回闪到旧位置。
    if (seconds !== null || !committing) previewSeconds.value = seconds
  }

  function getQueue(midi: MidiInfo): DetailQueue {
    const activeQueue = playerStore.activePreviewQueueItems
    const inActiveQueue = activeQueue.some((item) => item.filename === midi.filename)
    return {
      items: inActiveQueue ? activeQueue : playerStore.midiLibrary,
      context: inActiveQueue
        ? playerStore.previewQueueContext
        : { id: 'all', title: t('songList.allSongs') },
    }
  }

  async function bindTarget(midi: MidiInfo, isCurrent: () => boolean): Promise<void> {
    // 后续 seek 必须等待同次歌曲绑定，不能越过 selectMidi 的异步分析定位旧媒体。
    while (selectionTask) await selectionTask
    if (!isCurrent() || playerStore.currentMidi?.filename === midi.filename) return
    const sourceFilename = playerStore.currentMidi?.filename
    const task = (async (): Promise<void> => {
      await playerStore.stopPreviewPlayback()
      // 同曲的新 seek 可共享这次绑定；切详情或其它来源切歌则放弃旧目标。
      if (
        !active ||
        filename.value !== midi.filename ||
        detailMidi.value?.filename !== midi.filename ||
        playerStore.currentMidi?.filename !== sourceFilename
      )
        return
      const queue = getQueue(midi)
      await playerStore.selectMidiInQueue(midi, queue.items, queue.context)
    })()
    selectionTask = task
    try {
      await task
    } finally {
      if (selectionTask === task) selectionTask = null
    }
  }

  async function seek(seconds: number): Promise<void> {
    const midi = detailMidi.value
    if (!midi || midi.filename !== filename.value || !Number.isFinite(seconds)) return
    const request = ++requestId
    const isCurrent = (): boolean =>
      active &&
      request === requestId &&
      filename.value === midi.filename &&
      detailMidi.value?.filename === midi.filename
    error.value = ''
    previewSeconds.value = seconds
    committing = true
    try {
      // 跨曲只选择并定位，保持新曲静止；同曲则保留既有播放/暂停状态。
      await bindTarget(midi, isCurrent)
      if (!isCurrent() || !matchesPlayback.value) return
      await playerStore.seekPreview(seconds * 1000)
    } catch (cause) {
      if (isCurrent()) error.value = t('midi.pianoRoll.seekFailed', { error: String(cause) })
    } finally {
      if (request === requestId) {
        committing = false
        previewSeconds.value = null
      }
    }
  }

  function invalidate(): void {
    requestId += 1
    previewSeconds.value = null
    committing = false
    error.value = ''
  }
  watch(filename, invalidate)
  onBeforeUnmount(() => {
    active = false
    invalidate()
  })
  return { matchesPlayback, previewSeconds, error, preview, seek, getQueue }
}
