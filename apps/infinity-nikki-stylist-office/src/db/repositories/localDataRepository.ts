/**
 * @fileOverview 本地数据仓储
 * @description 负责 IndexedDB 业务数据的统计、导入、导出和清空。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  stylistOfficeDb,
  type CatalogCacheRecord,
  type CertificateImageRecord,
  type LocalSettingRecord,
} from '@/db/database'
import type { CustomAssetRecord } from '@/domain/assets/types'
import type { IssuedCertificate } from '@/domain/certificate/types'
import type { CertificateDraft } from '@/domain/draft/types'

const BACKUP_SCHEMA_VERSION = 1
const BACKUP_APP_ID = 'infinity-nikki-stylist-office'
const BACKUP_JSON_FILENAME = 'nikki-stylist-office-backup.json'

/** 导出文件中 Blob 的 JSON 表示。 */
interface SerializedBlobValue {
  /** Blob 标记，用于导入时做轻量校验 */
  __type: 'Blob'
  /** Blob MIME 类型 */
  type: string
  /** base64 data URL 内容 */
  dataUrl: string
  /** 原始字节数 */
  size: number
}

/** 可导出的自定义素材记录。 */
type SerializedCustomAssetRecord = Omit<CustomAssetRecord, 'blob' | 'originalBlob'> & {
  /** 裁剪图 Blob */
  blob: SerializedBlobValue
  /** 上传原图 Blob */
  originalBlob?: SerializedBlobValue
}

/** 可导出的历史正本图片记录，仅用于兼容旧数据。 */
type SerializedCertificateImageRecord = Omit<CertificateImageRecord, 'blob'> & {
  /** 旧版正本 PNG Blob */
  blob: SerializedBlobValue
}

/** 本地数据完整备份。 */
export interface LocalDataBackup {
  /** 备份格式版本 */
  schemaVersion: number
  /** 应用标识 */
  appId: typeof BACKUP_APP_ID
  /** 导出时间 */
  exportedAt: string
  /** IndexedDB 表数据 */
  tables: {
    /** 唯一办理草稿 */
    activeDraft: CertificateDraft[]
    /** 已签发证书元数据 */
    issuedCertificates: IssuedCertificate[]
    /** 自定义素材 */
    customAssets: SerializedCustomAssetRecord[]
    /** 协会资料库缓存 */
    catalogVersions: CatalogCacheRecord[]
    /** 旧版正本图片 */
    certificateImages: SerializedCertificateImageRecord[]
    /** 本地设置 */
    settings: LocalSettingRecord[]
  }
}

/** 本地数据表统计。 */
export interface LocalDataTableStat {
  /** 表名 */
  name: keyof LocalDataBackup['tables']
  /** 记录数量 */
  count: number
}

/** 本地数据容量统计。 */
export interface LocalDataStats {
  /** 本应用 IndexedDB 估算字节数 */
  totalBytes: number
  /** 浏览器当前源已使用容量 */
  browserUsageBytes?: number
  /** 浏览器当前源可用配额 */
  browserQuotaBytes?: number
  /** 各表记录数 */
  tables: LocalDataTableStat[]
  /** 统计时间 */
  measuredAt: string
}

/**
 * @description: 将 Uint8Array 转成独立 ArrayBuffer
 * @param {Uint8Array} bytes - 压缩后的字节
 * @return {ArrayBuffer} 可安全传给 Blob 的缓冲
 */
function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * @description: 计算对象 JSON 字节数
 * @param {unknown} value - 可 JSON 序列化的数据
 * @return {number} UTF-8 字节数
 */
function jsonByteSize(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size
}

/**
 * @description: 将 ArrayBuffer 编码为 base64
 * @param {ArrayBuffer} buffer - 二进制内容
 * @return {string} base64 字符串
 */
function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize))
  }

  return btoa(binary)
}

/**
 * @description: 将 base64 解码为字节数组
 * @param {string} base64 - base64 字符串
 * @return {Uint8Array} 字节数组
 */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

/**
 * @description: 序列化 Blob 字段
 * @param {Blob} blob - 待导出 Blob
 * @return {Promise<SerializedBlobValue>} 可写入 JSON 的 Blob
 */
async function serializeBlob(blob: Blob): Promise<SerializedBlobValue> {
  return {
    __type: 'Blob',
    type: blob.type,
    dataUrl: `data:${blob.type || 'application/octet-stream'};base64,${encodeBase64(await blob.arrayBuffer())}`,
    size: blob.size,
  }
}

/**
 * @description: 反序列化 Blob 字段
 * @param {SerializedBlobValue} value - 导入文件中的 Blob 字段
 * @return {Blob} 浏览器 Blob
 */
function deserializeBlob(value: SerializedBlobValue): Blob {
  const commaIndex = value.dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? value.dataUrl.slice(commaIndex + 1) : value.dataUrl
  const bytes = decodeBase64(base64)
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer

  return new Blob([arrayBuffer], { type: value.type })
}

/**
 * @description: 序列化自定义素材记录
 * @param {CustomAssetRecord} asset - Dexie 中的素材记录
 * @return {Promise<SerializedCustomAssetRecord>} 备份文件素材记录
 */
