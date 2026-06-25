/**
 * @fileOverview 已签发证书仓储
 * @description 封装正本签发事务、证书历史读取和按需渲染输入组装。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { nanoid } from 'nanoid'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { stylistOfficeDb, type CertificateImageRecord } from '@/db/database'
import { getCustomAsset } from '@/db/repositories/customAssetRepository'
import {
  getOfficialAssetImageSource,
  getOfficialSignatureImageSource,
} from '@/domain/assets/officialAssets'
import {
  buildCertificateRenderFieldValues,
  buildIssuedCertificateSnapshot,
  createCertificateRandomCode,
  formatIssuedCertificateNo,
  resolveIssuedCertificateDraftContext,
} from '@/domain/certificate/issue'
import type { CertificateRenderInput } from '@/domain/certificate/render'
import { getTemplateImageSource, loadBuiltinTemplatePackage } from '@/domain/template/registry'
import { DEFAULT_DRAFT_IMAGE_TRANSFORM } from '@/domain/draft/imageTransform'
import { normalizeDraft } from '@/domain/draft/factory'
import { DEFAULT_UI_LOCALE } from '@/i18n'
import type { CertificateDraft } from '@/domain/draft/types'
import type { IssuedCertificate } from '@/domain/certificate/types'

export interface IssueCertificateServices {
  /** 当前时间，默认使用真实系统时间。 */
  now?: () => Date
  /** 短随机码生成器，默认使用 crypto。 */
  randomCode?: () => string
  /** 正式编号和字段快照准备完成后的通知，用于仪式舞台提前展示编号。 */
  onCertificatePrepared?: (certificate: IssuedCertificate) => void
}

export interface PreparedCertificateRenderInput {
  /** 可直接交给 Canvas 渲染器的输入 */
  input: CertificateRenderInput
  /** 渲染结束后释放临时资源 */
  cleanup: () => void
}

/**
 * @description: 获取已签发证书
 * @param {string} id - 证书 ID
 * @return {Promise<IssuedCertificate | undefined>} 证书元数据
 */
export async function getIssuedCertificate(id: string): Promise<IssuedCertificate | undefined> {
  return stylistOfficeDb.issuedCertificates.get(id)
}

/**
 * @description: 获取最近签发证书
 * @return {Promise<IssuedCertificate | undefined>} 最近证书
 */
export async function getLatestIssuedCertificate(): Promise<IssuedCertificate | undefined> {
  return stylistOfficeDb.issuedCertificates.orderBy('issuedAt').reverse().first()
}

/**
 * @description: 获取证书签发历史
 * @description 个人中心历史列表按签发时间倒序展示。
 * @return {Promise<IssuedCertificate[]>} 已签发证书列表
 */
export async function listIssuedCertificates(): Promise<IssuedCertificate[]> {
  return stylistOfficeDb.issuedCertificates.orderBy('issuedAt').reverse().toArray()
}

/**
 * @description: 删除已签发证书历史
 * @description 删除证书快照，并清理旧版本可能遗留的本地正本图片。
 * @param {string} certificateId - 证书 ID
 * @return {Promise<void>} 无返回值
 */
export async function deleteIssuedCertificate(certificateId: string): Promise<void> {
  await stylistOfficeDb.transaction(
    'rw',
    stylistOfficeDb.issuedCertificates,
    stylistOfficeDb.certificateImages,
    async () => {
      await stylistOfficeDb.issuedCertificates.delete(certificateId)
      await stylistOfficeDb.certificateImages.where('certificateId').equals(certificateId).delete()
    }
  )
}

/**
 * @description: 获取证书正本图片
 * @description 仅用于兼容旧数据；新签发流程不再把正本 PNG 长期保存到 IndexedDB。
 * @param {string} certificateId - 证书 ID
 * @return {Promise<CertificateImageRecord[]>} wide 在前、A4 在后的图片列表
 */
export async function getCertificateImages(
  certificateId: string
): Promise<CertificateImageRecord[]> {
  const images = await stylistOfficeDb.certificateImages
    .where('certificateId')
    .equals(certificateId)
    .toArray()

  return images.sort((first, second) => {
    const order = { wide: 0, a4: 1 }
    return order[first.kind] - order[second.kind]
  })
}

/**
 * @description: 生成本地唯一正式编号
 * @description 本地归档用 certificateNo 建索引，短码冲突时最多重试 16 次。
 * @param {string} regionCode - 登记地区代码
 * @param {() => string} randomCode - 短码生成器
 * @return {Promise<string>} 去重后的正式编号
 */
async function createUniqueCertificateNo(
  regionCode: string,
  randomCode: () => string
): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const certificateNo = formatIssuedCertificateNo(regionCode, randomCode())
    const duplicated = await stylistOfficeDb.issuedCertificates
      .where('certificateNo')
      .equals(certificateNo)
      .first()

    if (!duplicated) {
      return certificateNo
    }
  }

  throw new Error('Unable to generate unique certificate number')
}

/**
 * @description: 读取待签发草稿
 * @description 只允许当前 activeDraft 的 ID 进入正式签发，避免历史草稿误写。
 * @param {string} draftId - 草稿 ID
 * @return {Promise<CertificateDraft>} 草稿
 */
async function getDraftForSigning(draftId: string): Promise<CertificateDraft> {
  const draft = await stylistOfficeDb.activeDraft.get(draftId)

  if (!draft) {
    throw new Error('Active draft not found')
  }

  return normalizeDraft(draft, draft.certificateLocale ?? DEFAULT_UI_LOCALE)
}

