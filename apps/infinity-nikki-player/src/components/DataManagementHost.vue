<script setup lang="ts">
/** 自动备份只由主窗口收集已落盘模板草稿，独立编辑窗口不创建重复任务。 */
import { onMounted, onBeforeUnmount } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { captureTemplateDrafts } from '@/lib/dataManagementBrowser'

let disposed = false
let unlisten: (() => void) | undefined
let pending: Promise<void> | undefined
onMounted(async () => {
  const cleanup = await listen('data-backup-requested', () => {
    if (disposed || pending) return
    pending = invoke('create_data_backup', { drafts: captureTemplateDrafts() })
      .then(() => {})
      .catch((error: unknown) => { console.error('自动备份失败：', error) })
      .finally(() => { pending = undefined })
  })
  if (disposed) cleanup()
  else unlisten = cleanup
})
onBeforeUnmount(() => { disposed = true; unlisten?.() })
</script>
<template>
  <span hidden aria-hidden="true" />
</template>
