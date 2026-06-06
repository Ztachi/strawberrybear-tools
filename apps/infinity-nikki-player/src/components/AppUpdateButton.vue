<script setup lang="ts">
/**
 * @description: 应用更新入口按钮
 * @description 静默检查到新版本后显示，放置在主窗口 Header 标题区
 */
import { computed } from 'vue'
import { Download, Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAppUpdater } from '@/composables/useAppUpdater'

const { t } = useI18n()
const updater = useAppUpdater()

/** 按钮文案会跟随下载/安装进度实时变化。 */
const buttonText = computed(() => {
  if (updater.isInstalling.value) return t('updater.installing')
  if (updater.isDownloading.value) {
    return updater.progress.value === null
      ? t('updater.downloading')
      : t('updater.downloadingProgress', { progress: updater.progress.value })
  }
  return t('updater.updateNow')
})

/** 下载或安装过程中使用旋转图标，普通可更新状态使用下载图标。 */
const buttonIcon = computed(() => {
  if (updater.isDownloading.value || updater.isInstalling.value) return Loader2
  return Download
})

/**
 * @description: 下载并安装静默检测到的新版本
 */
async function handleClick() {
  await updater.downloadAndInstallUpdate()
}
</script>

<template>
  <button
    v-if="updater.hasUpdate.value"
    class="app-update-button"
    :class="{ busy: updater.isDownloading.value || updater.isInstalling.value }"
    :disabled="updater.isBusy.value"
    :title="buttonText"
    @click="handleClick"
  >
    <component
      :is="buttonIcon"
      class="update-icon"
      :class="{ spinning: updater.isDownloading.value || updater.isInstalling.value }"
      :size="18"
    />
    <span class="update-label">{{ buttonText }}</span>
  </button>
</template>

<style scoped>
.app-update-button {
  @apply relative inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 transition-all;
  background: var(--color-danger);
  border: 1px solid transparent;
  color: var(--color-white);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--color-danger) 28%, transparent);
}

.app-update-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-danger) 88%, black);
  color: var(--color-white);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--color-danger) 34%, transparent);
  transform: translateY(-1px);
}

.update-icon {
  @apply shrink-0;
}

.update-label {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

.busy {
  cursor: progress;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
