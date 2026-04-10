<script setup lang="ts">
/**
 * @description: MIDI 详情面板
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import PreviewPlayer from '@/components/PreviewPlayer/index.vue'
import KeyboardPreview from '@/components/KeyboardPreview/index.vue'
import PianoRoll from '@strawberrybear/piano-roll'
import { Music, Music2 } from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TrackInfo } from '@/types'

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

/** 当前激活的按键集合（根据播放时间和旋律音符自动计算） */
const activeKeys = computed<Set<string>>(() => {
  const currentTime = playerStore.previewCurrentTime
  const active = new Set<string>()

  for (const event of playerStore.melody) {
    const startTime = event.start_ms
    const endTime = event.start_ms + event.duration_ms
    if (currentTime >= startTime && currentTime < endTime) {
      const mapping = settingsStore.getCurrentTemplate()?.mappings.find((m) => m.pitch === event.pitch)
      if (mapping) {
        active.add(mapping.key)
      }
    }
  }

  return active
})

/** 切换音轨 */
function handleToggleTrack(trackIndex: number) {
  playerStore.toggleTrack(trackIndex)
}

/** 带翻译名称的音轨列表 */
const translatedTracks = computed<TrackInfo[]>(() => {
  return playerStore.tracks.map((track) => {
    if (track.name.includes('|percussion')) {
      return { ...track, name: t('midi.percussionTrack') }
    }
    return { ...track, name: `${t('midi.trackIndex', { n: Number(track.name) })}` }
  })
})

/** 选择模板 */
function handleTemplateChange(value: unknown) {
  if (typeof value === 'string') {
    settingsStore.selectTemplate(value)
  }
}
</script>

<template>
  <div class="midi-detail">
    <!-- 顶部区域：左侧播放器 + 右侧键盘预览 -->
    <div class="detail-header">
      <!-- 左侧：播放器 + 模板选择 -->
      <div class="left-section">
        <div class="preview-section">
          <PreviewPlayer />
        </div>
        <div class="template-section">
          <Select
            :model-value="settingsStore.currentTemplateId"
            @update:model-value="handleTemplateChange"
          >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="t('player.noTemplate')" />
            </SelectTrigger>
            <SelectContent>
              <SelectLabel>{{ t('player.template') }}</SelectLabel>
              <SelectItem v-for="tmpl in settingsStore.templates" :key="tmpl.id" :value="tmpl.id">
                {{ tmpl.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <!-- 右侧：键盘预览 -->
      <div class="keyboard-section">
        <KeyboardPreview :active-keys="activeKeys" />
      </div>
    </div>

    <!-- 音轨列表 -->
    <div class="tracks-section">
      <div class="section-header">
        <div class="section-title-group">
          <h3 class="section-title">
            {{ t('midi.trackList') }}
          </h3>
          <div class="section-stats">
            <span class="stat">
              <Music :size="14" class="text-success" />
              <span class="stat-value">{{ playerStore.currentMidi?.track_count }}</span>
              <span class="stat-label">{{ t('midi.tracks') }}</span>
            </span>
            <span class="stat">
              <Music2 :size="14" class="text-success" />
              <span class="stat-value">{{ playerStore.melody.length }}</span>
              <span class="stat-label">{{ t('midi.melodyNotes') }}</span>
            </span>
          </div>
        </div>
      </div>
      <PianoRoll
        :key="playerStore.currentMidi?.filename || 'empty'"
        :notes="playerStore.currentMidi?.events || []"
        :duration="playerStore.previewDuration"
        :ticks-per-beat="playerStore.currentMidi?.ticks_per_beat || 480"
        :tempo="playerStore.currentMidi?.tempo || 500000"
        :tracks="translatedTracks"
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
  @apply px-6 pb-6 flex flex-col gap-6;
  overflow-y: auto;
}

.detail-header {
  @apply flex gap-4;
}

.left-section {
  @apply flex flex-col gap-4 flex-1;
}

.preview-section {
  @apply p-4 rounded-2xl;
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
}

.template-section {
  @apply px-1;
}

.keyboard-section {
  @apply flex items-center justify-center flex-1;
}

/* 音轨区域 */
.tracks-section {
  @apply flex flex-col gap-3;
}

.section-header {
  @apply flex items-center;
}

.section-title-group {
  @apply flex items-center gap-4;
}

.section-title {
  @apply text-sm font-medium;
  color: var(--color-muted-dark);
}

.section-stats {
  @apply flex items-center gap-3;
}

.stat {
  @apply flex items-center gap-1;
}

.stat-value {
  @apply text-sm font-medium;
  color: var(--color-primary);
}

.stat-label {
  @apply text-xs;
  color: var(--color-muted);
}
</style>
