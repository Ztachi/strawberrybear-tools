/**
 * @fileOverview 自定义素材裁剪配置
 * @description 从证书模板 manifest 中解析头像与签章的裁剪比例和导出尺寸。
 * @author strawberrybear
 * @date 2026-06-25
 */
import type { CustomAssetKind } from './types'
import type { CertificateTemplateManifest } from '@/domain/template/types'

/** 当前自定义资料页支持裁剪的素材类型。 */
export type CroppableCustomAssetKind = Extract<CustomAssetKind, 'avatar' | 'signature'>

/** 自定义头像缺省按正方形裁剪，匹配旧数据和无模板兜底。 */
export const DEFAULT_AVATAR_CROP_ASPECT_RATIO = 1

/** 自定义签章缺省按内置签章源素材比例裁剪。 */
export const DEFAULT_SIGNATURE_CROP_ASPECT_RATIO = 2172 / 724

/** 自定义素材裁剪导出的长边尺寸。 */
export const CUSTOM_ASSET_OUTPUT_MAX_SIDE = 1024

/**
 * @description: 获取素材类型缺省裁剪比例
 * @param {CroppableCustomAssetKind} kind - 自定义素材类型
 * @return {number} 裁剪宽高比
 */
export function getDefaultCustomAssetCropAspectRatio(kind: CroppableCustomAssetKind): number {
  return kind === 'signature'
    ? DEFAULT_SIGNATURE_CROP_ASPECT_RATIO
    : DEFAULT_AVATAR_CROP_ASPECT_RATIO
}

/**
 * @description: 计算安全裁剪比例
 * @param {number | undefined} width - 宽度
 * @param {number | undefined} height - 高度
 * @param {number} fallback - 缺省比例
 * @return {number} 有效宽高比
 */
function resolveSafeAspectRatio(
  width: number | undefined,
  height: number | undefined,
  fallback: number
): number {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return fallback
  }

  return width / height
}

/**
 * @description: 从模板 manifest 解析自定义素材裁剪比例
 * @description 签章必须优先使用 signatureImageSourceSize，不能回退成头像字段比例。
 * @param {CertificateTemplateManifest} manifest - 当前模板 manifest
 * @param {CroppableCustomAssetKind} kind - 自定义素材类型
 * @return {number} 裁剪宽高比
 */
export function resolveCustomAssetCropAspectRatio(
  manifest: CertificateTemplateManifest,
  kind: CroppableCustomAssetKind
): number {
  const fallback = getDefaultCustomAssetCropAspectRatio(kind)
  const fieldId = kind === 'signature' ? 'chairmanSignature' : 'avatar'
  const field = manifest.fields.find((item) => item.id === fieldId)

  if (kind === 'signature') {
    return resolveSafeAspectRatio(
      field?.signatureImageSourceSize?.width ?? field?.size?.width,
      field?.signatureImageSourceSize?.height ?? field?.size?.height,
      fallback
    )
  }

  return resolveSafeAspectRatio(field?.size?.width, field?.size?.height, fallback)
}

/**
 * @description: 根据裁剪比例计算导出尺寸
 * @param {number} aspectRatio - 宽高比
 * @param {number} maxSide - 导出长边尺寸
 * @return {{ width: number; height: number }} 导出尺寸
 */
export function resolveCustomAssetOutputSize(
  aspectRatio: number,
  maxSide = CUSTOM_ASSET_OUTPUT_MAX_SIDE
): { width: number; height: number } {
  const safeRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DEFAULT_AVATAR_CROP_ASPECT_RATIO

  if (safeRatio >= 1) {
    return {
      width: maxSide,
      height: Math.round(maxSide / safeRatio),
    }
  }

  return {
    width: Math.round(maxSide * safeRatio),
    height: maxSide,
  }
}
