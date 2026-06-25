/**
 * @fileOverview 草稿创建与兼容补全
 * @description 集中生成唯一办理草稿，避免页面各自拼装默认字段。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { nanoid } from 'nanoid'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import type { LocaleCode } from '@/domain/catalog/types'
import { DEFAULT_DRAFT_IMAGE_TRANSFORM, normalizeDraftImageTransform } from './imageTransform'
import type { CertificateDraft } from './types'

/**
 * @description: 从数组中随机选择一项
 * @description 资料库可能在开发环境被临时裁剪，所以缺失时用 undefined 交给调用方兜底。
 * @param {readonly T[]} items - 候选列表
 * @return {T | undefined} 随机命中的候选项
 */
function pickRandom<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)]
}

/**
 * @description: 创建默认办理草稿
 * @description 只在用户主动开始办理时调用，姓名保持空值，称号随机预选一个方便首屏回显。
 * @param {LocaleCode} locale - 顶部语言当前值，同时作为证书语言
 * @return {CertificateDraft} 可直接写入 Dexie 的草稿
 */
export function createDefaultDraft(locale: LocaleCode): CertificateDraft {
  const now = new Date().toISOString()
  const title =
    pickRandom(associationCatalogSeed.titleOptions) ?? associationCatalogSeed.titleOptions[0]
  const region = pickRandom(associationCatalogSeed.regions) ?? associationCatalogSeed.regions[0]
  const comment = pickRandom(associationCatalogSeed.comments) ?? associationCatalogSeed.comments[0]
  const avatar =
    pickRandom(associationCatalogSeed.officialAvatars) ?? associationCatalogSeed.officialAvatars[0]
  const background =
    pickRandom(associationCatalogSeed.officialBackgrounds) ??
    associationCatalogSeed.officialBackgrounds[0]
  const signature = associationCatalogSeed.officialSignatures[0]

  return {
    id: nanoid(),
    stage: 'registration',
    stylistName: '',
    presidentSignature: '',
    signatureMode: 'image',
    signatureImageId: signature?.id ?? '',
    titleId: title?.id ?? null,
    certificateLocale: locale,
    regionId: region?.id ?? '',
    commentId: comment?.id ?? '',
    avatarId: avatar?.id ?? '',
    backgroundId: background?.id ?? '',
    templateId: associationCatalogSeed.defaultTemplateId,
    avatarTransform: { ...DEFAULT_DRAFT_IMAGE_TRANSFORM },
    backgroundTransform: { ...DEFAULT_DRAFT_IMAGE_TRANSFORM },
    templateTextPositions: {},
    catalogVersion: associationCatalogSeed.catalogVersion,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * @description: 补齐历史草稿字段
 * @description 开发阶段本地 IndexedDB 可能已有旧结构草稿，读取后先补齐再参与页面渲染。
 * @param {CertificateDraft} draft - 从 Dexie 读取到的草稿
 * @param {LocaleCode} fallbackLocale - 缺失语言时使用的顶部语言
 * @return {CertificateDraft} 字段完整的草稿
 */
export function normalizeDraft(
  draft: CertificateDraft,
  fallbackLocale: LocaleCode
): CertificateDraft {
  const defaultDraft = createDefaultDraft(fallbackLocale)
  const presidentSignature =
    typeof draft.presidentSignature === 'string' ? draft.presidentSignature : ''
  const signatureMode =
    draft.signatureMode === 'image' || draft.signatureMode === 'text'
      ? draft.signatureMode
      : presidentSignature.trim()
        ? 'text'
        : defaultDraft.signatureMode

  return {
    ...defaultDraft,
    ...draft,
    certificateLocale: draft.certificateLocale ?? fallbackLocale,
    presidentSignature,
    signatureMode,
    signatureImageId:
      typeof draft.signatureImageId === 'string' && draft.signatureImageId
        ? draft.signatureImageId
        : defaultDraft.signatureImageId,
    titleId: draft.titleId ?? defaultDraft.titleId,
    regionId: draft.regionId ?? defaultDraft.regionId,
    commentId: draft.commentId ?? defaultDraft.commentId,
    avatarId: draft.avatarId ?? defaultDraft.avatarId,
    backgroundId: draft.backgroundId ?? defaultDraft.backgroundId,
    templateId: draft.templateId ?? defaultDraft.templateId,
    avatarTransform: normalizeDraftImageTransform(draft.avatarTransform),
    backgroundTransform: normalizeDraftImageTransform(draft.backgroundTransform),
    templateTextPositions: draft.templateTextPositions ?? {},
  }
}
