/**
 * @fileOverview 本地数据仓储测试
 * @description 验证本地数据导出、清空、导入可以恢复业务记录和 Blob 素材。
 * @author strawberrybear
 * @date 2026-06-21
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stylistOfficeDb } from '@/db/database'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import type { CustomAssetRecord } from '@/domain/assets/types'
import type { IssuedCertificate } from '@/domain/certificate/types'
import { createDefaultDraft } from '@/domain/draft/factory'
import {
  clearAllLocalData,
  clearLocalCacheData,
  exportLocalDataBackup,
  exportLocalDataBackupArchive,
  getLocalDataStats,
  importLocalDataBackup,
  importLocalDataBackupArchive,
} from './localDataRepository'

describe('local data repository', () => {
  beforeEach(async () => {
    await stylistOfficeDb.delete()
    await stylistOfficeDb.open()
  })

  afterEach(async () => {
    await stylistOfficeDb.delete()
  })

  it('exports, clears, and restores records with image blobs', async () => {
    const draft = createDefaultDraft('zh-CN')
    const certificate: IssuedCertificate = {
      id: 'issued-local-backup-test',
      certificateNo: 'MC-FLW-A8K3Q2',
      stylistName: '冰沙',
      titleId: 'windtime-collector',
      titleName: '风旅拾光搭配师',
      regionId: 'florawish',
      regionCode: 'FLW',
      avatarId: 'custom-avatar-local-backup-test',
      certificateLocale: 'zh-CN',
      templateId: draft.templateId,
      catalogVersion: draft.catalogVersion,
      issuedDateText: '2026.06.21',
      issuedAt: new Date(2026, 5, 21).toISOString(),
    }
    const customAsset: CustomAssetRecord = {
      id: 'custom-avatar-local-backup-test',
      kind: 'avatar',
      name: '测试头像',
      mimeType: 'image/png',
      width: 32,
      height: 32,
      sha256: 'local-backup-hash',
      createdAt: new Date(2026, 5, 20).toISOString(),
      updatedAt: new Date(2026, 5, 21).toISOString(),
      blob: new Blob(['cropped-avatar'], { type: 'image/png' }),
      originalMimeType: 'image/png',
      originalWidth: 64,
      originalHeight: 64,
      originalBlob: new Blob(['original-avatar'], { type: 'image/png' }),
      cropSelection: {
        x: 1,
        y: 2,
        width: 30,
        height: 30,
      },
      cropTransform: [1, 0, 0, 1, 4, 5],
    }

    await stylistOfficeDb.activeDraft.put(draft)
    await stylistOfficeDb.issuedCertificates.put(certificate)
    await stylistOfficeDb.customAssets.put(customAsset)

    const backup = await exportLocalDataBackup()

    expect(backup.tables.customAssets[0]?.blob.dataUrl).toContain('base64')

    await clearAllLocalData()
    expect(await stylistOfficeDb.customAssets.count()).toBe(0)

    await importLocalDataBackup(backup)

    const restoredAsset = await stylistOfficeDb.customAssets.get(customAsset.id)
    const stats = await getLocalDataStats()

    expect(await stylistOfficeDb.activeDraft.count()).toBe(1)
    expect(await stylistOfficeDb.issuedCertificates.count()).toBe(1)
    expect(restoredAsset?.name).toBe('测试头像')
    expect(await restoredAsset?.blob.text()).toBe('cropped-avatar')
    expect(await restoredAsset?.originalBlob?.text()).toBe('original-avatar')
    expect(stats.totalBytes).toBeGreaterThan(0)
  })

  it('exports and imports zip backup archives', async () => {
    const draft = createDefaultDraft('zh-CN')

    await stylistOfficeDb.activeDraft.put(draft)

    const archive = await exportLocalDataBackupArchive()

    expect(archive.type).toBe('application/zip')

    await clearAllLocalData()
    expect(await stylistOfficeDb.activeDraft.count()).toBe(0)

    await importLocalDataBackupArchive(archive)
    expect(await stylistOfficeDb.activeDraft.count()).toBe(1)
  })

  it('clears rebuildable catalog cache without deleting user records', async () => {
    const draft = createDefaultDraft('zh-CN')

    await stylistOfficeDb.activeDraft.put(draft)
    await stylistOfficeDb.catalogVersions.put({
      catalogVersion: 'catalog-cache-test',
      catalog: associationCatalogSeed,
      cachedAt: new Date(2026, 5, 21).toISOString(),
    })

    await clearLocalCacheData()

    expect(await stylistOfficeDb.activeDraft.count()).toBe(1)
    expect(await stylistOfficeDb.catalogVersions.count()).toBe(0)
  })
})
