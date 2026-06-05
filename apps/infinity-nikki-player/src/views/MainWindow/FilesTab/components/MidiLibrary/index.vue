<script setup lang="ts">
/**
 * @description: MIDI 库组件
 * @description 显示已导入的 MIDI 文件列表，支持选择、删除等操作
 */
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { Button, Drawer, Popover, Tooltip } from 'antdv-next'
import { Music, MoreVertical, Trash2, X } from 'lucide-vue-next'
import { getContentDrawerRootStyle, getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import MidiDetail from './components/MidiDetail/index.vue'

const { t } = useI18n()
const playerStore = usePlayerStore()

/**
 * @description: 格式化时长显示
 * @param {number} ms - 时长（毫秒）
 * @return {string} 格式化后的时长字符串 (M:SS)
 *
 * @example
 * formatDuration(125000) // "2:05"
 */
function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * @description: 处理 MIDI 详情抽屉 open 状态变化
 * @param {boolean} open - antdv Drawer 目标打开状态
 * @return {void} 无返回值
 */
function handleDetailDrawerOpenChange(open: boolean): void {
  // 抽屉关闭必须复用 store 的清理逻辑，保证试听、当前 MIDI 和音轨状态同步释放。
  if (!open) playerStore.closeDetail()
}
</script>

<template>
  <div class="midi-library h-full px-[10px] -translate-x-[10px] w-[calc(100%+20px)]">
    <!-- MIDI 文件列表 -->
    <div v-if="playerStore.midiLibrary.length > 0" class="library-list">
      <!-- 遍历每个 MIDI 文件 -->
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
        <!-- 文件图标 -->
        <div class="item-icon">
          <Music :size="18" />
        </div>

        <!-- 文件信息 -->
        <div class="item-info">
          <Tooltip :title="midi.filename">
            <!-- 文件名（超长时截断） -->
            <span class="filename">{{ midi.filename }}</span>
          </Tooltip>

          <!-- 文件元数据 -->
          <span class="meta"
            >{{ formatDuration(midi.duration_ms) }} · {{ midi.track_count }}
            {{ t('midi.tracks') }} · {{ midi.melody_note_count || 0 }}
            {{ t('midi.melodyNotes') }}</span
          >
        </div>

        <!-- 更多操作菜单 -->
        <Popover trigger="click" placement="bottomRight">
          <template #content>
            <!-- 删除按钮 -->
            <button class="menu-action" @click="playerStore.deleteMidi(midi.filename)">
              <Trash2 :size="14" />
              {{ t('actions.delete') }}
            </button>
          </template>
          <button class="menu-trigger" @click.stop>
            <MoreVertical :size="16" />
          </button>
        </Popover>
      </div>
    </div>

    <!-- 空状态提示 -->
    <div v-else class="empty-state flex-1">
      <div class="empty-icon">
        <Music :size="40" />
      </div>
      <span class="empty-title">{{ t('midi.libraryEmpty') }}</span>
      <span class="empty-desc">{{ t('midi.libraryEmptyTip') }}</span>
    </div>

    <!-- MIDI 详情抽屉 -->
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
        <!-- 关闭按钮 -->
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
      <!-- MIDI 详情内容 -->
      <MidiDetail v-if="playerStore.currentMidi" class="flex-1" />
    </Drawer>
  </div>
</template>

<style scoped>
.midi-library {
  @apply flex flex-col flex-1;
}

.library-list {
  @apply space-y-2;
  padding-bottom: 20px;
}

.library-item {
  @apply flex items-center gap-3 p-3 rounded-xl cursor-pointer;
  transition: all 0.2s;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-15);
}

.library-item:hover {
  background: var(--bg-white-95);
  border-color: var(--border-primary-30);
  transform: translateX(4px);
}

.item-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0;
  background: var(--bg-primary-15);
  color: var(--color-primary);
}

.item-info {
  @apply flex-1 min-w-0;
}

.filename {
  @apply block text-sm font-medium truncate;
  color: var(--color-foreground);
}

.meta {
  @apply text-xs mt-0.5;
  color: var(--color-muted);
}

.menu-trigger {
  @apply w-8 h-8 rounded-lg flex items-center justify-center;
  color: var(--color-primary);
  transition: all 0.2s;
}

.menu-trigger:hover {
  background: var(--bg-primary-10);
}

.menu-action {
  @apply w-full flex items-center gap-2 px-3 py-2 text-sm text-left;
  color: var(--color-danger);
  transition: all 0.2s;
  border-radius: 0.5rem;
  cursor: pointer;
}

.menu-action:hover {
  background: var(--bg-primary-10);
}

.empty-state {
  @apply flex flex-col items-center justify-center gap-3 py-16 rounded-2xl;
  background: var(--bg-white-50);
  border: 1px dashed var(--border-primary-20);
}

.empty-icon {
  @apply w-20 h-20 rounded-2xl flex items-center justify-center;
  background: var(--bg-primary-10);
  color: var(--color-primary);
}

.empty-title {
  @apply text-base font-medium;
  color: var(--color-muted-dark);
}

.empty-desc {
  @apply text-sm;
  color: var(--color-muted);
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
