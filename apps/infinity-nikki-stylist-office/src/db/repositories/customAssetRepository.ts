/**
 * @fileOverview 自定义素材仓储
 * @description 封装头像和背景自定义素材的 IndexedDB 读写、查重和尺寸补全。
 * @author strawberrybear
 * @date 2026-06-20
 */
import { nanoid } from 'nanoid'
import { stylistOfficeDb } from '@/db/database'
import type {
  CustomAssetCropSelection,
  CustomAssetCropTransform,
  CustomAssetKind,
  CustomAssetRecord,
} from '@/domain/assets/types'

/** 新建自定义头像需要的图片 Blob。 */
export interface CreateCustomAvatarInput {
  /** 用户可编辑素材名称 */
  name: string
  /** 用户未填写名称时使用的当前 UI 语言兜底名 */
  fallbackName: string
  /** 上传原图 Blob */
  originalBlob: Blob
  /** CropperJS 输出的裁剪版 Blob */
  croppedBlob: Blob
  /** CropperJS 裁剪框，用于编辑时恢复裁剪状态 */
  cropSelection?: CustomAssetCropSelection
  /** CropperJS 原图变换矩阵，用于编辑时恢复缩放和平移 */
  cropTransform?: CustomAssetCropTransform
}

/** 更新自定义头像的输入。 */
export interface UpdateCustomAvatarInput {
  /** 素材 ID */
  id: string
  /** 用户可编辑素材名称 */
  name: string
  /** 用户未填写名称时使用的当前 UI 语言兜底名 */
  fallbackName: string
  /** 可选上传原图；缺省时仅更新名称 */
  originalBlob?: Blob
  /** 可选裁剪图；缺省时仅更新名称 */
  croppedBlob?: Blob
  /** 可选裁剪框；缺省时沿用已有裁剪框 */
  cropSelection?: CustomAssetCropSelection
  /** 可选原图变换矩阵；缺省时沿用已有矩阵 */
  cropTransform?: CustomAssetCropTransform
}

/**
 * @description: 计算 Blob SHA-256
 * @description 优先使用 Web Crypto；移动端通过局域网 http 访问时可能不是安全上下文，需要降级哈希保证保存可用。
 * @param {Blob} blob - 待计算的图片 Blob
 * @return {Promise<string>} 十六进制 SHA-256
 */
export async function calculateBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()

  if (globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer)
    const hashBytes = Array.from(new Uint8Array(hashBuffer))

    return hashBytes.map((item) => item.toString(16).padStart(2, '0')).join('')
  }

  const bytes = new Uint8Array(buffer)
  let firstHash = 0x811c9dc5
  let secondHash = 0x27d4eb2d

  bytes.forEach((byte) => {
    firstHash = Math.imul(firstHash ^ byte, 16777619)
    secondHash = Math.imul(secondHash ^ byte, 1597334677)
  })

  return [
    'fallback',
    blob.size.toString(16),
    (firstHash >>> 0).toString(16).padStart(8, '0'),
    (secondHash >>> 0).toString(16).padStart(8, '0'),
  ].join('-')
}

/**
 * @description: 用 HTMLImageElement 读取图片尺寸
 * @description iOS WebKit 对 createImageBitmap 支持不稳定，头像保存需要这个兜底。
 * @param {Blob} blob - 图片 Blob
 * @return {Promise<{ width: number; height: number }>} 图片尺寸
 */
function readImageBlobSizeWithImage(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(imageUrl)

      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Invalid image size'))
        return
      }

      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('Failed to read image size'))
    }
    image.src = imageUrl
  })
}

/**
 * @description: 读取图片尺寸
 * @description 优先使用浏览器原生解码能力，不把尺寸探测逻辑散落到页面组件。
 * @param {Blob} blob - 图片 Blob
 * @return {Promise<{ width: number; height: number }>} 图片尺寸
 */
export async function readImageBlobSize(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)

      try {
        return {
          width: bitmap.width,
          height: bitmap.height,
        }
      } finally {
        bitmap.close()
      }
    } catch {
      // iOS WebKit 或特殊图片格式可能无法走 createImageBitmap，继续使用 img 兜底。
    }
  }

  return readImageBlobSizeWithImage(blob)
}

/**
 * @description: 获取自定义素材列表
 * @description 默认按添加时间倒序返回，素材选择弹窗可直接展示最近添加项。
 * @param {CustomAssetKind} kind - 素材类型
 * @return {Promise<CustomAssetRecord[]>} 自定义素材列表
 */
