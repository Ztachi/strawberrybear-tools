/**
 * @fileOverview 签章展示资源仓储
 * @description 统一解析协会签章和自定义签章的展示名、图片 URL 与临时资源清理。
 * @author strawberrybear
 * @date 2026-06-25
 */
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { getCustomAsset } from '@/db/repositories/customAssetRepository'
import { getOfficialSignatureImageSource } from '@/domain/assets/officialAssets'
import { resolveLocalizedText } from '@/domain/catalog/text'
import type { LocaleCode } from '@/domain/catalog/types'

export interface SignatureDisplaySource {
  /** 用户可读的签章名称 */
  name: string
  /** 可直接用于 img 的图片地址 */
  imageSrc: string
  /** 是否来自用户自定义资料库 */
  isCustom: boolean
  /** 释放 Blob URL */
  cleanup: () => void
}

/**
 * @description: 解析签章展示资源
 * @description 官方签章随证书语言换图，自定义签章会创建 Blob URL，调用方离开页面前需 cleanup。
 * @param {string} signatureId - 签章 ID
 * @param {LocaleCode} locale - 当前展示语言
 * @return {Promise<SignatureDisplaySource>} 签章展示资源
 */
export async function resolveSignatureDisplaySource(
  signatureId: string,
  locale: LocaleCode
): Promise<SignatureDisplaySource> {
  const officialSignature = associationCatalogSeed.officialSignatures.find(
    (item) => item.id === signatureId
  )

  if (officialSignature) {
    return {
      name: resolveLocalizedText(officialSignature.name, locale),
      imageSrc: getOfficialSignatureImageSource(officialSignature.id, locale),
      isCustom: false,
      cleanup: () => {},
    }
  }

  const customSignature = await getCustomAsset(signatureId)

  if (!customSignature || customSignature.kind !== 'signature') {
    return {
      name: '',
      imageSrc: '',
      isCustom: false,
      cleanup: () => {},
    }
  }

  const imageSrc = URL.createObjectURL(customSignature.blob)

  return {
    name: customSignature.name,
    imageSrc,
    isCustom: true,
    cleanup: () => URL.revokeObjectURL(imageSrc),
  }
}