async function serializeCustomAsset(
  asset: CustomAssetRecord
): Promise<SerializedCustomAssetRecord> {
  const { blob, originalBlob, ...metadata } = asset

  return {
    ...metadata,
    blob: await serializeBlob(blob),
    originalBlob: originalBlob ? await serializeBlob(originalBlob) : undefined,
  }
}

/**
 * @description: 还原自定义素材记录
 * @param {SerializedCustomAssetRecord} asset - 备份文件素材记录
 * @return {CustomAssetRecord} Dexie 素材记录
 */
function deserializeCustomAsset(asset: SerializedCustomAssetRecord): CustomAssetRecord {
  const { blob, originalBlob, ...metadata } = asset

  return {
    ...metadata,
    blob: deserializeBlob(blob),
    originalBlob: originalBlob ? deserializeBlob(originalBlob) : undefined,
  }
}

/**
 * @description: 序列化旧版正本图片记录
 * @param {CertificateImageRecord} image - Dexie 中的旧版正本图片
 * @return {Promise<SerializedCertificateImageRecord>} 备份文件图片记录
 */
async function serializeCertificateImage(
  image: CertificateImageRecord
): Promise<SerializedCertificateImageRecord> {
  const { blob, ...metadata } = image

  return {
    ...metadata,
    blob: await serializeBlob(blob),
  }
}

/**
 * @description: 还原旧版正本图片记录
 * @param {SerializedCertificateImageRecord} image - 备份文件图片记录
 * @return {CertificateImageRecord} Dexie 图片记录
 */
function deserializeCertificateImage(
  image: SerializedCertificateImageRecord
): CertificateImageRecord {
  const { blob, ...metadata } = image

  return {
    ...metadata,
    blob: deserializeBlob(blob),
  }
}

/**
 * @description: 判断是否为普通对象
 * @param {unknown} value - 待判断值
 * @return {value is Record<string, unknown>} 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @description: 校验导入文件结构
 * @param {unknown} value - JSON 解析后的未知值
 * @return {asserts value is LocalDataBackup} 结构不合法时抛错
 */
function assertLocalDataBackup(value: unknown): asserts value is LocalDataBackup {
  if (!isRecord(value) || value.appId !== BACKUP_APP_ID || !isRecord(value.tables)) {
    throw new Error('Invalid local data backup')
  }

  const tables = value.tables
  const tableKeys: Array<keyof LocalDataBackup['tables']> = [
    'activeDraft',
    'issuedCertificates',
    'customAssets',
    'catalogVersions',
    'certificateImages',
    'settings',
  ]

  tableKeys.forEach((tableKey) => {
    if (!Array.isArray(tables[tableKey])) {
      throw new Error('Invalid local data backup')
    }
  })
}

/**
 * @description: 获取本地数据容量统计
 * @return {Promise<LocalDataStats>} 容量和表记录数
 */
export async function getLocalDataStats(): Promise<LocalDataStats> {
  const [
    activeDraft,
    issuedCertificates,
    customAssets,
    catalogVersions,
    certificateImages,
    settings,
  ] = await Promise.all([
    stylistOfficeDb.activeDraft.toArray(),
    stylistOfficeDb.issuedCertificates.toArray(),
    stylistOfficeDb.customAssets.toArray(),
    stylistOfficeDb.catalogVersions.toArray(),
    stylistOfficeDb.certificateImages.toArray(),
    stylistOfficeDb.settings.toArray(),
  ])

  const customAssetMetadata = customAssets.map(({ blob, originalBlob, ...metadata }) => metadata)
  const certificateImageMetadata = certificateImages.map(({ blob, ...metadata }) => metadata)
  const blobBytes =
    customAssets.reduce(
      (total, asset) => total + asset.blob.size + (asset.originalBlob?.size ?? 0),
      0
    ) + certificateImages.reduce((total, image) => total + image.blob.size, 0)
  const totalBytes =
    blobBytes +
    jsonByteSize({
      activeDraft,
      issuedCertificates,
      customAssets: customAssetMetadata,
      catalogVersions,
      certificateImages: certificateImageMetadata,
      settings,
    })
  const storageEstimate =
    typeof navigator !== 'undefined' && navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : undefined

  return {
    totalBytes,
    browserUsageBytes: storageEstimate?.usage,
    browserQuotaBytes: storageEstimate?.quota,
    measuredAt: new Date().toISOString(),
    tables: [
      { name: 'activeDraft', count: activeDraft.length },
      { name: 'issuedCertificates', count: issuedCertificates.length },
      { name: 'customAssets', count: customAssets.length },
      { name: 'catalogVersions', count: catalogVersions.length },
      { name: 'certificateImages', count: certificateImages.length },
      { name: 'settings', count: settings.length },
    ],
  }
}

/**
 * @description: 导出本地数据
 * @description Blob 会被转换成 data URL，确保 JSON 文件可跨浏览器导入。
 * @return {Promise<LocalDataBackup>} 可下载保存的备份对象
 */
