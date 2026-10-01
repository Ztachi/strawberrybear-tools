<script setup lang="ts">
/** 关于页的唯一更新入口；失败通过全局通知反馈，弹窗内仅保留恢复操作。 */
import { computed } from 'vue'
import { Button, Dropdown, Progress } from 'antdv-next'
import { Download, RefreshCw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAppUpdater } from '@/composables/useAppUpdater'

const { t } = useI18n()
const updater = useAppUpdater()
const state = updater.state
const downloadMenu = computed(() => ({
  items: [
    { key: 'github', label: t('updater.manualGithub') },
    { key: 'mirror', label: t('updater.manualMirror') },
  ],
  onClick: ({ key }: { key: string | number }) => updater.openReleasePage(key === 'mirror' ? 'mirror' : 'github'),
}))
async function manualDownload(): Promise<void> {
  if (!updater.hasUpdate.value) await updater.openReleasePage('github')
}
const buttonText = computed(() => {
  if (updater.isPreparing.value) return t('updater.preparing')
  if (state.value.phase === 'ready') return t('updater.installNow')
  if (updater.isChecking.value) return t('updater.checking')
  if (updater.isInstalling.value) return t('updater.installing')
  if (updater.isDownloading.value) return t('updater.downloading')
  return t(updater.hasUpdate.value ? 'updater.updateNow' : 'updater.checkNow')
})
const statusText = computed(() => {
  const receipt = state.value.lastInstall
  if (receipt?.outcome === 'notApplied') return t('updater.notAppliedDescription', { version: receipt.targetVersion, current: state.value.currentVersion })
  if (updater.lastError.value || state.value.phase === 'idle' || state.value.phase === 'checking') return ''
  if (state.value.phase === 'available') return t('updater.availableDescription', { version: state.value.targetVersion })
  return t(`updater.phases.${state.value.phase}`)
})
async function update(): Promise<void> {
  if (updater.hasUpdate.value) await updater.downloadAndInstallUpdate()
  else await updater.checkUpdate()
}
</script>

<template>
  <section
    class="flex w-full flex-col gap-2"
    aria-live="polite"
    :aria-label="t('updater.checkNow')"
  >
    <div class="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
      <Button
        size="small"
        :loading="updater.isBusy.value"
        :disabled="updater.isBusy.value"
        @click="update"
      >
        <template #icon>
          <component
            :is="updater.hasUpdate.value ? Download : RefreshCw"
            class="size-3.5"
            :stroke-width="2"
          />
        </template>
        {{ buttonText }}
      </Button>
      <Button
        v-if="updater.isDownloading.value"
        type="link"
        size="small"
        @click="updater.cancelDownload"
      >
        {{ t('updater.cancelDownload') }}
      </Button>
      <Dropdown
        :menu="downloadMenu"
        :trigger="updater.hasUpdate.value ? ['click'] : []"
        :styles="{ root: { width: 'max-content' } }"
      >
        <Button type="link" size="small" @click="manualDownload">
          {{ t('updater.manualDownload') }}
        </Button>
      </Dropdown>
      <Button type="link" size="small" @click="updater.exportDiagnostics">
        {{ t('updater.exportDiagnostics') }}
      </Button>
    </div>
    <p v-if="statusText" class="m-0 text-center text-xs text-[var(--color-muted-dark)]">
      {{ statusText }}
    </p>
    <template v-if="updater.isDownloading.value || state.phase === 'ready'">
      <Progress
        v-if="updater.progress.value !== null"
        :percent="updater.progress.value"
        :status="state.phase === 'ready' ? 'success' : 'active'"
        size="small"
      />
      <p class="m-0 text-center text-xs text-[var(--color-muted-dark)]">
        {{ t(`updater.sources.${state.source ?? 'mirror'}`) }} ·
        {{ (state.downloadedBytes / 1024 / 1024).toFixed(1) }} MB
      </p>
    </template>
  </section>
</template>
