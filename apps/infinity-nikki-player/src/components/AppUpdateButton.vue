<script setup lang="ts">
import { computed } from 'vue'
import { Download, ExternalLink, Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAppUpdater } from '@/composables/useAppUpdater'

const { t } = useI18n()
const updater = useAppUpdater()

const buttonText = computed(() => {
  if (updater.isInstalling.value) return t('updater.installing')
  if (updater.isDownloading.value) {
    return updater.progress.value === null
      ? t('updater.downloading')
      : t('updater.downloadingProgress', { progress: updater.progress.value })
  }
  if (updater.lastError.value) return t('updater.openRelease')
  return t('updater.updateNow')
})

const buttonIcon = computed(() => {
  if (updater.isDownloading.value || updater.isInstalling.value) return Loader2
  if (updater.lastError.value) return ExternalLink
  return Download
})

async function handleClick() {
  if (updater.lastError.value) {
    await updater.openReleasePage()
    return
  }

  await updater.downloadAndInstallUpdate()
}
</script>

<template>
  <button
    v-if="updater.hasUpdate.value || updater.lastError.value"
    class="app-update-button fab-btn"
    :class="{ busy: updater.isDownloading.value || updater.isInstalling.value }"
    :disabled="updater.isBusy.value && !updater.lastError.value"
    :title="buttonText"
    @click="handleClick"
  >
    <component
      :is="buttonIcon"
      class="update-icon"
      :class="{ spinning: updater.isDownloading.value || updater.isInstalling.value }"
      :size="18"
    />
    <span
      v-if="updater.progress.value !== null && updater.isDownloading.value"
      class="progress-badge"
    >
      {{ updater.progress.value }}
    </span>
  </button>
</template>

<style scoped>
.app-update-button {
  position: relative;
}

.update-icon {
  flex-shrink: 0;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

.progress-badge {
  position: absolute;
  right: -6px;
  top: -6px;
  min-width: 20px;
  height: 18px;
  border-radius: 999px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  box-shadow: var(--shadow-pink-sm);
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
