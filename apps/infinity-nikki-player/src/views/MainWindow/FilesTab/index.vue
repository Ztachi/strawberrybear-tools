<script setup lang="ts">
/**
 * @description: MIDI 文件 Tab 页
 * @description 左侧展示所有歌曲和自建歌单，右侧通过路由渲染歌曲/歌单页面。
 */
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { Button, Drawer, Tooltip } from 'antdv-next'
import { X } from 'lucide-vue-next'
import { usePlayerStore } from '@/stores/player'
import { useSongListStore } from '@/stores/songLists'
import { getContentDrawerRootStyle, getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import MidiDetail from './components/MidiLibrary/components/MidiDetail/index.vue'

const songListStore = useSongListStore()
const playerStore = usePlayerStore()

function handleDetailDrawerOpenChange(open: boolean): void {
  if (!open) playerStore.closeDetail()
}

onMounted(() => {
  void songListStore.loadSongLists()
})
</script>

<template>
  <div class="files-tab-layout">
    <main class="files-route-panel">
      <RouterView v-slot="{ Component, route }">
        <Transition name="files-page" mode="out-in">
          <div :key="route.fullPath" class="files-page-host">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>

    <Drawer
      :open="playerStore.showDetail"
      placement="left"
      size="100%"
      root-class="content-area-drawer midi-detail-drawer"
      :closable="false"
      :get-container="getMainWindowPopupContainer"
      :root-style="getContentDrawerRootStyle()"
      @update:open="handleDetailDrawerOpenChange"
    >
      <template #title>
        <Tooltip :title="playerStore.currentMidi?.filename">
          <span class="line-clamp-2">{{ playerStore.currentMidi?.filename }}</span>
        </Tooltip>
      </template>
      <template #extra>
        <Button
          type="text"
          color="primary"
          variant="outlined"
          class="close-btn"
          @click="playerStore.closeDetail"
        >
          <template #icon>
            <X class="drawer-close-icon" />
          </template>
        </Button>
      </template>
      <MidiDetail v-if="playerStore.currentMidi" class="flex-1" />
    </Drawer>
  </div>
</template>

<style scoped>
.files-tab-layout {
  @apply flex h-full min-h-0;
}

.files-route-panel {
  @apply flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl p-4;
  background: var(--bg-white-50);
  border: 1px solid var(--border-primary-15);
}

.files-page-host {
  @apply h-full min-h-0 min-w-0 flex-1;
}

.files-page-enter-active,
.files-page-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.files-page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.files-page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.close-btn {
  @apply h-10 w-10 rounded-lg;
}

.drawer-close-icon {
  width: 22px;
  height: 22px;
  stroke-width: 2.35;
}

:deep(.midi-detail-drawer .ant-drawer-content) {
  background: var(--bg-white-95);
}

:deep(.midi-detail-drawer .ant-drawer-header) {
  border-bottom-color: var(--border-primary-15);
}

:deep(.midi-detail-drawer .ant-drawer-body) {
  display: flex;
  min-height: 0;
  padding: 0;
}
</style>
