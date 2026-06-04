/**
 * @description: Tauri 官方自动更新状态与操作
 */
import { computed, markRaw, ref, shallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { feedback as toast } from '@/lib/feedback'
import { i18n } from '@/i18n'

const GITHUB_RELEASES_URL = 'https://github.com/Ztachi/strawberrybear-tools/releases'

const isChecking = ref(false)
const isDownloading = ref(false)
const isInstalling = ref(false)
const downloadedBytes = ref(0)
const contentLength = ref<number | null>(null)
const availableUpdate = shallowRef<Update | null>(null)
const lastError = ref<string | null>(null)

const hasUpdate = computed(() => availableUpdate.value !== null)
const progress = computed(() => {
  if (!contentLength.value || contentLength.value <= 0) return null
  return Math.min(100, Math.round((downloadedBytes.value / contentLength.value) * 100))
})
const isBusy = computed(() => isChecking.value || isDownloading.value || isInstalling.value)

function t(key: string, params?: Record<string, unknown>) {
  return i18n.global.t(key, params ?? {})
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function updateDownloadProgress(event: DownloadEvent) {
  if (event.event === 'Started') {
    downloadedBytes.value = 0
    contentLength.value = event.data.contentLength ?? null
    return
  }

  if (event.event === 'Progress') {
    downloadedBytes.value += event.data.chunkLength
    return
  }

  if (event.event === 'Finished' && contentLength.value) {
    downloadedBytes.value = contentLength.value
  }
}

/**
 * @description: 获取应用更新状态和操作
 */
export function useAppUpdater() {
  async function checkUpdate(options: { notifyNoUpdate?: boolean; silent?: boolean } = {}) {
    if (isChecking.value) return availableUpdate.value

    isChecking.value = true
    lastError.value = null

    try {
      const update = await check()
      availableUpdate.value = update ? markRaw(update) : null

      if (update) {
        lastError.value = null
      }

      if (update && !options.silent) {
        toast.info(t('updater.availableTitle'), {
          description: t('updater.availableDescription', { version: update.version }),
        })
      }

      if (!update && options.notifyNoUpdate) {
        toast.success(t('updater.noUpdateTitle'), {
          description: t('updater.noUpdateDescription'),
        })
      }

      return update
    } catch (error) {
      const message = getErrorMessage(error)
      console.warn('[updater] check failed:', message, error)

      if (!options.silent) {
        toast.info(t('updater.noUpdateTitle'), {
          description: t('updater.noUpdateDescription'),
        })
      }

      availableUpdate.value = null
      lastError.value = null
      return null
    } finally {
      isChecking.value = false
    }
  }

  async function downloadAndInstallUpdate() {
    if (!availableUpdate.value || isBusy.value) return

    isDownloading.value = true
    lastError.value = null
    downloadedBytes.value = 0
    contentLength.value = null

    try {
      await availableUpdate.value.downloadAndInstall(updateDownloadProgress)
      isDownloading.value = false
      isInstalling.value = true
      toast.success(t('updater.installedTitle'), {
        description: t('updater.relaunching'),
      })
      await relaunch()
    } catch (error) {
      const message = getErrorMessage(error)
      console.error('[updater] install failed:', error)
      lastError.value = message
      toast.error(t('updater.installFailed'), {
        description: t('updater.installFailedDescription'),
        richColors: true,
      })
    } finally {
      isDownloading.value = false
      isInstalling.value = false
    }
  }

  async function openReleasePage() {
    await invoke('open_url', { url: GITHUB_RELEASES_URL })
  }

  return {
    availableUpdate,
    contentLength,
    downloadedBytes,
    hasUpdate,
    isBusy,
    isChecking,
    isDownloading,
    isInstalling,
    lastError,
    progress,
    checkUpdate,
    downloadAndInstallUpdate,
    openReleasePage,
  }
}
