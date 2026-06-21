<script setup lang="ts">
/**
 * @description: ProfileLocalDataPanel - 个人中心本地数据页签
 * @description 提供 IndexedDB 数据统计、导出、导入和清空能力。
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  clearAllLocalData,
  clearLocalCacheData,
  exportLocalDataBackupArchive,
  getLocalDataStats,
  importLocalDataBackupArchive,
  type LocalDataStats,
} from '@/db/repositories/localDataRepository'
import {
  clearOfflineResourceCaches,
  estimateOfflineResourceCacheBytes,
} from '@/domain/offline/cache'

const { t } = useI18n()

/** 当前容量统计。 */
const stats = ref<LocalDataStats | null>(null)
/** 可重建离线资源缓存容量。 */
const offlineCacheBytes = ref(0)
/** 文件输入引用。 */
const fileInputRef = ref<HTMLInputElement | null>(null)
/** 是否正在执行异步操作。 */
const isBusy = ref(false)
/** 清空确认层开关。 */
const isClearDialogOpen = ref(false)
/** 清除缓存确认层开关。 */
const isClearCacheDialogOpen = ref(false)
/** 页面级反馈文案。 */
const notice = ref<{ type: 'success' | 'error'; message: string } | null>(null)

/** 数据表展示行。 */
const tableRows = computed(() => stats.value?.tables ?? [])
/** 开发服务下禁用离线缓存，避免 Service Worker 影响 Vite HMR。 */
const isOfflineCacheDisabledInDev = import.meta.env.DEV
/** 浏览器配额展示。 */
const browserCapacityText = computed(() => {
  if (!stats.value) {
    return '--'
  }

  if (stats.value.browserUsageBytes == null || stats.value.browserQuotaBytes == null) {
    return t('profile.localDataCapacityFallback', {
      used: formatBytes(stats.value.totalBytes + offlineCacheBytes.value),
    })
  }

  return t('profile.localDataCapacityValue', {
    used: formatBytes(stats.value.browserUsageBytes),
    quota: formatBytes(stats.value.browserQuotaBytes),
  })
})
/** 离线资源缓存展示文案。 */
const offlineCacheText = computed(() =>
  isOfflineCacheDisabledInDev
    ? t('profile.localDataOfflineCacheDevDisabled')
    : formatBytes(offlineCacheBytes.value)
)

/**
 * @description: 格式化字节数
 * @param {number} bytes - 字节数
 * @return {string} 友好容量文案
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

/**
 * @description: 读取最新容量统计
 * @return {Promise<void>} 无返回值
 */
async function refreshStats(): Promise<void> {
  const [nextStats, nextCacheBytes] = await Promise.all([
    getLocalDataStats(),
    estimateOfflineResourceCacheBytes(),
  ])

  stats.value = nextStats
  offlineCacheBytes.value = nextCacheBytes
}

/**
 * @description: 生成导出文件名
 * @return {string} 文件名
 */
function createExportFilename(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const timestamp = [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join('_')

  return `nikki-stylist-office-backup-${timestamp}.zip`
}

/**
 * @description: 导出本地数据
 * @return {Promise<void>} 无返回值
 */
async function exportData(): Promise<void> {
  isBusy.value = true
  notice.value = null

  try {
    const blob = await exportLocalDataBackupArchive()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = createExportFilename()
    link.click()
    URL.revokeObjectURL(url)
    notice.value = { type: 'success', message: t('profile.localDataExportSuccess') }
  } catch (error) {
    notice.value = {
      type: 'error',
      message: error instanceof Error ? error.message : t('profile.localDataExportFailed'),
    }
  } finally {
    isBusy.value = false
  }
}

/**
 * @description: 打开导入文件选择器
 * @return {void} 无返回值
 */
function openImportPicker(): void {
  fileInputRef.value?.click()
}

/**
 * @description: 读取并导入用户选择的备份文件
 * @param {Event} event - input change 事件
 * @return {Promise<void>} 无返回值
 */
async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  input.value = ''

  if (!file) {
    return
  }

  isBusy.value = true
  notice.value = null

  try {
    await importLocalDataBackupArchive(file)
    await refreshStats()
    notice.value = { type: 'success', message: t('profile.localDataImportSuccess') }
  } catch {
    notice.value = { type: 'error', message: t('profile.localDataImportFailed') }
  } finally {
    isBusy.value = false
  }
}

/**
 * @description: 清除可重建缓存
 * @return {Promise<void>} 无返回值
 */
async function confirmClearCache(): Promise<void> {
  isBusy.value = true
  notice.value = null

  try {
    await Promise.all([clearLocalCacheData(), clearOfflineResourceCaches()])
    await refreshStats()
    isClearCacheDialogOpen.value = false
    notice.value = { type: 'success', message: t('profile.localDataCacheClearSuccess') }
  } catch (error) {
    notice.value = {
      type: 'error',
      message: error instanceof Error ? error.message : t('profile.localDataCacheClearFailed'),
    }
  } finally {
    isBusy.value = false
  }
}

/**
 * @description: 清空全部本地业务数据
 * @return {Promise<void>} 无返回值
 */
async function confirmClearData(): Promise<void> {
  isBusy.value = true
  notice.value = null

  try {
    await clearAllLocalData()
    localStorage.removeItem('stylist-office-draft-session')
    await refreshStats()
    isClearDialogOpen.value = false
    notice.value = { type: 'success', message: t('profile.localDataClearSuccess') }
  } catch (error) {
    notice.value = {
      type: 'error',
      message: error instanceof Error ? error.message : t('profile.localDataClearFailed'),
    }
  } finally {
    isBusy.value = false
  }
}

