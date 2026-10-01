<script setup lang="ts">
/** 全局播放器及独立音轨窗口共用的播放队列入口。 */
import { Button, Tooltip } from 'antdv-next'
import { ListMusic } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
defineProps<{ open: boolean }>()
const emit = defineEmits<{ click: [] }>()
const { t } = useI18n()
</script>
<template>
  <Tooltip :title="t('player.openQueue')">
    <Button
      type="text"
      class="preview-queue-button"
      :aria-label="t('player.openQueue')"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="emit('click')"
    >
      <template #icon>
        <ListMusic
          class="size-5"
          :stroke-width="2.25"
        />
      </template>
    </Button>
  </Tooltip>
</template>
<style scoped>
.preview-queue-button { @apply size-9 shrink-0 rounded-xl; color: var(--color-primary-active); }
.preview-queue-button:hover { background: var(--bg-primary-10); }
</style>
