/**
 * @fileOverview 协会资料库校验模型
 * @description 使用 Zod 校验远程 manifest 与本地 seed，确保后台接口格式在进入业务层前被拦截。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { z } from 'zod'

/** 支持的语言枚举，资料库和 UI 语言共享这一组代码。 */
export const localeCodeSchema = z.enum(['zh-CN', 'zh-TW', 'en-US', 'ja-JP'])

/** 多语言字段允许渐进补齐，至少要由业务侧保证 zh-CN 可回退。 */
const localizedTextSchema = z.partialRecord(localeCodeSchema, z.string().min(1))

/** 图片资源校验，尺寸必须为正数，避免无效素材进入 Canvas 渲染链路。 */
const imageAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['template-overlay', 'seal', 'avatar', 'background', 'ornament']),
  url: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  sha256: z.string().optional(),
  sizeBytes: z.number().nonnegative().optional(),
  updatedAt: z.string().optional(),
})

/** 模板文字槽位校验，坐标和尺寸必须显式声明。 */
const textSlotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().positive(),
  fontFamily: z.string().min(1),
  color: z.string().min(1),
  align: z.enum(['left', 'center', 'right']),
  lineHeight: z.number().positive().optional(),
  value: z.string().optional(),
  source: z.string().optional(),
})

/** 证书模板校验，MVP 可以只有一套模板，但数组结构必须支持远程扩展。 */
const templateSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  baseSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  overlayAssetId: z.string().min(1),
  textSlots: z.array(textSlotSchema),
})

/** 称号、地区、评语和官方素材共享的基础校验。 */
const titleOptionSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  description: localizedTextSchema,
  symbol: z.string().min(1),
})

const regionSchema = z.object({
  id: z.string().min(1),
  number: z.string().regex(/^\d{3}$/),
  code: z.string().min(1),
  name: localizedTextSchema,
})

const commentSchema = z.object({
  id: z.string().min(1),
  text: localizedTextSchema,
})

const officialAssetSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  assetId: z.string().min(1),
})

/** 资料库 manifest 顶层校验模型。 */
export const associationCatalogSchema = z.object({
  schemaVersion: z.string().min(1),
  catalogId: z.string().min(1),
  catalogVersion: z.string().min(1),
  defaultTemplateId: z.string().min(1),
  locales: z.array(localeCodeSchema).min(1),
  templates: z.array(templateSchema),
  titleOptions: z.array(titleOptionSchema),
  regions: z.array(regionSchema),
  comments: z.array(commentSchema),
  officialAvatars: z.array(officialAssetSchema),
  officialBackgrounds: z.array(officialAssetSchema),
  imageAssets: z.array(imageAssetSchema),
  fontAssets: z.array(imageAssetSchema),
})

export type AssociationCatalogInput = z.input<typeof associationCatalogSchema>
