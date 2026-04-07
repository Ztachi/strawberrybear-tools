<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import PlayerControls from '@/components/PlayerControls.vue'
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
            {{ formatDuration(playerStore.currentMidi?.duration_ms || 0) }}
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

    <!-- 播放控制 -->
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
  @apply p-6;
}

.detail-header {
  @apply flex items-start gap-4 mb-6;
}

.file-icon {
  @apply w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0;
  background: linear-gradient(135deg, #f7c0c1 0%, #f5b8c0 100%);
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
  color: #a89a9a;
}

.stat.highlight {
  @apply text-pink-500 font-medium;
}

.detail-player {
  @apply mb-6;
}

.melody-info {
  @apply pt-4 border-t border-pink-100;
}

.section-title {
  @apply text-sm font-medium mb-4;
  color: #6b5a5a;
}

.melody-stats {
  @apply grid grid-cols-3 gap-3;
}

.stat-card {
  @apply flex flex-col items-center gap-1 p-4 rounded-xl;
  background: rgba(247, 192, 193, 0.08);
  border: 1px solid rgba(247, 192, 193, 0.15);
}

.stat-card .stat-value {
  @apply text-2xl font-bold;
  color: #f7c0c1;
}

.stat-card .stat-label {
  @apply text-xs;
  color: #a89a9a;
}
</style>
