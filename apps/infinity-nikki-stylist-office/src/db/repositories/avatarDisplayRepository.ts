/**
 * @fileOverview 头像展示资源仓储
 * @description 统一解析协会头像和自定义头像的展示名、图片 URL 与临时资源清理。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { getCustomAsset } from '@/db/repositories/customAssetRepository'
import { getOfficialAssetImageSource } from '@/domain/assets/officialAssets'
import { resolveLocalizedText } from '@/domain/catalog/text'
import type { LocaleCode } from '@/domain/catalog/types'

export interface AvatarDisplaySource {
  /** 用户可读的头像名称 */
  name: string
  /** 可直接用于 img 的图片地址 */
  imageSrc: string
  /** 是否来自用户自定义资料库 */
  isCustom: boolean
  /** 释放 Blob URL */
  cleanup: () => void
}

/**
 * @description: 解析头像展示资源
 * @description 官方头像返回静态资源 URL，自定义头像会创建 Blob URL，调用方离开页面前需 cleanup。
 * @param {string} avatarId - 头像 ID
 * @param {LocaleCode} locale - 当前展示语言
 * @return {Promise<AvatarDisplaySource>} 头像展示资源
 */
export async function resolveAvatarDisplaySource(
  avatarId: string,
  locale: LocaleCode
): Promise<AvatarDisplaySource> {
  const officialAvatar = associationCatalogSeed.officialAvatars.find((item) => item.id === avatarId)

  if (officialAvatar) {
    return {
      name: resolveLocalizedText(officialAvatar.name, locale),
      imageSrc: getOfficialAssetImageSource(officialAvatar.assetId),
      isCustom: false,
      cleanup: () => {},
    }
  }

  const customAvatar = await getCustomAsset(avatarId)

  if (!customAvatar) {
    return {
      name: '',
      imageSrc: '',
      isCustom: false,
      cleanup: () => {},
    }
  }

  const imageSrc = URL.createObjectURL(customAvatar.blob)

  return {
    name: customAvatar.name,
    imageSrc,
    isCustom: true,
    cleanup: () => URL.revokeObjectURL(imageSrc),
  }
}
