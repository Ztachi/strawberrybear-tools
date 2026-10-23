/** 设置页原生端口替身：浏览器回归不读写用户资料、不连接真实云服务。 */
import {
  DEFAULT_CLOUD_CONFIG,
  DEFAULT_DATA_PREFERENCES,
  type BackupInfo,
  type CloudSyncConfig,
  type SnapshotSummary,
} from '@/lib/dataManagement'

let preferences = structuredClone(DEFAULT_DATA_PREFERENCES)
let cloud = structuredClone(DEFAULT_CLOUD_CONFIG)
const calls: string[] = []
const failCommands = new Set<string>()
let remote: SnapshotSummary | null = null
let restarts = 0
let dialogPath: string | null = null
const summary: SnapshotSummary = {
  formatVersion: 1,
  appVersion: '1.3.3',
  createdAt: 1792713600000,
  deviceName: '验收设备',
  kind: 'local',
  counts: { midi: 4, songLists: 2, templates: 3, projects: 1, drafts: 1 },
}
let backups: BackupInfo[] = []

export const dataManagementFixture = {
  state: () => ({ preferences, cloud, calls: [...calls], backups, restarts, remote }),
  failNext: (command: string) => {
    failCommands.add(command)
  },
  setDialogPath: (path: string | null) => {
    dialogPath = path
  },
  setRemote: () => {
    remote = { ...summary, kind: 'cloud', counts: { ...summary.counts, drafts: 0 } }
  },
}

declare global {
  interface Window {
    dataManagementFixture: typeof dataManagementFixture
  }
}
window.dataManagementFixture = dataManagementFixture

export function mockDataManagementCommand(
  command: string,
  payload: Record<string, unknown> = {}
): { value: unknown } | undefined {
  const commands = [
    'get_data_preferences',
    'save_data_preferences',
    'get_data_locations',
    'open_data_location',
    'list_data_backups',
    'create_data_backup',
    'rename_data_backup',
    'delete_data_backup',
    'export_data_backup',
    'prepare_data_restore',
    'commit_data_restore',
    'migrate_data_directory',
    'clear_data_cache',
    'data_operation_requires_restart',
    'restart_after_data_change',
    'get_cloud_sync_config',
    'save_cloud_sync_config',
    'test_cloud_sync_connection',
    'get_cloud_sync_status',
    'preview_cloud_snapshot',
    'upload_cloud_snapshot',
    'prepare_cloud_restore',
    'cancel_cloud_sync',
    'get_pending_template_drafts',
    'acknowledge_template_drafts',
    'should_show_main_window',
  ]
  if (command === 'plugin:dialog|open' || command === 'plugin:dialog|save')
    return { value: dialogPath }
  if (!commands.includes(command)) return undefined
  calls.push(command)
  if (failCommands.delete(command)) throw new Error('模拟服务不可用')
  switch (command) {
    case 'get_data_preferences':
      return { value: preferences }
    case 'save_data_preferences':
      preferences = structuredClone(payload.preferences as typeof preferences)
      break
    case 'get_data_locations':
      return {
        value: {
          dataDir: '/fixture/data',
          defaultDataDir: '/fixture/default',
          cacheDir: '/fixture/cache',
          logDir: '/fixture/logs',
        },
      }
    case 'list_data_backups':
      return { value: backups }
    case 'create_data_backup': {
      const item = {
        id: `backup-${backups.length + 1}`,
        name: '本地备份',
        createdAt: summary.createdAt,
        size: 1024,
        summary,
      }
      backups = [...backups, item]
      return { value: item }
    }
    case 'rename_data_backup':
      backups = backups.map((item) =>
        item.id === payload.id ? { ...item, name: String(payload.name) } : item
      )
      break
    case 'delete_data_backup':
      backups = backups.filter((item) => item.id !== payload.id)
      break
    case 'prepare_data_restore':
      return { value: { token: 'fixture-local-restore', summary } }
    case 'prepare_cloud_restore':
      return {
        value: { token: 'fixture-cloud-restore', summary: remote ?? { ...summary, kind: 'cloud' } },
      }
    case 'get_cloud_sync_config':
      return { value: cloud }
    case 'save_cloud_sync_config': {
      cloud = structuredClone(payload.config as CloudSyncConfig)
      const password = payload.password as { action: string }
      const secret = payload.secretKey as { action: string }
      if (password.action !== 'keep') cloud.webdav.hasPassword = password.action === 'replace'
      if (secret.action !== 'keep') cloud.s3.hasSecretKey = secret.action === 'replace'
      return { value: cloud }
    }
    case 'get_cloud_sync_status':
      return { value: { phase: 'idle', lastSyncAt: null, lastError: null, pending: false } }
    case 'preview_cloud_snapshot':
      return { value: remote }
    case 'upload_cloud_snapshot':
      remote = { ...summary, kind: 'cloud', counts: { ...summary.counts, drafts: 0 } }
      break
    case 'restart_after_data_change':
      restarts += 1
      break
    case 'get_pending_template_drafts':
      return { value: null }
    case 'data_operation_requires_restart':
      return { value: false }
    case 'should_show_main_window':
      return { value: true }
  }
  return { value: undefined }
}
