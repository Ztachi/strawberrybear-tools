/**
 * @fileOverview 自定义素材领域类型
 * @description 定义用户上传头像和背景在 IndexedDB 中的元数据。
 * @author strawberrybear
 * @date 2026-06-18
 */

/** 用户自定义素材类型。 */
export type CustomAssetKind = 'avatar' | 'background'

/**
 * @description: 自定义素材元数据
 * @description Blob 本体保存在 Dexie 的同一条记录中，Pinia 只保存当前选择等轻量状态。
 */
export interface CustomAssetRecord {
  /** 素材 ID */
  id: string
  /** 素材类型 */
  kind: CustomAssetKind
  /** 用户可编辑名称 */
  name: string
  /** MIME 类型 */
  mimeType: string
  /** 图片宽度 */
  width: number
  /** 图片高度 */
  height: number
  /** 图片内容哈希，用于重复素材检测 */
  sha256: string
  /** 添加时间 ISO 字符串 */
  createdAt: string
  /** 图片 Blob 本体 */
  blob: Blob
}
