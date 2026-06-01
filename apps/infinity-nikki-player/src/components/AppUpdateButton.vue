<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, Sparkles } from 'lucide-vue-next'
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
  return t('updater.updateNow')
})

const buttonIcon = computed(() => {
  if (updater.isDownloading.value || updater.isInstalling.value) return Loader2
  return Sparkles
})

async function handleClick() {
  await updater.downloadAndInstallUpdate()
}
</script>

<template>
  <button
    v-if="updater.hasUpdate.value"
    class="app-update-button fab-btn"
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
  width: auto !important;
  min-width: 72px;
  padding: 0 14px !important;
  gap: 6px;
  background: #ef4444 !important;
  border-color: #dc2626 !important;
  color: #ffffff !important;
  box-shadow: 0 8px 18px rgba(239, 68, 68, 0.28);
}

.app-update-button:hover:not(:disabled) {
  background: #dc2626 !important;
  border-color: #b91c1c !important;
  color: #ffffff !important;
  box-shadow: 0 10px 22px rgba(220, 38, 38, 0.34);
  transform: translateY(-1px);
}

.update-icon {
  flex-shrink: 0;
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