export async function exportLocalDataBackup(): Promise<LocalDataBackup> {
  const [
    activeDraft,
    issuedCertificates,
    customAssets,
    catalogVersions,
    certificateImages,
    settings,
  ] = await Promise.all([
    stylistOfficeDb.activeDraft.toArray(),
    stylistOfficeDb.issuedCertificates.toArray(),
    stylistOfficeDb.customAssets.toArray(),
    stylistOfficeDb.catalogVersions.toArray(),
    stylistOfficeDb.certificateImages.toArray(),
    stylistOfficeDb.settings.toArray(),
  ])

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appId: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    tables: {
      activeDraft,
      issuedCertificates,
      customAssets: await Promise.all(customAssets.map(serializeCustomAsset)),
      catalogVersions,
      certificateImages: await Promise.all(certificateImages.map(serializeCertificateImage)),
      settings,
    },
  }
}

/**
 * @description: 导出本地数据 zip 备份
 * @description zip 内部仍是结构化 JSON，便于以后增加校验文件和多资源备份。
 * @return {Promise<Blob>} 可下载的 zip 文件
 */
export async function exportLocalDataBackupArchive(): Promise<Blob> {
  const backup = await exportLocalDataBackup()
  const zipBytes = zipSync(
    {
      [BACKUP_JSON_FILENAME]: strToU8(JSON.stringify(backup, null, 2)),
    },
    { level: 6 }
  )

  return new Blob([toStandaloneArrayBuffer(zipBytes)], { type: 'application/zip' })
}

/**
 * @description: 导入本地数据
 * @description 导入会替换当前 IndexedDB 业务表，调用方需要二次确认后再执行。
 * @param {unknown} value - JSON 解析后的备份对象
 * @return {Promise<void>} 无返回值
 */
export async function importLocalDataBackup(value: unknown): Promise<void> {
  assertLocalDataBackup(value)

  const customAssets = value.tables.customAssets.map(deserializeCustomAsset)
  const certificateImages = value.tables.certificateImages.map(deserializeCertificateImage)

  await stylistOfficeDb.transaction(
    'rw',
    [
      stylistOfficeDb.activeDraft,
      stylistOfficeDb.issuedCertificates,
      stylistOfficeDb.customAssets,
      stylistOfficeDb.catalogVersions,
      stylistOfficeDb.certificateImages,
      stylistOfficeDb.settings,
    ],
    async () => {
      await Promise.all([
        stylistOfficeDb.activeDraft.clear(),
        stylistOfficeDb.issuedCertificates.clear(),
        stylistOfficeDb.customAssets.clear(),
        stylistOfficeDb.catalogVersions.clear(),
        stylistOfficeDb.certificateImages.clear(),
        stylistOfficeDb.settings.clear(),
      ])

      await Promise.all([
        stylistOfficeDb.activeDraft.bulkPut(value.tables.activeDraft),
        stylistOfficeDb.issuedCertificates.bulkPut(value.tables.issuedCertificates),
        stylistOfficeDb.customAssets.bulkPut(customAssets),
        stylistOfficeDb.catalogVersions.bulkPut(value.tables.catalogVersions),
        stylistOfficeDb.certificateImages.bulkPut(certificateImages),
        stylistOfficeDb.settings.bulkPut(value.tables.settings),
      ])
    }
  )
}

/**
 * @description: 从 zip 备份导入本地数据
 * @param {Blob} file - 用户选择的 zip 文件
 * @return {Promise<void>} 无返回值
 */
export async function importLocalDataBackupArchive(file: Blob): Promise<void> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const backupEntry =
    archive[BACKUP_JSON_FILENAME] ??
    Object.entries(archive).find(([name]) => name.endsWith('.json'))?.[1]

  if (!backupEntry) {
    throw new Error('Invalid local data backup archive')
  }

  await importLocalDataBackup(JSON.parse(strFromU8(backupEntry)) as unknown)
}

/**
 * @description: 清空可重建的本地资料库缓存
 * @description 不删除当前草稿、已签发记录或用户自定义素材。
 * @return {Promise<void>} 无返回值
 */
export async function clearLocalCacheData(): Promise<void> {
  await stylistOfficeDb.catalogVersions.clear()
}

/**
 * @description: 清空所有本地业务数据
 * @return {Promise<void>} 无返回值
 */
export async function clearAllLocalData(): Promise<void> {
  await stylistOfficeDb.transaction(
    'rw',
    [
      stylistOfficeDb.activeDraft,
      stylistOfficeDb.issuedCertificates,
      stylistOfficeDb.customAssets,
      stylistOfficeDb.catalogVersions,
      stylistOfficeDb.certificateImages,
      stylistOfficeDb.settings,
    ],
    async () => {
      await Promise.all([
        stylistOfficeDb.activeDraft.clear(),
        stylistOfficeDb.issuedCertificates.clear(),
        stylistOfficeDb.customAssets.clear(),
        stylistOfficeDb.catalogVersions.clear(),
        stylistOfficeDb.certificateImages.clear(),
        stylistOfficeDb.settings.clear(),
      ])
    }
  )
}
