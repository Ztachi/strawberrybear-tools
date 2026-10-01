<script setup lang="ts">
/** 独立窗口自有的框架抽屉；只复用列表内容，不接管抽屉动画或页面滚动。 */
import { Button, Drawer, Tooltip } from 'antdv-next'
import { ListMusic, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import PreviewQueueList from '@/components/PreviewPlayer/PreviewQueueList.vue'
import '@/components/PreviewPlayer/queueDrawer.css'
import type { PreviewQueueState } from '@/features/player/previewQueue'
import { getContentDrawerRootStyle } from '@/theme/infinityNikkiTheme'
const props = defineProps<{ open: boolean; state: PreviewQueueState; currentId: string | null; container: HTMLElement }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; select: [id: string] }>()
const { t } = useI18n()
</script>

<template>
  <Drawer
    :open="props.open"
    placement="right"
    :size="420"
    root-class="content-area-drawer play-queue-drawer"
    :closable="false"
    :get-container="() => container"
    :root-style="getContentDrawerRootStyle()"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="queue-title-wrap">
        <ListMusic class="queue-title-icon" />
        <div class="min-w-0">
          <h2 class="queue-title">
            {{ t('player.queue') }}
          </h2>
          <p class="queue-subtitle">
            {{ state.title || t('player.currentQueue') }} · {{ t('songList.totalSongs', { count: state.items.length }) }}
          </p>
        </div>
      </div>
    </template>

    <template #extra>
      <Tooltip :title="t('windowControls.close')">
        <Button
          :aria-label="t('windowControls.close')"
          type="text"
          class="drawer-close-btn"
          @click="emit('update:open', false)"
        >
          <template #icon>
            <X class="drawer-close-icon" />
          </template>
        </Button>
      </Tooltip>
    </template>

    <PreviewQueueList
      :state="state"
      :current-id="currentId"
      @select="emit('select', $event)"
    />
  </Drawer>
</template>

