<script setup lang="ts">
/** @fileOverview 关于页更新状态与恢复入口，所有操作复用共享更新器。 */
import { computed } from 'vue'
import { Alert, Button, Progress, Space } from 'antdv-next'
import { useI18n } from 'vue-i18n'
import { useAppUpdater } from '@/composables/useAppUpdater'

const { t } = useI18n()
const updater = useAppUpdater()
const state = updater.state
const statusText = computed(() => {
  if (updater.isPreparing.value) return t('updater.preparing')
  if (updater.lastError.value) return t(updater.lastError.value.stage === 'check' ? 'updater.checkFailed' : 'updater.installFailed')
  return t(`updater.phases.${state.value.phase}`)
})
const errorDescription = computed(() => {
  const code = updater.lastError.value?.code ?? 'operationFailed'
  return t(`updater.errors.${['timeout', 'network', 'invalidManifest', 'signature', 'unsupportedPlatform', 'storage'].includes(code) ? code : 'operationFailed'}`)
})
</script>

<template>
  <section class="update-status" aria-live="polite" :aria-label="t('updater.checkNow')">
    <Alert
      v-if="state.lastInstall?.outcome === 'notApplied'"
      type="warning"
      show-icon
      :title="t('updater.notApplied')"
      :description="t('updater.notAppliedDescription', { version: state.lastInstall.targetVersion, current: state.currentVersion })"
    />
    <Alert
      v-if="updater.lastError.value"
      type="error"
      show-icon
      :title="statusText"
      :description="errorDescription"
    />
    <p v-else class="status-label">
      {{ statusText }}
    </p>
    <p v-if="state.targetVersion" class="update-meta">
      {{ t('updater.availableDescription', { version: state.targetVersion }) }}
    </p>
    <p v-if="state.lastInstall?.outcome === 'applied'" class="update-meta">
      {{ t('updater.applied', { version: state.currentVersion }) }}
    </p>
    <template v-if="updater.isDownloading.value || state.phase === 'ready'">
      <Progress
        v-if="updater.progress.value !== null"
        :percent="updater.progress.value"
        :status="state.phase === 'ready' ? 'success' : 'active'"
        size="small"
      />
      <p class="update-meta">
        {{ t(`updater.sources.${state.source ?? 'mirror'}`) }} ·
        {{ (state.downloadedBytes / 1024 / 1024).toFixed(1) }} MB
      </p>
    </template>
    <Space wrap>
      <Button v-if="updater.isDownloading.value" @click="updater.cancelDownload">
        {{ t('updater.cancelDownload') }}
      </Button>
      <Button
        v-else-if="updater.hasUpdate.value"
        type="primary"
        :disabled="updater.isBusy.value"
        @click="updater.downloadAndInstallUpdate"
      >
        {{ t(state.phase === 'ready' ? 'updater.installNow' : updater.lastError.value ? 'updater.retryDownload' : 'updater.updateNow') }}
      </Button>
      <Button
        :loading="updater.isChecking.value"
        :disabled="updater.isBusy.value || state.phase === 'ready'"
        @click="updater.checkUpdate()"
      >
        {{ t('updater.checkNow') }}
      </Button>
    </Space>
    <Space wrap size="small">
      <Button type="link" size="small" @click="updater.openReleasePage('github')">
        {{ t(state.targetVersion || state.lastInstall ? 'updater.manualGithub' : 'updater.manualDownload') }}
      </Button>
      <Button
        v-if="updater.hasUpdate.value"
        type="link"
        size="small"
        @click="updater.openReleasePage('mirror')"
      >
        {{ t('updater.manualMirror') }}
      </Button>
      <Button type="link" size="small" @click="updater.exportDiagnostics">
        {{ t('updater.exportDiagnostics') }}
      </Button>
    </Space>
    <p v-if="state.lastCheckedAt" class="update-meta">
      {{ t('updater.lastChecked', { time: new Date(state.lastCheckedAt).toLocaleString() }) }}
    </p>
  </section>
</template>

<style scoped>
.update-status { display: flex; flex-direction: column; gap: 10px; width: 100%; margin-bottom: 18px; text-align: left; }
.status-label { margin: 0; font-size: 13px; font-weight: 600; }
.update-meta { margin: 0; font-size: 12px; color: var(--color-foreground); opacity: 0.75; overflow-wrap: anywhere; }
</style>
