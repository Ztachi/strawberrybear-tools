<script setup lang="ts">
/**
 * @description: 歌曲列表封面播放状态控件
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Music2, Pause, Play } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import type { MidiInfo } from '@/types'
import type { MidiPreviewQueueContext } from '@/features/player/midiPreview'

const props = defineProps<{
  midi: MidiInfo
  queueItems: MidiInfo[]
  queueContext?: MidiPreviewQueueContext | null
}>()

const { t } = useI18n()
const playerStore = usePlayerStore()

const playbackState = computed(() => playerStore.getSongPlaybackState(props.midi.filename))
const isPlaying = computed(() => playbackState.value === 'playing')

async function handleCoverAction(event: MouseEvent): Promise<void> {
  event.stopPropagation()
  if (isPlaying.value) {
    playerStore.pausePreviewPlayback()
    return
  }
  await playerStore.playMidiInQueue(props.midi, props.queueItems, props.queueContext ?? null)
}
</script>

<template>
  <button
    type="button"
    class="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/15 bg-primary/10 text-primary transition-colors"
    :aria-label="isPlaying ? t('player.pauseSong') : t('player.playSong')"
    @click="handleCoverAction"
  >
    <Music2 class="h-[18px] w-[18px] stroke-[2.25]" />

    <span
      class="absolute inset-0 bg-slate-950/45 opacity-0 transition-opacity group-hover/song-row:opacity-100"
      :class="{ 'opacity-100': isPlaying }"
      aria-hidden="true"
    />

    <span
      v-if="isPlaying"
      class="playing-bars absolute inset-0 flex items-center justify-center text-white transition-opacity group-hover/song-row:opacity-0"
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
    </span>

    <span
      class="absolute inset-0 flex scale-90 items-center justify-center text-white opacity-0 transition-all group-hover/song-row:scale-100 group-hover/song-row:opacity-100"
    >
      <Pause v-if="isPlaying" class="h-[18px] w-[18px] stroke-0" fill="currentColor" />
      <Play v-else class="ml-0.5 h-[18px] w-[18px] stroke-0" fill="currentColor" />
    </span>
  </button>
</template>

<style scoped>
.playing-bars {
  gap: 3px;
}

.playing-bars span {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  animation: playbackBar 0.84s ease-in-out infinite;
}

.playing-bars span:nth-child(1) {
  height: 10px;
}

.playing-bars span:nth-child(2) {
  height: 17px;
  animation-delay: 0.12s;
}

.playing-bars span:nth-child(3) {
  height: 13px;
  animation-delay: 0.24s;
}

.playing-bars span:nth-child(4) {
  height: 20px;
  animation-delay: 0.36s;
}

@keyframes playbackBar {
  0%,
  100% {
    transform: scaleY(0.45);
  }

  50% {
    transform: scaleY(1);
  }
}
</style>
