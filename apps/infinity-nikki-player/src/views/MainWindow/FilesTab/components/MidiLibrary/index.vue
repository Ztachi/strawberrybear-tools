<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Music, MoreVertical, Trash2, X } from 'lucide-vue-next'
import MidiDetail from './components/MidiDetail/index.vue'

const { t } = useI18n()
const playerStore = usePlayerStore()

/** 格式化时长 */
function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/** 删除确认 */
async function confirmDelete(filename: string) {
  const confirmed = await confirm(t('midi.confirmDelete'), { title: t('actions.delete'), kind: 'warning' })
  if (confirmed) {
    playerStore.removeFromLibrary(filename)
  }
}
</script>

<template>
  <div class="midi-library h-full px-[10px] -translate-x-[10px] w-[calc(100%+20px)]">
    <!-- 列表 -->
    <div v-if="playerStore.midiLibrary.length > 0" class="library-list">
      <div
        v-for="midi in playerStore.midiLibrary"
        :key="midi.filename"
        class="library-item"
        role="button"
        tabindex="0"
        @click="playerStore.selectMidi(midi)"
        @keydown.enter="playerStore.selectMidi(midi)"
        @keydown.space.prevent="playerStore.selectMidi(midi)"
      >
        <div class="item-icon">
          <Music :size="18" />
        </div>
        <div class="item-info">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <span class="filename">{{ midi.filename }}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ midi.filename }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span class="meta"
            >{{ formatDuration(midi.duration_ms) }} · {{ midi.track_count }}
            {{ t('midi.tracks') }}</span
          >
        </div>

        <!-- 更多菜单 - 使用 shadcn-vue Popover -->
        <Popover>
          <PopoverTrigger as-child>
            <button class="menu-trigger" @click.stop>
              <MoreVertical :size="16" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-40 p-1" align="end">
            <button class="menu-action" @click="confirmDelete(midi.filename)">
              <Trash2 :size="14" />
              {{ t('actions.delete') }}
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state flex-1">
      <div class="empty-icon">
        <Music :size="40" />
      </div>
      <span class="empty-title">{{ t('midi.libraryEmpty') }}</span>
      <span class="empty-desc">{{ t('midi.libraryEmptyTip') }}</span>
    </div>

    <!-- MIDI 详情 Drawer -->
    <Drawer v-model:open="playerStore.showDetail" direction="left" handle-only>
      <DrawerContent class="!inset-y-0 !right-0 !left-auto !w-full !max-w-full">
        <DrawerHeader class="flex flex-row items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <div class="flex-1 min-w-0">
                  <DrawerTitle class="line-clamp-2">
                    {{ playerStore.currentMidi?.filename }}
                  </DrawerTitle>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ playerStore.currentMidi?.filename }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <!-- 隐藏描述文字但保留 aria-describedby -->
          <DrawerDescription class="sr-only"> MIDI 详情 </DrawerDescription>
          <button variant="ghost" size="icon" class="close-btn" @click="playerStore.closeDetail">
            <X :size="20" />
          </button>
        </DrawerHeader>
        <MidiDetail v-if="playerStore.currentMidi" class="flex-1" />
      </DrawerContent>
    </Drawer>
  </div>
</template>

<style scoped>
.midi-library {
  @apply flex flex-col flex-1;
}

.library-list {
  @apply space-y-2;
}

.library-item {
  @apply flex items-center gap-3 p-3 rounded-xl cursor-pointer;
  @apply transition-all duration-200;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(247, 192, 193, 0.15);
}

.library-item:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(247, 192, 193, 0.3);
  transform: translateX(4px);
}

.item-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0;
  background: rgba(247, 192, 193, 0.15);
  color: #f7c0c1;
}

.item-info {
  @apply flex-1 min-w-0;
}

.filename {
  @apply block text-sm font-medium truncate;
  color: #4a3f3f;
}

.meta {
  @apply text-xs mt-0.5;
  color: #a89a9a;
}

.menu-trigger {
  @apply w-8 h-8 rounded-lg flex items-center justify-center;
  @apply text-pink-300 hover:bg-pink-50 transition-colors;
}

.menu-action {
  @apply w-full flex items-center gap-2 px-3 py-2 text-sm text-left;
  @apply text-pink-600 transition-colors rounded-lg cursor-pointer;
}

.menu-action:hover {
  @apply bg-pink-50;
}

.empty-state {
  @apply flex flex-col items-center justify-center gap-3 py-16 rounded-2xl;
  background: rgba(255, 255, 255, 0.5);
  border: 1px dashed rgba(247, 192, 193, 0.2);
}

.empty-icon {
  @apply w-20 h-20 rounded-2xl flex items-center justify-center;
  background: rgba(247, 192, 193, 0.1);
  color: rgba(247, 192, 193, 0.5);
}

.empty-title {
  @apply text-base font-medium;
  color: #6b5a5a;
}

.empty-desc {
  @apply text-sm;
  color: #a89a9a;
}

.close-btn {
  @apply w-10 h-10 rounded-lg flex items-center justify-center;
  @apply text-pink-400 hover:bg-pink-50 transition-colors;
}
</style>