onMounted(() => {
  void refreshStats()
})
</script>

<template>
  <section class="profile-local-data">
    <v-alert
      v-if="notice"
      :type="notice.type"
      variant="tonal"
      density="comfortable"
      closable
      @click:close="notice = null"
    >
      {{ notice.message }}
    </v-alert>

    <div class="profile-local-data__overview">
      <div class="profile-local-data__metric">
        <span>{{ t('profile.localDataUsed') }}</span>
        <strong>{{ stats ? formatBytes(stats.totalBytes) : '--' }}</strong>
      </div>
      <div class="profile-local-data__metric">
        <span>{{ t('profile.localDataCapacity') }}</span>
        <strong>{{ browserCapacityText }}</strong>
      </div>
      <div class="profile-local-data__metric">
        <span>{{ t('profile.localDataOfflineCache') }}</span>
        <strong>{{ offlineCacheText }}</strong>
        <small v-if="isOfflineCacheDisabledInDev">
          {{ t('profile.localDataOfflineCacheDevHint') }}
        </small>
      </div>
    </div>

    <div class="profile-local-data__actions">
      <v-btn
        color="primary"
        variant="flat"
        prepend-icon="mdi-download-outline"
        :loading="isBusy"
        data-sound="primary"
        @click="exportData"
      >
        {{ t('profile.localDataExport') }}
      </v-btn>
      <v-btn
        color="primary"
        variant="outlined"
        prepend-icon="mdi-upload-outline"
        :disabled="isBusy"
        data-sound="open"
        @click="openImportPicker"
      >
        {{ t('profile.localDataImport') }}
      </v-btn>
      <v-btn
        color="error"
        variant="tonal"
        prepend-icon="mdi-cached"
        :disabled="isBusy"
        data-sound="danger"
        @click="isClearCacheDialogOpen = true"
      >
        {{ t('profile.localDataClearCache') }}
      </v-btn>
      <v-btn
        color="error"
        variant="outlined"
        prepend-icon="mdi-delete-alert-outline"
        :disabled="isBusy"
        data-sound="danger"
        @click="isClearDialogOpen = true"
      >
        {{ t('profile.localDataClear') }}
      </v-btn>
      <input
        ref="fileInputRef"
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        class="profile-local-data__file-input"
        @change="handleImportFile"
      />
    </div>

    <v-table density="comfortable" class="profile-local-data__table">
      <thead>
        <tr>
          <th>{{ t('profile.localDataTableName') }}</th>
          <th>{{ t('profile.localDataTableCount') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in tableRows" :key="row.name">
          <td>{{ t(`profile.localDataTable.${row.name}`) }}</td>
          <td>{{ row.count }}</td>
        </tr>
      </tbody>
    </v-table>

    <v-dialog v-model="isClearDialogOpen" max-width="480">
      <v-card class="profile-local-data__dialog">
        <v-card-title class="text-[18px] font-[820] text-[var(--color-foreground)]">
          {{ t('profile.localDataClearTitle') }}
        </v-card-title>
        <v-card-text class="text-[var(--color-muted-dark)]">
          {{ t('profile.localDataClearMessage') }}
        </v-card-text>
        <v-card-actions class="justify-end border-t border-[#ef5f8f]/15 px-5 py-4">
          <v-btn variant="text" data-sound="back" @click="isClearDialogOpen = false">
            {{ t('common.action.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="isBusy"
            data-sound="danger"
            @click="confirmClearData"
          >
            {{ t('profile.localDataClearConfirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isClearCacheDialogOpen" max-width="480">
      <v-card class="profile-local-data__dialog">
        <v-card-title class="text-[18px] font-[820] text-[var(--color-foreground)]">
          {{ t('profile.localDataClearCacheTitle') }}
        </v-card-title>
        <v-card-text class="text-[var(--color-muted-dark)]">
          {{ t('profile.localDataClearCacheMessage') }}
        </v-card-text>
        <v-card-actions class="justify-end border-t border-[#ef5f8f]/15 px-5 py-4">
          <v-btn variant="text" data-sound="back" @click="isClearCacheDialogOpen = false">
            {{ t('common.action.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="isBusy"
            data-sound="danger"
            @click="confirmClearCache"
          >
            {{ t('profile.localDataClearCacheConfirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.profile-local-data {
  display: grid;
  gap: 16px;
}

.profile-local-data__overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.profile-local-data__metric {
  display: grid;
  gap: 6px;
  padding: 16px;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.74);
}

.profile-local-data__metric span {
  color: var(--color-muted-dark);
  font-size: 12px;
  font-weight: 720;
}

.profile-local-data__metric strong {
  color: var(--color-foreground);
  font-size: 20px;
  font-weight: 840;
}

.profile-local-data__metric small {
  color: var(--color-muted-dark);
  font-size: 11px;
  font-weight: 620;
  line-height: 1.45;
}

.profile-local-data__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.profile-local-data__file-input {
  display: none;
}

.profile-local-data__table {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.78);
}

.profile-local-data__dialog {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background: #fff9fc;
}

.profile-local-data__table :deep(th),
.profile-local-data__table :deep(td) {
  color: var(--color-foreground);
}

@media (max-width: 680px) {
  .profile-local-data__overview {
    grid-template-columns: 1fr;
  }
}
</style>
