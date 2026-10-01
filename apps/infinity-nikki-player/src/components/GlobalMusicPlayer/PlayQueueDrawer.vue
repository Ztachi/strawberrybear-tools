<script setup lang="ts">
/**
 * @description: 当前播放队列抽屉
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { Button, Drawer } from 'antdv-next'
import { ListMusic, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import '@/components/PreviewPlayer/queueDrawer.css'
import PreviewQueueList from '@/components/PreviewPlayer/PreviewQueueList.vue'
import { usePreviewQueue } from '@/composables/usePreviewQueue'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { usePlayerStore } from '@/stores/player'
import { getContentDrawerRootStyle, getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import type { FloatingActionRegistration } from '@/stores/mainWindowUi'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const { t } = useI18n()
const mainWindowUiStore = useMainWindowUiStore()
const playerStore = usePlayerStore()

const queue = usePreviewQueue()
const drawer = ref<InstanceType<typeof PreviewQueueList>>()
const queueItems = computed(() => playerStore.activePreviewQueueItems)
const SCROLL_THRESHOLD = 120
let backToTopRegistration: FloatingActionRegistration | null = null
let locateCurrentRegistration: FloatingActionRegistration | null = null

function handleQueueScroll(top: number): void {
  backToTopRegistration?.setVisible(top > SCROLL_THRESHOLD)
}

function updateLocateCurrentVisible(): void {
  const filename = playerStore.currentMidi?.filename
  locateCurrentRegistration?.setVisible(
    Boolean(filename && queueItems.value.some((midi) => midi.filename === filename))
  )
}

function scrollQueueToTop(): void { drawer.value?.scrollToTop() }
async function locateCurrentQueueItem(): Promise<void> { await drawer.value?.locateCurrent() }

async function registerQueueFocus(): Promise<void> {
  if (backToTopRegistration || locateCurrentRegistration) return

  backToTopRegistration = mainWindowUiStore.registerBackToTop(scrollQueueToTop)
  locateCurrentRegistration = mainWindowUiStore.registerLocateCurrent(() => {
    void locateCurrentQueueItem()
  })

  await nextTick()
  handleQueueScroll(drawer.value?.getScrollTop() ?? 0)
  updateLocateCurrentVisible()
}

function unregisterQueueFocus(): void {
  backToTopRegistration?.()
  backToTopRegistration = null
  locateCurrentRegistration?.()
  locateCurrentRegistration = null
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void registerQueueFocus()
      return
    }
    unregisterQueueFocus()
  },
  { immediate: true }
)

watch(
  [() => playerStore.currentMidi?.filename, () => queueItems.value.map((midi) => midi.filename).join('\n')],
  () => {
    updateLocateCurrentVisible()
  }
)

onUnmounted(() => {
  unregisterQueueFocus()
})
</script>

<template>
  <Drawer
    :open="props.open"
    placement="right"
    width="420"
    root-class="content-area-drawer play-queue-drawer"
    :closable="false"
    :get-container="getMainWindowPopupContainer"
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
            {{ queue.state.value.title || t('player.currentQueue') }} · {{ t('songList.totalSongs', { count: queueItems.length }) }}
          </p>
        </div>
      </div>
    </template>

    <template #extra>
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
    </template>

    <PreviewQueueList
      ref="drawer"
      :state="queue.state.value"
      :current-id="playerStore.currentMidi?.filename ?? null"
      @select="queue.play"
      @scroll="handleQueueScroll"
    />
  </Drawer>
</template>