export async function listCustomAssets(kind: CustomAssetKind): Promise<CustomAssetRecord[]> {
  const assets = await stylistOfficeDb.customAssets.where('kind').equals(kind).toArray()

  return assets.sort((first, second) =>
    (second.updatedAt ?? second.createdAt).localeCompare(first.updatedAt ?? first.createdAt)
  )
}

/**
 * @description: 获取指定自定义素材
 * @description 证书预览按草稿 avatarId 解析自定义头像时使用。
 * @param {string} id - 自定义素材 ID
 * @return {Promise<CustomAssetRecord | undefined>} 自定义素材记录
 */
export async function getCustomAsset(id: string): Promise<CustomAssetRecord | undefined> {
  return stylistOfficeDb.customAssets.get(id)
}

/**
 * @description: 新建自定义头像素材
 * @description 保存原图和裁剪版；如裁剪版重复，则返回已有素材，避免用户库出现重复项。
 * @param {CreateCustomAvatarInput} input - 头像图片信息
 * @return {Promise<CustomAssetRecord>} 新建或复用的自定义头像
 */
export async function createCustomAvatarAsset(
  input: CreateCustomAvatarInput
): Promise<CustomAssetRecord> {
  const sha256 = await calculateBlobSha256(input.croppedBlob)
  const duplicated = await stylistOfficeDb.customAssets.where('sha256').equals(sha256).first()

  if (duplicated?.kind === 'avatar') {
    return duplicated
  }

  const now = new Date().toISOString()
  const croppedSize = await readImageBlobSize(input.croppedBlob)
  const originalSize = await readImageBlobSize(input.originalBlob)
  const record: CustomAssetRecord = {
    id: `custom-avatar-${nanoid()}`,
    kind: 'avatar',
    name: input.name.trim() || input.fallbackName,
    mimeType: input.croppedBlob.type || 'image/png',
    width: croppedSize.width,
    height: croppedSize.height,
    sha256,
    createdAt: now,
    updatedAt: now,
    blob: input.croppedBlob,
    originalMimeType: input.originalBlob.type || 'image/*',
    originalWidth: originalSize.width,
    originalHeight: originalSize.height,
    originalBlob: input.originalBlob,
    cropSelection: input.cropSelection,
    cropTransform: input.cropTransform,
  }

  await stylistOfficeDb.customAssets.put(record)
  return record
}

/**
 * @description: 更新自定义头像素材
 * @description 支持仅改名，也支持替换原图并重新裁剪。
 * @param {UpdateCustomAvatarInput} input - 更新信息
 * @return {Promise<CustomAssetRecord>} 更新后的头像
 */
export async function updateCustomAvatarAsset(
  input: UpdateCustomAvatarInput
): Promise<CustomAssetRecord> {
  const existing = await stylistOfficeDb.customAssets.get(input.id)

  if (!existing || existing.kind !== 'avatar') {
    throw new Error('Custom avatar asset not found')
  }

  const now = new Date().toISOString()
  const nextRecord: CustomAssetRecord = {
    ...existing,
    name: input.name.trim() || input.fallbackName,
    updatedAt: now,
  }

  if (input.originalBlob && input.croppedBlob) {
    const croppedSize = await readImageBlobSize(input.croppedBlob)
    const originalSize = await readImageBlobSize(input.originalBlob)

    nextRecord.mimeType = input.croppedBlob.type || 'image/png'
    nextRecord.width = croppedSize.width
    nextRecord.height = croppedSize.height
    nextRecord.sha256 = await calculateBlobSha256(input.croppedBlob)
    nextRecord.blob = input.croppedBlob
    nextRecord.originalMimeType = input.originalBlob.type || 'image/*'
    nextRecord.originalWidth = originalSize.width
    nextRecord.originalHeight = originalSize.height
    nextRecord.originalBlob = input.originalBlob
    nextRecord.cropSelection = input.cropSelection
    nextRecord.cropTransform = input.cropTransform
  }

  await stylistOfficeDb.customAssets.put(nextRecord)
  return nextRecord
}

/**
 * @description: 删除自定义素材
 * @param {string} id - 素材 ID
 * @return {Promise<void>} 无返回值
 */
export async function deleteCustomAsset(id: string): Promise<void> {
  await stylistOfficeDb.customAssets.delete(id)
}
