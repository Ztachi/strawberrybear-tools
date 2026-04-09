<script setup lang="ts">
/**
 * @description: MIDI 详情面板
 */
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import PreviewPlayer from '@/components/PreviewPlayer/index.vue'
import PianoRoll from '@strawberrybear/piano-roll'
import { Music, Clock, Music2 } from 'lucide-vue-next'

const { t } = useI18n()
const playerStore = usePlayerStore()

/** 格式化时长 */
function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/** 切换音轨 */
function handleToggleTrack(trackIndex: number) {
  playerStore.toggleTrack(trackIndex)
}
</script>

<template>
  <div class="midi-detail">
    <!-- 文件信息头部 -->
    <div class="detail-header">
      <div class="file-icon">
        <Music :size="28" />
      </div>
      <div class="file-info">
        <div class="file-stats">
          <span class="stat">
            <Clock :size="14" />
            {{ formatDuration(playerStore.previewDuration) }}
          </span>
          <span class="stat">
            <Music :size="14" />
            {{ playerStore.currentMidi?.track_count }} {{ t('midi.tracks') }}
          </span>
          <span class="stat highlight">
            <Music2 :size="14" />
            {{ playerStore.melody.length }} {{ t('midi.melodyNotes') }}
          </span>
        </div>
      </div>
    </div>

    <!-- 试听播放器 -->
    <div class="preview-section">
      <PreviewPlayer />
    </div>

    <!-- 音轨列表 -->
    <div class="tracks-section">
      <h3 class="section-title">
        {{ t('midi.trackList') }}
      </h3>
      <PianoRoll
        :key="playerStore.currentMidi?.filename || 'empty'"
        :notes="playerStore.currentMidi?.events || []"
        :duration="playerStore.previewDuration"
        :ticks-per-beat="playerStore.currentMidi?.ticks_per_beat || 480"
        :tempo="playerStore.currentMidi?.tempo || 500000"
        :tracks="playerStore.tracks"
        :disabled-tracks="playerStore.disabledTracks"
        :disabled-tracks-version="playerStore.disabledTracksVersion"
        :current-time="playerStore.previewCurrentTime"
        @toggle="handleToggleTrack"
      />
    </div>
  </div>
</template>

<style scoped>
.midi-detail {
  @apply p-6 flex flex-col gap-6;
  overflow-y: auto;
}

.detail-header {
  @apply flex items-start gap-4;
}

.file-icon {
  @apply w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: white;
}

.file-info {
  @apply flex-1 min-w-0;
}

.file-stats {
  @apply flex flex-wrap gap-4;
}

.stat {
  @apply flex items-center gap-1.5 text-sm;
  color: var(--color-muted);
}

.stat.highlight {
  color: var(--color-primary);
  font-weight: 500;
}

.preview-section {
  @apply p-4 rounded-2xl;
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
}

/* 音轨区域 */
.tracks-section {
  @apply flex flex-col gap-3;
}

.section-title {
  @apply text-sm font-medium;
  color: var(--color-muted-dark);
}
</style>
