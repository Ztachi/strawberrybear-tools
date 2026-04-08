<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import PreviewPlayer from '@/components/PreviewPlayer/index.vue'
import PlayerControls from '@/components/PlayerControls/index.vue'
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

    <!-- 演奏控制 -->
    <div class="detail-player">
      <PlayerControls />
    </div>

    <!-- 旋律信息 -->
    <div class="melody-info">
      <h3 class="section-title">
        {{ t('midi.melodyInfo') }}
      </h3>
      <div class="melody-stats">
        <div class="stat-card">
          <span class="stat-value">{{ playerStore.melody.length }}</span>
          <span class="stat-label">{{ t('midi.totalNotes') }}</span>
        </div>
        <div class="stat-card">
          <span
            class="stat-value"
            >{{ formatDuration(playerStore.currentMidi?.duration_ms || 0) }}</span
          >
          <span class="stat-label">{{ t('midi.duration') }}</span>
        </div>
        <div class="stat-card">
          <span
            class="stat-value"
            >{{ playerStore.melody.filter(n => n.velocity > 0).length }}</span
          >
          <span class="stat-label">{{ t('midi.activeNotes') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.midi-detail {
  @apply p-6 overflow-y-auto;
}

.detail-header {
  @apply flex items-start gap-4 mb-6;
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
  @apply mb-6 p-4 rounded-2xl;
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
}

.detail-player {
  @apply mb-6;
}

.melody-info {
  @apply pt-4;
  border-top: 1px solid var(--border-primary-10);
}

.section-title {
  @apply text-sm font-medium mb-4;
  color: var(--color-muted-dark);
}

.melody-stats {
  @apply grid grid-cols-3 gap-3;
}

.stat-card {
  @apply flex flex-col items-center gap-1 p-4 rounded-xl;
  background: var(--bg-primary-08);
  border: 1px solid var(--border-primary-15);
}

.stat-card .stat-value {
  @apply text-2xl font-bold;
  color: var(--color-primary);
}

.stat-card .stat-label {
  @apply text-xs;
  color: var(--color-muted);
}
</style>
