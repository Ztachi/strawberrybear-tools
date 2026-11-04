/** 数据恢复与迁移的入口，准备失败或取消时不触发原生写入。 */
import { invoke } from '@tauri-apps/api/core'
import { usePlayerStore } from '@/stores/player'
import { useAppUpdater } from './useAppUpdater'
import { useI18n } from 'vue-i18n'
import { finishDataOperation, prepareDataOperation } from '@/features/data-management/operation'

export function useDataOperationGuard() {
  const player = usePlayerStore()
  const updater = useAppUpdater()
  const { t } = useI18n()
  async function prepareDataChange(): Promise<boolean> {
    if (updater.isPreparing.value || updater.isInstalling.value) return false
    if (!(await prepareDataOperation())) return false
    try {
      await invoke('cancel_cloud_sync')
      await player.stopPreviewPlayback()
      await invoke('stop_playback')
      return true
    } catch (error) {
      finishDataOperation()
      throw error
    }
  }
  async function prepareCacheClear(): Promise<boolean> {
    if (
      player.isPreviewPlaying ||
      player.isPreviewPaused ||
      ['playing', 'paused'].includes(player.playbackState.status)
    ) {
      throw new Error(t('dataManagement.cacheBusy'))
    }
    return true
  }
  return { prepareDataChange, finishDataChange: finishDataOperation, prepareCacheClear }
}
