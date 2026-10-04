<script setup lang="ts">
/** @description: 仅主窗口挂载日志宿主，首屏准备完成后提示一次。 */
import { watch } from 'vue'
import { useReleaseNotes } from '@/composables/useReleaseNotes'
import ReleaseNotesDialog from '@/components/ReleaseNotesDialog.vue'

const props = defineProps<{ ready: boolean }>()
const notes = useReleaseNotes()
watch(() => props.ready, (ready) => {
  if (ready) void notes.start().catch((error: unknown) => {
    // 公告失败不应阻挡首屏或演奏；保留具体原因供诊断，下次启动仍可重试。
    console.warn('初始化更新日志失败：', error)
  })
}, { immediate: true })
</script>

<template>
  <ReleaseNotesDialog
    :open="notes.open.value"
    :versions="notes.versions.value"
    :current-version="notes.currentVersion.value"
    :mode="notes.mode.value"
    @close="notes.close"
  />
</template>
