<script setup lang="ts">
/** 数据设置按存储、传输、备份、同步和维护组织，危险操作共用恢复前保护。 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Switch,
  Tooltip,
  TypographyText,
} from 'antdv-next'
import {
  Download,
  FileDown,
  FolderOpen,
  HardDriveDownload,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import { open, save } from '@tauri-apps/plugin-dialog'
import {
  dataManagement,
  type BackupInfo,
  type DataLocations,
  type DataPreferences,
  type LogLevel,
  type SaveDataPreferences,
} from '@/lib/dataManagement'
import {
  captureTemplateDrafts,
  clearOnlineLibraryCache,
  resetUiPreferences,
} from '@/lib/dataManagementBrowser'
import { useDataOperationGuard } from '@/composables/useDataOperationGuard'
import { useAppUpdater } from '@/composables/useAppUpdater'
import { feedback } from '@/lib/feedback'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import AsyncSettingSelect from './AsyncSettingSelect.vue'
import CloudSyncSettings from './CloudSyncSettings.vue'
import { useSettingsConfirm } from './useSettingsConfirm'
import { useDataRestore } from './useDataRestore'

defineProps<{ preferences: DataPreferences; saving: boolean; loaded: boolean; savePreferences: SaveDataPreferences }>()
const emit = defineEmits<{ preferences: [patch: Partial<DataPreferences>] }>()
const { t, locale } = useI18n()
const updater = useAppUpdater()
const confirm = useSettingsConfirm()
const { prepareCacheClear } = useDataOperationGuard()
const restorer = useDataRestore()
const locations = ref<DataLocations | null>(null)
const backups = ref<BackupInfo[]>([])
const operation = ref('')
const loading = ref(true)
const loadError = ref('')
const cloud = ref<InstanceType<typeof CloudSyncSettings> | null>(null)
const renameTarget = ref<BackupInfo | null>(null)
const renameName = ref('')
const restarting = ref(false)
const disabled = computed(
  () =>
    loading.value ||
    Boolean(operation.value) ||
    restorer.needsRestart.value ||
    Boolean(cloud.value?.operationActive)
)
const logOptions = computed(() =>
  (['error', 'warn', 'info', 'debug', 'trace'] as const).map((value) => ({
    value,
    label: t(`dataManagement.logs.levels.${value}`),
  }))
)
const intervalOptions = computed(() =>
  [0, 6, 12, 24, 48, 168].map((value) => ({
    value,
    label:
      value === 0 ? t('dataManagement.backup.off') : value === 168 ? t('dataManagement.backup.week') : `${value} ${t('dataManagement.backup.hours')}`,
  }))
)
const keepOptions = computed(() =>
  [3, 5, 10, 15, 20, 30, 50].map((value) => ({
    value,
    label: `${value} ${t('dataManagement.backup.copies')}`,
  }))
)
const date = (value: number): string => new Date(value).toLocaleString(locale.value)
const size = (value: number): string =>
  value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    ;[locations.value, backups.value] = await Promise.all([
      dataManagement.getLocations(),
      dataManagement.listBackups(),
    ])
  } catch (error) {
    loadError.value = String(error)
  } finally {
    loading.value = false
  }
}
async function run(key: string, action: () => Promise<void>): Promise<boolean> {
  if (operation.value || restorer.needsRestart.value) return false
  operation.value = key
  try {
    await action()
    return true
  } catch (error) {
    feedback.error(t('dataManagement.operationFailed'), { description: String(error) })
    return false
  } finally {
    operation.value = ''
  }
}
async function createBackup(): Promise<void> {
  await run('backup', async () => {
    await dataManagement.createBackup(captureTemplateDrafts())
    backups.value = await dataManagement.listBackups()
    feedback.success(t('dataManagement.backup.created'))
  })
}
async function exportData(): Promise<void> {
  await run('export', async () => {
    const path = await save({
      defaultPath: `infinity-nikki-${new Date().toISOString().slice(0, 10)}.nikki-backup.zip`,
      filters: [{ name: t('dataManagement.archive.filter'), extensions: ['zip'] }],
    })
    if (!path) return
    await dataManagement.exportBackup(path, captureTemplateDrafts())
    feedback.success(t('dataManagement.archive.exported'))
  })
}
async function importData(backupId?: string): Promise<void> {
  await run('restore', async () => {
    const path = backupId
      ? undefined
      : await open({
          multiple: false,
          filters: [{ name: t('dataManagement.archive.filter'), extensions: ['zip'] }],
        })
    if (!backupId && typeof path !== 'string') return
    const prepared = await dataManagement.prepareRestore(
      backupId ? { backupId } : { path: path as string }
    )
    await restorer.restore(prepared)
  })
}
async function changeDirectory(toDefault = false): Promise<void> {
  await run('migrate', async () => {
    if (!locations.value) return
    const path = toDefault
      ? locations.value.defaultDataDir
      : await open({
          directory: true,
          multiple: false,
          title: t('dataManagement.locations.choose'),
        })
    if (typeof path !== 'string' || path === locations.value.dataDir) return
    await restorer.migrate(path, toDefault)
  })
}
async function deleteBackup(backup: BackupInfo): Promise<void> {
  if (
    !(await confirm(
      t('dataManagement.backup.deleteTitle'),
      t('dataManagement.backup.deleteDescription'),
      true
    ))
  )
    return
  await run('delete', async () => {
    await dataManagement.deleteBackup(backup.id)
    backups.value = await dataManagement.listBackups()
  })
}
function renameBackup(backup: BackupInfo): void {
  renameTarget.value = backup
  renameName.value = backup.name
}
async function commitRename(): Promise<void> {
  const target = renameTarget.value
  if (!target || !renameName.value.trim()) return
  if (
    await run('rename', async () => {
      await dataManagement.renameBackup(target.id, renameName.value.trim())
      backups.value = await dataManagement.listBackups()
    })
  )
    renameTarget.value = null
}
async function clearCache(): Promise<void> {
  if (
    !(await confirm(
      t('dataManagement.maintenance.clearCacheTitle'),
      t('dataManagement.maintenance.clearCacheDescription')
    ))
  )
    return
  await run('cache', async () => {
    if (!(await prepareCacheClear())) return
    await dataManagement.clearCache()
    await clearOnlineLibraryCache()
    feedback.success(t('dataManagement.completed'))
  })
}
async function resetPreferences(): Promise<void> {
  if (
    !(await confirm(
      t('dataManagement.maintenance.resetTitle'),
      t('dataManagement.maintenance.resetDescription')
    ))
  )
    return
  resetUiPreferences()
  feedback.success(t('dataManagement.completed'))
}
async function canClose(): Promise<boolean> {
  if (operation.value || restorer.needsRestart.value) return false
  return (await cloud.value?.canClose()) ?? true
}
async function retryRestart(): Promise<void> {
  if (restarting.value) return
  restarting.value = true
  try {
    await restorer.restart()
  } catch (error) {
    feedback.error(t('dataManagement.operationFailed'), { description: String(error) })
  } finally {
    restarting.value = false
  }
}
defineExpose({ canClose })
onMounted(() => {
  void load()
})
</script>
<template>
  <div class="space-y-3" :aria-busy="loading || Boolean(operation)">
    <Alert
      v-if="loadError"
      type="error"
      show-icon
      :title="t('dataManagement.loadFailed')"
      :description="loadError"
    >
      <template #action>
        <Button size="small" @click="load">
          {{ t('dataManagement.retry') }}
        </Button>
      </template>
    </Alert>
    <Alert
      v-if="restorer.needsRestart.value"
      type="warning"
      show-icon
      :title="t(`dataManagement.locations.${restorer.recoveryRequired.value ? 'repairRequired' : 'restartRequired'}`)"
    >
      <template #action>
        <Button size="small" :loading="restarting" @click="retryRestart">
          {{ t('dataManagement.locations.restart') }}
        </Button>
      </template>
    </Alert>
    <SettingsGroup
      :title="t('dataManagement.locations.title')"
      :description="t('dataManagement.locations.description')"
    >
      <SettingsRow :title="t('dataManagement.locations.data')">
        <Button
          size="small"
          :disabled="disabled || !locations"
          @click="run('open', () => dataManagement.openLocation('data'))"
        >
          <template #icon>
            <FolderOpen :size="14" /> </template
          >{{ t('dataManagement.open') }}
        </Button>
        <Button size="small" :disabled="disabled || !locations" @click="changeDirectory()">
          {{ t('dataManagement.change') }}
        </Button>
        <template #details>
          <TypographyText
            v-if="locations?.dataDir"
            :copyable="{ text: locations.dataDir }"
            class="break-all text-xs"
          >
            {{ locations.dataDir }} </TypographyText
          ><span v-else class="text-xs text-[var(--color-muted-dark)]">{{
            t('dataManagement.loading')
          }}</span>
        </template>
      </SettingsRow>
      <Button
        v-if="locations && locations.dataDir !== locations.defaultDataDir"
        type="link"
        size="small"
        class="self-start"
        :disabled="disabled"
        @click="changeDirectory(true)"
      >
        {{ t('dataManagement.restoreDefault') }}
      </Button>
      <SettingsRow :title="t('dataManagement.locations.cache')">
        <Button
          size="small"
          :disabled="disabled || !locations"
          @click="run('open', () => dataManagement.openLocation('cache'))"
        >
          <template #icon>
            <FolderOpen :size="14" /> </template
          >{{ t('dataManagement.open') }}
        </Button>
        <template #details>
          <TypographyText
            v-if="locations?.cacheDir"
            :copyable="{ text: locations.cacheDir }"
            class="break-all text-xs"
          >
            {{ locations.cacheDir }}
          </TypographyText>
        </template>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup
      :title="t('dataManagement.archive.title')"
      :description="t('dataManagement.archive.description')"
    >
      <div class="flex flex-wrap gap-2">
        <Button
          size="small"
          :disabled="disabled"
          :loading="operation === 'export'"
          @click="exportData"
        >
          <template #icon>
            <Upload :size="14" /> </template
          >{{ t('dataManagement.archive.export') }}
        </Button>
        <Button
          size="small"
          :disabled="disabled"
          :loading="operation === 'restore'"
          @click="importData()"
        >
          <template #icon>
            <Download :size="14" /> </template
          >{{ t('dataManagement.archive.import') }}
        </Button>
      </div>
    </SettingsGroup>
    <SettingsGroup
      :title="t('dataManagement.backup.title')"
      :description="t('dataManagement.backup.description')"
    >
      <template #action>
        <Button
          size="small"
          :disabled="disabled"
          :loading="operation === 'backup'"
          @click="createBackup"
        >
          <template #icon>
            <Plus :size="14" /> </template
          >{{ t('dataManagement.backup.create') }}
        </Button>
      </template>
      <SettingsRow
        :title="t('dataManagement.preferences.backupIntervalHours')"
        :description="t('dataManagement.hints.backupIntervalHours')"
      >
        <template #title>
          <label for="backup-interval">{{
            t('dataManagement.preferences.backupIntervalHours')
          }}</label>
        </template>
        <AsyncSettingSelect
          id="backup-interval"
          :value="preferences.backupIntervalHours"
          :options="intervalOptions"
          class="w-32"
          :disabled="saving || !loaded || disabled"
          :aria-label="t('dataManagement.preferences.backupIntervalHours')"
          :save="(value) => savePreferences({ backupIntervalHours: Number(value) })"
        />
      </SettingsRow>
      <SettingsRow
        :title="t('dataManagement.preferences.backupKeep')"
        :description="t('dataManagement.hints.backupKeep')"
      >
        <template #title>
          <label for="backup-keep">{{ t('dataManagement.preferences.backupKeep') }}</label>
        </template>
        <AsyncSettingSelect
          id="backup-keep"
          :value="preferences.backupKeep"
          :options="keepOptions"
          class="w-24"
          :disabled="saving || !loaded || disabled"
          :aria-label="t('dataManagement.preferences.backupKeep')"
          :save="(value) => savePreferences({ backupKeep: Number(value) })"
        />
      </SettingsRow>
      <Empty
        v-if="!loading && backups.length === 0"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="t('dataManagement.backup.empty')"
      />
      <div v-else class="divide-y divide-primary/10">
        <div
          v-for="backup in backups"
          :key="backup.id"
          class="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
        >
          <div class="min-w-0 flex-1 basis-40">
            <Tooltip :title="backup.name">
              <div class="truncate text-xs font-medium">
                {{ backup.name }}
              </div>
            </Tooltip>
            <div class="mt-0.5 text-xs text-[var(--color-muted-dark)]">
              {{ date(backup.createdAt) }} · {{ size(backup.size) }}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <Button size="small" :disabled="disabled" @click="importData(backup.id)">
              <template #icon>
                <HardDriveDownload :size="14" /> </template
              >{{ t('dataManagement.backup.restore') }}
            </Button>
            <Tooltip :title="t('dataManagement.rename')">
              <Button
                size="small"
                type="text"
                :aria-label="`${t('dataManagement.rename')} ${backup.name}`"
                :disabled="disabled"
                @click="renameBackup(backup)"
              >
                {{ t('dataManagement.rename') }}
              </Button>
            </Tooltip>
            <Tooltip :title="t('actions.delete')">
              <Button
                size="small"
                type="text"
                danger
                :aria-label="`${t('actions.delete')} ${backup.name}`"
                :disabled="disabled"
                @click="deleteBackup(backup)"
              >
                <template #icon>
                  <Trash2 :size="14" />
                </template>
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </SettingsGroup>
    <CloudSyncSettings ref="cloud" :disabled="disabled" :restore="restorer.restore" />
    <SettingsGroup :title="t('dataManagement.logs.title')">
      <SettingsRow
        :title="t('dataManagement.preferences.logsEnabled')"
        :description="t('dataManagement.hints.logsEnabled')"
      >
        <Switch
          :checked="preferences.logsEnabled"
          :disabled="saving || !loaded || disabled"
          :aria-label="t('dataManagement.preferences.logsEnabled')"
          @update:checked="emit('preferences', { logsEnabled: Boolean($event) })"
        />
      </SettingsRow>
      <SettingsRow
        :title="t('dataManagement.preferences.logLevel')"
        :description="t('dataManagement.hints.logLevel')"
      >
        <template #title>
          <label for="log-level">{{ t('dataManagement.preferences.logLevel') }}</label> </template
        ><AsyncSettingSelect
          id="log-level"
          :value="preferences.logLevel"
          :options="logOptions"
          class="w-28"
          :disabled="saving || !loaded || disabled || !preferences.logsEnabled"
          :aria-label="t('dataManagement.preferences.logLevel')"
          :save="(value) => savePreferences({ logLevel: value as LogLevel })"
        />
      </SettingsRow>
      <div class="flex flex-wrap gap-2">
        <Button
          size="small"
          :disabled="disabled"
          @click="run('logs', () => dataManagement.openLocation('logs'))"
        >
          <template #icon>
            <FolderOpen :size="14" /> </template
          >{{ t('dataManagement.logs.open') }}
        </Button>
        <Button size="small" :disabled="disabled" @click="updater.exportDiagnostics">
          <template #icon>
            <FileDown :size="14" /> </template
          >{{ t('dataManagement.logs.export') }}
        </Button>
      </div>
      <TypographyText
        v-if="locations?.logDir"
        :copyable="{ text: locations.logDir }"
        class="break-all text-xs"
      >
        {{ locations.logDir }}
      </TypographyText>
    </SettingsGroup>
    <SettingsGroup :title="t('dataManagement.maintenance.title')">
      <SettingsRow
        :title="t('dataManagement.maintenance.clearCache')"
        :description="t('dataManagement.maintenance.clearCacheHint')"
      >
        <Button
          size="small"
          :disabled="disabled"
          :loading="operation === 'cache'"
          @click="clearCache"
        >
          <template #icon>
            <Trash2 :size="14" /> </template
          >{{ t('dataManagement.maintenance.clearCache') }}
        </Button>
      </SettingsRow>
      <SettingsRow
        :title="t('dataManagement.maintenance.resetPreferences')"
        :description="t('dataManagement.maintenance.resetPreferencesHint')"
      >
        <Button size="small" :disabled="disabled" @click="resetPreferences">
          <template #icon>
            <RotateCcw :size="14" /> </template
          >{{ t('dataManagement.maintenance.resetPreferences') }}
        </Button>
      </SettingsRow>
      <Button
        size="small"
        type="text"
        class="self-start"
        :disabled="disabled"
        @click="run('refresh', load)"
      >
        <template #icon>
          <RefreshCw :size="14" /> </template
        >{{ t('dataManagement.refresh') }}
      </Button>
    </SettingsGroup>
    <Modal
      :open="Boolean(renameTarget)"
      :title="t('dataManagement.backup.renameTitle')"
      :ok-text="t('actions.save')"
      :cancel-text="t('actions.cancel')"
      :ok-button-props="{ disabled: !renameName.trim(), autoInsertSpace: false }"
      :cancel-button-props="{ autoInsertSpace: false }"
      :confirm-loading="operation === 'rename'"
      centered
      @cancel="renameTarget = null"
      @ok="commitRename"
    >
      <label class="mb-2 block text-sm" for="backup-name">{{ t('dataManagement.name') }}</label
      ><Input
        id="backup-name"
        v-model:value="renameName"
        :maxlength="120"
        @press-enter="commitRename"
      />
    </Modal>
  </div>
</template>
