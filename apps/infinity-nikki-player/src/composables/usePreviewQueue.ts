import { computed, ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { getMidiDisplayName } from '@/lib/midiDisplay'
import type { PreviewQueueState } from '@/features/player/previewQueue'

/** 主窗口拥有队列与选曲动作，列表 UI 只消费轻量快照及稳定歌曲 ID。 */
export function usePreviewQueue() {
  const player = usePlayerStore()
  const error = ref('')
  const state = computed<PreviewQueueState>(() => ({
    title: player.previewQueueContext?.title ?? '',
    error: error.value,
    items: player.activePreviewQueueItems.map((midi) => ({
      id: midi.filename,
      title: getMidiDisplayName(midi),
      durationMs: midi.duration_ms,
      trackCount: midi.track_count,
      noteCount: midi.melody_note_count || 0,
    })),
  }))
  async function play(id: string): Promise<void> {
    const items = player.activePreviewQueueItems
    const midi = items.find((item) => item.filename === id)
    if (!midi) return
    error.value = ''
    try {
      await player.playMidiInQueue(midi, items, player.previewQueueContext)
    } catch (cause) {
      error.value = String(cause)
    }
  }
  return { state, play }
}
