/** 恢复和迁移共用编辑保护；数据提交后保持锁定，直到原生进程重新启动。 */
import { h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataOperationGuard } from '@/composables/useDataOperationGuard'
import { captureTemplateDrafts } from '@/lib/dataManagementBrowser'
import { dataManagement, type PreparedRestore } from '@/lib/dataManagement'
import SnapshotDetails from './SnapshotDetails.vue'
import { useSettingsConfirm } from './useSettingsConfirm'

export function useDataRestore() {
  const { t } = useI18n()
  const confirm = useSettingsConfirm()
  const guard = useDataOperationGuard()
  const needsRestart = ref(false)
  const recoveryRequired = ref(false)

  async function changeData(commit: () => Promise<void>): Promise<void> {
    if (!(await guard.prepareDataChange())) return
    let committed = false
    let keepLocked = false
    try {
      await commit()
      committed = true
      needsRestart.value = true
      await dataManagement.restart()
    } catch (error) {
      if (!committed) {
        try {
          keepLocked = await dataManagement.requiresRestart()
        } catch {
          keepLocked = true
        }
        if (keepLocked) {
          needsRestart.value = true
          recoveryRequired.value = true
        }
      }
      throw error
    } finally {
      if (!committed && !keepLocked) guard.finishDataChange()
    }
  }
  async function restore(prepared: PreparedRestore): Promise<void> {
    const accepted = await confirm(
      t('dataManagement.archive.restoreTitle'),
      h('div', { class: 'space-y-4' }, [
        h(SnapshotDetails, { summary: prepared.summary }),
        h(
          'p',
          { class: 'mb-0 text-sm' },
          t(
            `dataManagement.archive.${prepared.summary.kind === 'cloud' ? 'cloudRestoreDescription' : 'restoreDescription'}`
          )
        ),
      ]),
      true
    )
    if (accepted)
      await changeData(() => dataManagement.commitRestore(prepared.token, captureTemplateDrafts()))
  }
  async function migrate(path: string, overwriteDefault: boolean): Promise<void> {
    const accepted = await confirm(
      t('dataManagement.locations.migrateTitle'),
      h('div', { class: 'space-y-3' }, [
        h('p', { class: 'break-all text-xs' }, path),
        h(
          'p',
          { class: 'mb-0' },
          t(
            `dataManagement.locations.${overwriteDefault ? 'defaultDescription' : 'migrateDescription'}`
          )
        ),
      ]),
      overwriteDefault
    )
    if (accepted)
      await changeData(() =>
        dataManagement.migrateDirectory(path, captureTemplateDrafts(), overwriteDefault)
      )
  }
  return { needsRestart, recoveryRequired, restore, migrate, restart: dataManagement.restart }
}
