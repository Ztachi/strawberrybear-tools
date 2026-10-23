/** 数据管理与云同步的类型化 IPC；凭据只以明确的保留、替换或清除意图提交。 */
import { invoke } from '@tauri-apps/api/core'

export type DataLocationKind = 'data' | 'cache' | 'logs'
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'
export interface DataPreferences {
  backupIntervalHours: number
  backupKeep: number
  logsEnabled: boolean
  logLevel: LogLevel
  autoCheckUpdates: boolean
  launchOnStartup: boolean
  silentStartup: boolean
}
export type SaveDataPreferences = (patch: Partial<DataPreferences>) => Promise<boolean>
export const DEFAULT_DATA_PREFERENCES: DataPreferences = {
  backupIntervalHours: 24,
  backupKeep: 10,
  logsEnabled: true,
  logLevel: 'info',
  autoCheckUpdates: true,
  launchOnStartup: false,
  silentStartup: false,
}
export interface DataLocations {
  dataDir: string
  defaultDataDir: string
  cacheDir: string
  logDir: string
}
export interface SnapshotSummary {
  formatVersion: number
  appVersion: string
  createdAt: number
  deviceName: string
  kind: 'local' | 'cloud'
  counts: { midi: number; songLists: number; templates: number; projects: number; drafts: number }
}
export interface BackupInfo {
  id: string
  name: string
  createdAt: number
  size: number
  summary: SnapshotSummary
}
export interface PreparedRestore {
  token: string
  summary: SnapshotSummary
}
export type TemplateDrafts = Record<string, string>
export type CloudProvider = 'webdav' | 's3'
export interface CloudSyncConfig {
  provider: CloudProvider
  enabled: boolean
  autoUpload: boolean
  webdav: {
    preset: string
    baseUrl: string
    username: string
    remoteRoot: string
    profile: string
    hasPassword: boolean
  }
  s3: {
    preset: string
    region: string
    bucket: string
    accessKeyId: string
    endpoint: string
    remoteRoot: string
    profile: string
    hasSecretKey: boolean
  }
}
export interface CloudSyncStatus {
  phase: 'idle' | 'testing' | 'uploading' | 'downloading'
  lastSyncAt: number | null
  lastError: string | null
  pending: boolean
}
export interface SecretUpdate {
  action: 'keep' | 'replace' | 'clear'
  value?: string
}
export const DEFAULT_CLOUD_CONFIG: CloudSyncConfig = {
  provider: 'webdav',
  enabled: false,
  autoUpload: false,
  webdav: {
    preset: 'custom',
    baseUrl: '',
    username: '',
    remoteRoot: 'infinity-nikki-player-sync',
    profile: 'default',
    hasPassword: false,
  },
  s3: {
    preset: 'aws-s3',
    region: '',
    bucket: '',
    accessKeyId: '',
    endpoint: '',
    remoteRoot: 'infinity-nikki-player-sync',
    profile: 'default',
    hasSecretKey: false,
  },
}
export const EMPTY_CLOUD_STATUS: CloudSyncStatus = {
  phase: 'idle',
  lastSyncAt: null,
  lastError: null,
  pending: false,
}

/** 只把显式的数据字段传入 IPC，不让界面响应式代理跨越平台边界。 */
function cloudConfigValue(config: CloudSyncConfig): CloudSyncConfig {
  return { ...config, webdav: { ...config.webdav }, s3: { ...config.s3 } }
}

export const dataManagement = {
  getPreferences: (): Promise<DataPreferences> => invoke('get_data_preferences'),
  savePreferences: (preferences: DataPreferences): Promise<void> =>
    invoke('save_data_preferences', { preferences }),
  getLocations: (): Promise<DataLocations> => invoke('get_data_locations'),
  openLocation: (kind: DataLocationKind): Promise<void> => invoke('open_data_location', { kind }),
  listBackups: (): Promise<BackupInfo[]> => invoke('list_data_backups'),
  createBackup: (drafts: TemplateDrafts): Promise<BackupInfo> =>
    invoke('create_data_backup', { drafts }),
  renameBackup: (id: string, name: string): Promise<void> =>
    invoke('rename_data_backup', { id, name }),
  deleteBackup: (id: string): Promise<void> => invoke('delete_data_backup', { id }),
  exportBackup: (path: string, drafts: TemplateDrafts): Promise<void> =>
    invoke('export_data_backup', { path, drafts }),
  prepareRestore: (source: { path?: string; backupId?: string }): Promise<PreparedRestore> =>
    invoke('prepare_data_restore', source),
  commitRestore: (token: string, drafts: TemplateDrafts): Promise<void> =>
    invoke('commit_data_restore', { token, drafts }),
  migrateDirectory: (
    path: string,
    drafts: TemplateDrafts,
    overwriteDefault = false
  ): Promise<void> => invoke('migrate_data_directory', { path, drafts, overwriteDefault }),
  clearCache: (): Promise<void> => invoke('clear_data_cache'),
  requiresRestart: (): Promise<boolean> => invoke('data_operation_requires_restart'),
  restart: (): Promise<void> => invoke('restart_after_data_change'),
  getCloudConfig: (): Promise<CloudSyncConfig> => invoke('get_cloud_sync_config'),
  saveCloudConfig: (
    config: CloudSyncConfig,
    password: SecretUpdate,
    secretKey: SecretUpdate
  ): Promise<CloudSyncConfig> =>
    invoke('save_cloud_sync_config', { config: cloudConfigValue(config), password, secretKey }),
  testCloudConnection: (
    config: CloudSyncConfig,
    password: SecretUpdate,
    secretKey: SecretUpdate
  ): Promise<void> =>
    invoke('test_cloud_sync_connection', { config: cloudConfigValue(config), password, secretKey }),
  getCloudStatus: (): Promise<CloudSyncStatus> => invoke('get_cloud_sync_status'),
  previewCloudSnapshot: (): Promise<SnapshotSummary | null> => invoke('preview_cloud_snapshot'),
  uploadCloudSnapshot: (): Promise<void> => invoke('upload_cloud_snapshot'),
  prepareCloudRestore: (): Promise<PreparedRestore> => invoke('prepare_cloud_restore'),
  cancelCloudSync: (): Promise<void> => invoke('cancel_cloud_sync'),
}
