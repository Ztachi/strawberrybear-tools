/**
 * @fileOverview 协会资料库领域类型
 * @description 定义远程资料库、本地 seed、证书模板、称号、地区和素材的共享数据结构。
 * @author strawberrybear
 * @date 2026-06-18
 */

/** 应用和证书当前支持的语言代码。 */
export type LocaleCode = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP'

/** 多语言文案表；内容型语言未补齐时允许只提供简体中文。 */
export type LocalizedText = Partial<Record<LocaleCode, string>>

/** 资料库支持的图片资源类型。 */
export type CatalogImageKind = 'template-overlay' | 'seal' | 'avatar' | 'background' | 'ornament'

/** 证书模板中的图层类型。 */
export type TemplateLayerType = 'image' | 'background' | 'avatar'

/**
 * @description: 资料库图片资源
 * @description 模板、头像、背景、印章等资源统一通过稳定 ID 引用，便于后台和 R2 分离维护。
 */
export interface CatalogImageAsset {
  /** 稳定资源 ID */
  id: string
  /** 资源业务类型 */
  kind: CatalogImageKind
  /** 相对 manifest 的资源 URL 或绝对 URL */
  url: string
  /** MIME 类型，用于导入校验和缓存策略 */
  mimeType: string
  /** 图片原始宽度 */
  width: number
  /** 图片原始高度 */
  height: number
  /** 可选 SHA-256，用于远程更新时判断资源是否变化 */
  sha256?: string
  /** 可选资源大小，便于资料库页展示占用信息 */
  sizeBytes?: number
  /** 更新时间 ISO 字符串 */
  updatedAt?: string
}

/**
 * @description: 模板文字槽
 * @description 后续证书渲染器会根据这些坐标和样式把用户资料写入 Canvas。
 */
export interface CertificateTextSlot {
  /** 字段 ID，例如 name、certificateNo、stylistTitle */
  id: string
  /** 后台可视化编辑器中的字段名称 */
  label: string
  /** 设计稿坐标 x，基准尺寸为 3840x2160 */
  x: number
  /** 设计稿坐标 y，基准尺寸为 3840x2160 */
  y: number
  /** 文本绘制区域宽度 */
  width: number
  /** 文本绘制区域高度 */
  height: number
  /** 字号，单位 px */
  fontSize: number
  /** 字体族或 fontAssetId 映射后的字体名 */
  fontFamily: string
  /** 文字颜色 */
  color: string
  /** 水平对齐 */
  align: 'left' | 'center' | 'right'
  /** 行高倍率 */
  lineHeight?: number
  /** 固定文案，存在时不从草稿字段取值 */
  value?: string
  /** 业务字段来源，供渲染器把草稿字段映射到模板槽 */
  source?: string
}

/**
 * @description: 证书模板定义
 * @description 模板只描述布局和资源引用，不直接保存用户资料。
 */
export interface CertificateTemplate {
  /** 稳定模板 ID */
  id: string
  /** 模板名称 */
  name: LocalizedText
  /** 设计稿基准尺寸 */
  baseSize: {
    width: number
    height: number
  }
  /** 模板覆盖层资源 ID */
  overlayAssetId: string
  /** 文字槽位配置 */
  textSlots: CertificateTextSlot[]
}

/** 搭配师称号选项，当前在证书中显示为证书等级。 */
export interface TitleOption {
  /** 稳定称号 ID */
  id: string
  /** 多语言称号名称 */
  name: LocalizedText
  /** 多语言风格描述 */
  description: LocalizedText
  /** 装饰符号，用于 MVP 卡片展示 */
  symbol: string
}

/** 登记地区，影响证书显示和编号前缀。 */
export interface RegionOption {
  /** 稳定地区 ID */
  id: string
  /** 地区编号代码，例如 FLW */
  code: string
  /** 多语言地区名称 */
  name: LocalizedText
}

/** 协会评语选项。 */
export interface AssociationComment {
  /** 稳定评语 ID */
  id: string
  /** 多语言评语正文 */
  text: LocalizedText
}

/** 协会内置头像或背景素材引用。 */
export interface OfficialAssetOption {
  /** 稳定选项 ID */
  id: string
  /** 展示名称 */
  name: LocalizedText
  /** 对应 imageAssets 中的资源 ID */
  assetId: string
}

/**
 * @description: 协会资料库 manifest
 * @description 前端本地 seed 和后续后台/R2 JSON 必须保持同一结构。
 */
export interface AssociationCatalog {
  /** JSON 契约版本 */
  schemaVersion: string
  /** 资料库 ID */
  catalogId: string
  /** 资料库内容版本 */
  catalogVersion: string
  /** 默认模板 ID */
  defaultTemplateId: string
  /** 当前资料库声明支持的语言 */
  locales: LocaleCode[]
  /** 证书模板列表 */
  templates: CertificateTemplate[]
  /** 搭配师称号列表 */
  titleOptions: TitleOption[]
  /** 登记地区列表 */
  regions: RegionOption[]
  /** 协会评语列表 */
  comments: AssociationComment[]
  /** 协会头像列表 */
  officialAvatars: OfficialAssetOption[]
  /** 协会背景列表 */
  officialBackgrounds: OfficialAssetOption[]
  /** 图片资源清单 */
  imageAssets: CatalogImageAsset[]
  /** 字体资源清单，当前阶段只保留接口形态 */
  fontAssets: CatalogImageAsset[]
}
