/**
 * @fileOverview 证书模板 manifest 领域类型
 * @description 定义模板包 JSON 描述的坐标、热区、字段来源和编辑能力。
 * @author strawberrybear
 * @date 2026-06-20
 */
import type { LocaleCode, LocalizedText } from '@/domain/catalog/types'

/** 模板坐标点，单位为模板基准像素。 */
export type TemplatePoint = readonly [number, number]

/** 模板矩形区域，单位为模板基准像素。 */
export interface TemplateRect {
  /** 左上角横坐标 */
  x: number
  /** 左上角纵坐标 */
  y: number
  /** 区域宽度 */
  width: number
  /** 区域高度 */
  height: number
}

/** 模板字段按语言微调的坐标偏移。 */
export type TemplatePositionOffset = Partial<Record<LocaleCode, { x?: number; y?: number }>>

/** 模板字段类型，图片字段和文字字段分开渲染。 */
export type CertificateTemplateFieldKind = 'image' | 'text'

/** 模板字段编辑器类型，由核对页映射到对应弹窗。 */
export type CertificateTemplateEditorKind = 'avatar' | 'name' | 'region' | 'title'

/** 当前内置模板使用的稳定字段 ID，后续远程模板仍允许扩展其他字段。 */
export type BuiltinTemplateFieldId = 'avatar' | 'name' | 'certificateNo' | 'title' | 'issuedDate'

/** 模板文字样式，直接作用于动态文字层。 */
export interface CertificateTemplateTextStyle {
  /** 字号，单位 px */
  fontSize: number
  /** 字体族 */
  fontFamily: string
  /** 字重 */
  fontWeight: number
  /** 文字颜色 */
  color: string
  /** 水平对齐 */
  align: 'left' | 'center' | 'right'
  /** 行高倍率 */
  lineHeight: number
  /** 垂直对齐策略；middle 使用字形实际边界做视觉居中 */
  verticalAlign?: 'baseline' | 'middle'
}

/** 图片字段裁切遮罩。 */
export interface CertificateTemplateImageMask {
  /** 当前模板支持圆顶拱门头像；后续可扩展 circle/path 等形状。 */
  shape: 'roundedArch'
  /** CSS border-radius 值，由模板按头像框造型配置。 */
  borderRadius: string
}

/** 模板动态字段。 */
export interface CertificateTemplateField {
  /** 字段稳定 ID */
  id: string
  /** 字段渲染类型 */
  kind: CertificateTemplateFieldKind
  /** 字段取值来源，例如 stylistName、certificateNo、today */
  source: string
  /** 是否允许用户在核对页点击编辑 */
  editable: boolean
  /** 可编辑字段对应的编辑器 */
  editor?: CertificateTemplateEditorKind
  /** 字段起始坐标；模板底图需要匹配这套统一坐标 */
  position: TemplatePoint
  /** 不同语言底图里动态字段的微调偏移，单位同模板像素。 */
  localePositionOffset?: TemplatePositionOffset
  /** 文字内容最大宽度，超出时按最大可用字号自动缩小 */
  contentWidth?: number
  /** 图片字段渲染尺寸 */
  size?: {
    /** 图片宽度 */
    width: number
    /** 图片高度 */
    height: number
  }
  /** 图片字段裁切遮罩，用来匹配模板头像框形状 */
  imageMask?: CertificateTemplateImageMask
  /** 自定义图片素材显示缩放；用于没有透明背景的头像避免顶满模板框 */
  customImageScale?: number
  /** 点击热区，允许比文字或图片本体略大以提升移动端命中率 */
  hitArea: TemplateRect
  /** 文字字段渲染样式 */
  textStyle?: CertificateTemplateTextStyle
}

/** 证书模板包 manifest。 */
export interface CertificateTemplateManifest {
  /** manifest 契约版本 */
  schemaVersion: string
  /** 对应资料库模板 ID */
  templateId: string
  /** 模板名称 */
  name: LocalizedText
  /** 设计基准尺寸 */
  baseSize: {
    /** 模板宽度 */
    width: number
    /** 模板高度 */
    height: number
  }
  /** 每种证书语言对应的底图文件名 */
  localeImages: Record<LocaleCode, string>
  /** 模板动态字段列表 */
  fields: CertificateTemplateField[]
}

/** 模板包入口，manifest 和素材都从 rootUrl 相对读取。 */
export interface CertificateTemplatePackageEntry {
  /** 对应资料库模板 ID，用于草稿和资料库定位 */
  templateId: string
  /** 模板包根地址，可以是 public 绝对路径、远程 URL 或本地对象 URL 目录 */
  rootUrl: string
}

/** 已解析完成的内置模板包。 */
export interface BuiltinCertificateTemplatePackage {
  /** 模板包入口根地址 */
  rootUrl: string
  /** 已校验的模板 manifest */
  manifest: CertificateTemplateManifest
  /** 每种语言按 manifest 相对路径解析出的底图 URL */
  imageSources: Record<LocaleCode, string>
}
