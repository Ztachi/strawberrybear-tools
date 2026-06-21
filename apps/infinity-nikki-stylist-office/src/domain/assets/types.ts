/**
 * @fileOverview 自定义素材领域类型
 * @description 定义用户上传头像和背景在 IndexedDB 中的元数据。
 * @author strawberrybear
 * @date 2026-06-18
 */

/** 用户自定义素材类型。 */
export type CustomAssetKind = 'avatar' | 'background'

/** 自定义头像裁剪框，使用 CropperJS 画布坐标。 */
export interface CustomAssetCropSelection {
  /** 裁剪框横坐标 */
  x: number
  /** 裁剪框纵坐标 */
  y: number
  /** 裁剪框宽度 */
  width: number
  /** 裁剪框高度 */
  height: number
}

/** CropperJS 图片变换矩阵，记录原图平移、缩放和旋转状态。 */
export type CustomAssetCropTransform = readonly [number, number, number, number, number, number]

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
  /** 裁剪后可直接用于证书的 MIME 类型 */
  mimeType: string
  /** 裁剪后图片宽度 */
  width: number
  /** 裁剪后图片高度 */
  height: number
  /** 裁剪版图片内容哈希，用于重复素材检测 */
  sha256: string
  /** 添加时间 ISO 字符串 */
  createdAt: string
  /** 最近修改时间 ISO 字符串；旧数据缺失时读取层会回退 createdAt */
  updatedAt?: string
  /** 裁剪后图片 Blob 本体，证书预览和正本渲染直接消费 */
  blob: Blob
  /** 原图 MIME 类型，保留后续模板比例变化时重新裁剪的可能 */
  originalMimeType?: string
  /** 原图宽度 */
  originalWidth?: number
  /** 原图高度 */
  originalHeight?: number
  /** 上传原图 Blob 本体 */
  originalBlob?: Blob
  /** 最近一次裁剪框，用于编辑时回显裁剪状态 */
  cropSelection?: CustomAssetCropSelection
  /** 最近一次原图变换矩阵，用于编辑时精确回显缩放和平移状态 */
  cropTransform?: CustomAssetCropTransform
}
