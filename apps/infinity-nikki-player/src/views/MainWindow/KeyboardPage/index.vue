<script setup lang="ts">
/**
 * @description: 虚拟键盘页面
 * @description 提供全局模板发音配置、键盘模拟开关、模板选择和实时键盘预览。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip } from 'antdv-next'
import { Keyboard, Music2 } from 'lucide-vue-next'
import VirtualKeyboardPanel from '@/components/VirtualKeyboardPanel/index.vue'
import { getMidiDisplayName } from '@/lib/midiDisplay'
import { usePlayerStore } from '@/stores/player'

const { t } = useI18n()
const playerStore = usePlayerStore()

/** 当前播放歌曲展示名，空状态由页面文案兜底。 */
const currentDisplayName = computed(() =>
  playerStore.currentMidi ? getMidiDisplayName(playerStore.currentMidi) : t('player.noMedia')
)

/** 当前是否有可用于键盘高亮的播放内容。 */
const hasCurrentMidi = computed(() => Boolean(playerStore.currentMidi))
</script>

<template>
  <section class="keyboard-page">
    <header class="keyboard-page-header">
      <div class="page-title-icon">
        <Keyboard class="page-title-icon-svg" />
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="page-title">
          {{ t('keyboardPage.title') }}
        </h1>
        <Tooltip :title="currentDisplayName">
          <p class="current-song" :class="{ empty: !hasCurrentMidi }">
            <Music2 class="current-song-icon" />
            <span class="truncate">{{ currentDisplayName }}</span>
          </p>
        </Tooltip>
      </div>
    </header>

    <section class="keyboard-page-body">
      <VirtualKeyboardPanel />
    </section>
  </section>
</template>

<style scoped>
.keyboard-page {
  @apply flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-2xl bg-white p-4;
}

.keyboard-page-header {
  @apply flex shrink-0 items-center gap-3 rounded-2xl bg-white p-4;
  border: 1px solid var(--border-primary-15);
}

.page-title-icon {
  @apply flex h-12 w-12 shrink-0 items-center justify-center rounded-xl;
  background: var(--bg-primary-10);
  color: var(--color-primary-active);
}

.page-title-icon-svg {
  width: 24px;
  height: 24px;
  stroke-width: 2.25;
}

.page-title {
  @apply text-lg font-semibold leading-tight;
  color: var(--color-foreground);
}

.current-song {
  @apply mt-2 flex min-w-0 items-center gap-1.5 text-sm;
  color: var(--color-muted-dark);
}

.current-song.empty {
  color: var(--color-muted);
}

.current-song-icon {
  @apply shrink-0;
  width: 15px;
  height: 15px;
  stroke-width: 2.2;
  color: var(--color-primary-active);
}

.keyboard-page-body {
  @apply flex min-h-0 flex-1 items-stretch overflow-hidden rounded-2xl bg-white p-3;
  border: 1px solid var(--border-primary-15);
}
</style>
