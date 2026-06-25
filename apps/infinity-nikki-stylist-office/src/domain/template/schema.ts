/**
 * @fileOverview 证书模板 manifest 校验模型
 * @description 使用 Zod 拦截模板包字段缺失、坐标无效和编辑器声明错误。
 * @author strawberrybear
 * @date 2026-06-20
 */
import { z } from 'zod'
import { localeCodeSchema } from '@/domain/catalog/schema'

/** 坐标点必须为 `[x, y]`，单位为模板基准像素。 */
const pointSchema = z.tuple([z.number().nonnegative(), z.number().nonnegative()])

/** 四语言底图映射，文件名相对模板包入口解析。 */
const localeImageRecordSchema = z.object({
  'zh-CN': z.string().min(1),
  'zh-TW': z.string().min(1),
  'en-US': z.string().min(1),
  'ja-JP': z.string().min(1),
})

/** 热区矩形，允许比实际文字/图片更宽，提升触屏点击容错。 */
const rectSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
})

/** 按语言微调字段坐标，适配不同底图文字标签的视觉基线。 */
const localePositionOffsetSchema = z.partialRecord(
  localeCodeSchema,
  z.object({
    x: z.number().optional(),
    y: z.number().optional(),
  })
)

/** 文字样式校验，当前只保留证书动态值需要的最小样式集。 */
const textStyleSchema = z.object({
  fontSize: z.number().positive(),
  fontFamily: z.string().min(1),
  fontWeight: z.number().positive(),
  color: z.string().min(1),
  align: z.enum(['left', 'center', 'right']),
  lineHeight: z.number().positive(),
  verticalAlign: z.enum(['baseline', 'middle']).optional(),
})

/** 图片字段遮罩校验，当前用于头像圆顶拱门形状。 */
const imageMaskSchema = z.object({
  shape: z.enum(['roundedArch']),
  borderRadius: z.string().min(1),
})

/** 单个动态字段校验。 */
const templateFieldSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['image', 'text']),
    source: z.string().min(1),
    editable: z.boolean(),
    editor: z.enum(['avatar', 'name', 'region', 'title', 'signature']).optional(),
    position: pointSchema,
    localePositionOffset: localePositionOffsetSchema.optional(),
    contentWidth: z.number().positive().optional(),
    size: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional(),
    imageMask: imageMaskSchema.optional(),
    customImageScale: z.number().positive().max(1).optional(),
    hitArea: rectSchema,
    textStyle: textStyleSchema.optional(),
  })
  .superRefine((field, context) => {
    if (field.kind === 'image' && !field.size) {
      context.addIssue({
        code: 'custom',
        message: 'image fields must provide size',
        path: ['size'],
      })
    }

    if (field.kind === 'text' && !field.textStyle) {
      context.addIssue({
        code: 'custom',
        message: 'text fields must provide textStyle',
        path: ['textStyle'],
      })
    }

    if (field.editable && !field.editor) {
      context.addIssue({
        code: 'custom',
        message: 'editable fields must provide editor',
        path: ['editor'],
      })
    }
  })

/** 模板包 manifest 顶层校验。 */
export const certificateTemplateManifestSchema = z
  .object({
    schemaVersion: z.string().min(1),
    templateId: z.string().min(1),
    name: z.partialRecord(localeCodeSchema, z.string().min(1)),
    baseSize: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    localeImages: localeImageRecordSchema,
    fields: z.array(templateFieldSchema).min(1),
  })
  .superRefine((manifest, context) => {
    const ids = new Set<string>()

    manifest.fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate field id: ${field.id}`,
          path: ['fields', index, 'id'],
        })
      }

      ids.add(field.id)
    })
  })

export type CertificateTemplateManifestInput = z.input<typeof certificateTemplateManifestSchema>