/**
 * @description: 解析头像图片源
 * @description 官方头像直接走 public URL，自定义头像临时创建 Blob URL 并由调用方释放。
 * @param {string} avatarId - 草稿头像 ID
 * @return {Promise<{ src: string; isCustom: boolean; revoke?: () => void }>} 头像渲染源
 */
async function resolveAvatarRenderSource(avatarId: string): Promise<{
  src: string
  isCustom: boolean
  revoke?: () => void
}> {
  const officialAvatar = associationCatalogSeed.officialAvatars.find((item) => item.id === avatarId)

  if (officialAvatar) {
    const src = getOfficialAssetImageSource(officialAvatar.assetId)

    if (!src) {
      throw new Error('Official avatar image source not found')
    }

    return { src, isCustom: false }
  }

  const customAvatar = await getCustomAsset(avatarId)

  if (!customAvatar) {
    throw new Error('Custom avatar not found')
  }

  const src = URL.createObjectURL(customAvatar.blob)

  return {
    src,
    isCustom: true,
    revoke: () => URL.revokeObjectURL(src),
  }
}

/**
 * @description: 解析图片签章源
 * @description 官方签章随证书语言换图，自定义签章临时创建 Blob URL 并由调用方释放。
 * @param {string} signatureId - 签章 ID
 * @param {import('@/domain/catalog/types').LocaleCode} locale - 证书语言
 * @return {Promise<{ src: string; revoke?: () => void }>} 签章渲染源
 */
async function resolveSignatureRenderSource(
  signatureId: string,
  locale: IssuedCertificate['certificateLocale']
): Promise<{
  src: string
  revoke?: () => void
}> {
  const officialSignature = associationCatalogSeed.officialSignatures.find(
    (item) => item.id === signatureId
  )

  if (officialSignature) {
    const src = getOfficialSignatureImageSource(officialSignature.id, locale)

    if (!src) {
      throw new Error('Official signature image source not found')
    }

    return { src }
  }

  const customSignature = await getCustomAsset(signatureId)

  if (!customSignature || customSignature.kind !== 'signature') {
    throw new Error('Custom signature not found')
  }

  const src = URL.createObjectURL(customSignature.blob)

  return {
    src,
    revoke: () => URL.revokeObjectURL(src),
  }
}

/**
 * @description: 将草稿正式签发为证书正本
 * @description 只封存证书字段快照并清空草稿；正本图片在领取或历史查看时即时生成，不长期占用 IndexedDB。
 * @param {string} draftId - 当前办理草稿 ID
 * @param {IssueCertificateServices} [services] - 测试或特殊场景注入的服务
 * @return {Promise<IssuedCertificate>} 已签发证书快照
 */
export async function issueCertificateFromDraft(
  draftId: string,
  services: IssueCertificateServices = {}
): Promise<IssuedCertificate> {
  const draft = await getDraftForSigning(draftId)
  const context = resolveIssuedCertificateDraftContext(draft)
  const issuedAt = services.now?.() ?? new Date()
  const certificateNo = await createUniqueCertificateNo(
    context.region.code,
    services.randomCode ?? createCertificateRandomCode
  )
  const certificate = buildIssuedCertificateSnapshot({
    id: `issued-certificate-${nanoid()}`,
    certificateNo,
    draft,
    context,
    issuedAt,
  })

  services.onCertificatePrepared?.(certificate)

  await stylistOfficeDb.transaction(
    'rw',
    stylistOfficeDb.issuedCertificates,
    stylistOfficeDb.activeDraft,
    async () => {
      await stylistOfficeDb.issuedCertificates.put(certificate)
      await stylistOfficeDb.activeDraft.delete(draftId)
    }
  )

  return certificate
}

/**
 * @description: 准备已签发证书的正本渲染输入
 * @description 生成图片前按证书快照重新解析模板底图和头像资源，调用方必须在渲染后执行 cleanup。
 * @param {IssuedCertificate} certificate - 已签发证书快照
 * @return {Promise<PreparedCertificateRenderInput>} 渲染输入与清理函数
 */
export async function prepareIssuedCertificateRenderInput(
  certificate: IssuedCertificate
): Promise<PreparedCertificateRenderInput> {
  const templatePackage = await loadBuiltinTemplatePackage(certificate.templateId)
  const avatarSource = await resolveAvatarRenderSource(certificate.avatarId)
  const signatureMode = certificate.signatureMode ?? 'text'
  const signatureSource =
    signatureMode === 'image' && certificate.signatureImageId
      ? await resolveSignatureRenderSource(
          certificate.signatureImageId,
          certificate.certificateLocale
        )
      : null

  return {
    input: {
      manifest: templatePackage.manifest,
      locale: certificate.certificateLocale,
      templateImageSrc: getTemplateImageSource(
        templatePackage.manifest,
        templatePackage.imageSources,
        certificate.certificateLocale
      ),
      avatarSrc: avatarSource.src,
      avatarIsCustom: avatarSource.isCustom,
      avatarTransform: certificate.avatarTransform ?? DEFAULT_DRAFT_IMAGE_TRANSFORM,
      signatureMode,
      signatureImageSrc: signatureSource?.src,
      fieldValues: buildCertificateRenderFieldValues(certificate),
    },
    cleanup: () => {
      avatarSource.revoke?.()
      signatureSource?.revoke?.()
    },
  }
}
