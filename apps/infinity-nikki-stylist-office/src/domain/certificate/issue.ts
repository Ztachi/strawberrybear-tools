/**
 * @fileOverview 正本签发领域工具
 * @description 负责正式编号生成、签发快照组装和渲染字段映射。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { formatCertificateDate } from './format'
import type { LocaleCode, RegionOption, TitleOption } from '@/domain/catalog/types'
import type { IssuedCertificate } from './types'
import type { CertificateDraft } from '@/domain/draft/types'
import { normalizeDraftImageTransform } from '@/domain/draft/imageTransform'

/** 正式证书短码字符集，避开容易混淆的 I/O/1/0。 */
export const CERTIFICATE_RANDOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 正式证书短码长度。 */
export const CERTIFICATE_RANDOM_CODE_LENGTH = 6

/** 正式证书编号格式。 */
export const ISSUED_CERTIFICATE_NO_PATTERN = /^MC-[A-Z]{3}-[A-HJ-NP-Z2-9]{6}$/

export interface IssuedCertificateDraftContext {
  /** 草稿绑定的登记地区 */
  region: RegionOption
  /** 草稿绑定的称号 */
  title: TitleOption
}

export interface BuildIssuedCertificateSnapshotInput {
  /** 本地证书 ID */
  id: string
  /** 正式证书编号 */
  certificateNo: string
  /** 需要封存的草稿 */
  draft: CertificateDraft
  /** 当前草稿解析出的资料库实体 */
  context: IssuedCertificateDraftContext
  /** 签发时间 */
  issuedAt: Date
}

export interface CertificateRenderFieldValues extends Record<string, string> {
  /** 头像字段只由图片渲染器消费，这里保持字段稳定性 */
  avatar: string
  /** 搭配师姓名 */
  name: string
  /** 正式证书编号 */
  certificateNo: string
  /** 称号文案 */
  title: string
  /** 签发日期 */
  issuedDate: string
}

/**
 * @description: 创建正式证书短随机码
 * @description 支持注入随机字节，便于单元测试稳定验证字符映射。
 * @param {Uint8Array} [randomBytes] - 可选随机字节
 * @return {string} 6 位短码
 */
export function createCertificateRandomCode(randomBytes?: Uint8Array): string {
  const bytes =
    randomBytes ?? crypto.getRandomValues(new Uint8Array(CERTIFICATE_RANDOM_CODE_LENGTH))

  return Array.from({ length: CERTIFICATE_RANDOM_CODE_LENGTH }, (_, index) => {
    const byte = bytes[index] ?? 0
    return CERTIFICATE_RANDOM_CODE_ALPHABET[byte % CERTIFICATE_RANDOM_CODE_ALPHABET.length]
  }).join('')
}

/**
 * @description: 格式化正式证书编号
 * @param {string} regionCode - 登记地区三位代码
 * @param {string} randomCode - 去重后的短随机码
 * @return {string} 正式证书编号
 */
export function formatIssuedCertificateNo(regionCode: string, randomCode: string): string {
  return `MC-${regionCode.toUpperCase()}-${randomCode.toUpperCase()}`
}

/**
 * @description: 解析签发所需的资料库上下文
 * @description 草稿里的 ID 必须能匹配当前资料库，否则不允许正式签发。
 * @param {CertificateDraft} draft - 当前办理草稿
 * @return {IssuedCertificateDraftContext} 地区与称号实体
 */
export function resolveIssuedCertificateDraftContext(
  draft: CertificateDraft
): IssuedCertificateDraftContext {
  const region = associationCatalogSeed.regions.find((item) => item.id === draft.regionId)
  const title = associationCatalogSeed.titleOptions.find((item) => item.id === draft.titleId)

  if (!region) {
    throw new Error('Certificate region not found')
  }

  if (!title) {
    throw new Error('Certificate title not found')
  }

  return { region, title }
}

/**
 * @description: 生成已签发证书快照
 * @description 签发后页面只读取快照，不再反向依赖之后可能变化的草稿或资料库。
 * @param {BuildIssuedCertificateSnapshotInput} input - 快照组装输入
 * @return {IssuedCertificate} 已签发证书记录
 */
export function buildIssuedCertificateSnapshot(
  input: BuildIssuedCertificateSnapshotInput
): IssuedCertificate {
  const locale: LocaleCode = input.draft.certificateLocale
  const issuedAtText = formatCertificateDate(input.issuedAt)

  return {
    id: input.id,
    certificateNo: input.certificateNo,
    stylistName: input.draft.stylistName,
    titleId: input.context.title.id,
    titleName: resolveLocalizedText(input.context.title.name, locale),
    regionId: input.context.region.id,
    regionCode: input.context.region.code,
    avatarId: input.draft.avatarId,
    avatarTransform: normalizeDraftImageTransform(input.draft.avatarTransform),
    certificateLocale: locale,
    templateId: input.draft.templateId,
    catalogVersion: input.draft.catalogVersion,
    issuedDateText: issuedAtText,
    issuedAt: input.issuedAt.toISOString(),
  }
}

/**
 * @description: 组装正本渲染字段
 * @description 字段 ID 与模板 manifest.fields.id 保持一致，便于远程模板复用渲染器。
 * @param {IssuedCertificate} certificate - 已签发证书快照
 * @return {CertificateRenderFieldValues} 渲染字段值
 */
export function buildCertificateRenderFieldValues(
  certificate: IssuedCertificate
): CertificateRenderFieldValues {
  return {
    avatar: '',
    name: certificate.stylistName,
    certificateNo: certificate.certificateNo,
    title: certificate.titleName,
    issuedDate: certificate.issuedDateText,
  }
}
