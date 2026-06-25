/**
 * @fileOverview 办理草稿领域类型
 * @description 定义唯一办理草稿的轻量字段；大型素材和正本图片不进入 Pinia 持久化。
 * @author strawberrybear
 * @date 2026-06-18
 */
import type { LocaleCode } from '@/domain/catalog/types'

/** 办理草稿当前阶段。 */
export type DraftStage = 'registration' | 'proofing'

/** 旧版模板文字层 ID，仅用于兼容开发阶段历史草稿。 */
export type TemplateTextLayerId =
  | 'certificateTitle'
  | 'name'
  | 'stylistTitle'
  | 'region'
  | 'comment'
  | 'certificateNo'
  | 'president'

/** 旧版模板文字层位置，单位为证书画布百分比。 */
export interface TemplateTextPosition {
  /** 横向位置百分比 */
  x: number
  /** 纵向位置百分比 */
  y: number
}

/** 当前草稿内遗留的模板文字层位置，新核对页以模板 manifest 坐标为准。 */
export type TemplateTextPositions = Partial<Record<TemplateTextLayerId, TemplateTextPosition>>

/** 图片取景参数，后续头像与背景裁切会复用。 */
export interface DraftImageTransform {
  /** 横向偏移百分比 */
  x: number
  /** 纵向偏移百分比 */
  y: number
  /** 缩放倍率 */
  scale: number
}

/**
 * @description: 证书办理草稿
 * @description 这里保存草稿业务字段；头像、背景和模板素材 Blob 由 Dexie 其他表维护。
 */
export interface CertificateDraft {
  /** 唯一草稿 ID，同一设备同一时间只允许一份 */
  id: string
  /** 当前办理阶段 */
  stage: DraftStage
  /** 搭配师姓名 */
  stylistName: string
  /** 会长签章，空字符串时由模板语言默认签章回退 */
  presidentSignature: string
  /** 已选择的称号 ID */
  titleId: string | null
  /** 证书语言，由顶部语言统一控制，姓名等用户输入内容不翻译 */
  certificateLocale: LocaleCode
  /** 当前登记地区 ID */
  regionId: string
  /** 当前协会评语 ID，创建草稿时确定，切换语言只换同 ID 文案 */
  commentId: string
  /** 当前使用的官方或自定义头像 ID */
  avatarId: string
  /** 当前使用的官方或自定义背景 ID */
  backgroundId: string
  /** 当前证书模板 ID */
  templateId: string
  /** 头像取景参数，素材细调阶段会接入实际头像图层 */
  avatarTransform: DraftImageTransform
  /** 背景取景参数，素材细调阶段会接入实际背景图层 */
  backgroundTransform: DraftImageTransform
  /** 兼容旧草稿的模板文字层位置调整，新模板渲染不再读取该字段 */
  templateTextPositions: TemplateTextPositions
  /** 草稿绑定的资料库版本 */
  catalogVersion: string
  /** 创建时间 ISO 字符串 */
  createdAt: string
  /** 最后更新时间 ISO 字符串 */
  updatedAt: string
}
