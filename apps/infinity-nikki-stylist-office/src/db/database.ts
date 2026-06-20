/**
 * @fileOverview IndexedDB 数据库
 * @description 使用 Dexie 管理草稿、正式证书、自定义素材、资料库缓存和正本 PNG。
 * @author strawberrybear
 * @date 2026-06-18
 */
import Dexie, { type Table } from 'dexie'
import type { CustomAssetRecord } from '@/domain/assets/types'
import type { AssociationCatalog } from '@/domain/catalog/types'
import type { IssuedCertificate } from '@/domain/certificate/types'
import type { CertificateDraft } from '@/domain/draft/types'

/** 资料库缓存记录。 */
export interface CatalogCacheRecord {
  /** 资料库版本作为主键 */
  catalogVersion: string
  /** 完整资料库 manifest */
  catalog: AssociationCatalog
  /** 缓存时间 ISO 字符串 */
  cachedAt: string
}

/** 正本 PNG 记录，避免把大型 Blob 放入证书元数据。 */
export interface CertificateImageRecord {
  /** 图片 ID */
  id: string
  /** 所属证书 ID */
  certificateId: string
  /** 图片类型 */
  kind: 'wide' | 'a4'
  /** PNG Blob */
  blob: Blob
  /** 图片宽度 */
  width: number
  /** 图片高度 */
  height: number
}

/** 轻量设置记录，复杂 UI 偏好仍由 Pinia persisted state 管理。 */
export interface LocalSettingRecord {
  /** 设置项 key */
  key: string
  /** 可结构化克隆的设置值 */
  value: unknown
}

/**
 * @description: 应用 IndexedDB 实例
 * @description 所有表结构集中在这里，后续升级必须通过 version migration 显式处理。
 */
class StylistOfficeDatabase extends Dexie {
  /** 唯一办理草稿表 */
  activeDraft!: Table<CertificateDraft, string>
  /** 已签发证书元数据表 */
  issuedCertificates!: Table<IssuedCertificate, string>
  /** 自定义头像与背景表 */
  customAssets!: Table<CustomAssetRecord, string>
  /** 协会资料库缓存表 */
  catalogVersions!: Table<CatalogCacheRecord, string>
  /** 正式证书 PNG 正本表 */
  certificateImages!: Table<CertificateImageRecord, string>
  /** 本地设置兜底表 */
  settings!: Table<LocalSettingRecord, string>

  constructor() {
    super('infinity-nikki-stylist-office')

    // v1 只建立 MVP 需要的业务表；后续字段扩展必须新增 version，避免破坏用户本地数据。
    this.version(1).stores({
      activeDraft: '&id, stage, updatedAt, catalogVersion',
      issuedCertificates: '&id, certificateNo, issuedAt, catalogVersion',
      customAssets: '&id, kind, sha256, createdAt',
      catalogVersions: '&catalogVersion, cachedAt',
      certificateImages: '&id, certificateId, kind',
      settings: '&key',
    })

    // v2 记录自定义头像裁剪状态扩展；新增字段不建索引，表结构保持兼容。
    this.version(2).stores({
      activeDraft: '&id, stage, updatedAt, catalogVersion',
      issuedCertificates: '&id, certificateNo, issuedAt, catalogVersion',
      customAssets: '&id, kind, sha256, createdAt',
      catalogVersions: '&catalogVersion, cachedAt',
      certificateImages: '&id, certificateId, kind',
      settings: '&key',
    })
  }
}

/** 全局共享数据库实例。 */
export const stylistOfficeDb = new StylistOfficeDatabase()
