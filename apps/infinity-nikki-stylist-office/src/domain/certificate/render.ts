/**
 * @fileOverview 证书正本 Canvas 渲染器
 * @description 按模板 manifest 将底图、头像和动态字段绘制成 wide 与 A4 PNG。
 * @author strawberrybear
 * @date 2026-06-21
 */
import type { CertificateRenderFieldValues } from './issue'
import type { CertificateTemplateField, CertificateTemplateManifest } from '@/domain/template/types'

/** 横版收藏正本规格。 */
export const WIDE_CERTIFICATE_SIZE = {
  width: 3840,
  height: 2160,
} as const

/** A4 横向打印正本规格。 */
export const A4_CERTIFICATE_SIZE = {
  width: 3508,
  height: 2480,
} as const

export interface CertificateRenderInput {
  /** 当前模板 manifest */
  manifest: CertificateTemplateManifest
  /** 当前证书语言对应的底图 URL */
  templateImageSrc: string
  /** 头像 URL，支持 public、blob 和 data URL */
  avatarSrc: string
  /** 头像是否来自用户自定义素材 */
  avatarIsCustom: boolean
  /** 动态字段值 */
  fieldValues: CertificateRenderFieldValues
}

export interface RenderedCertificateImage {
  /** 图片类型 */
  kind: 'wide' | 'a4'
  /** PNG Blob */
  blob: Blob
  /** 图片宽度 */
  width: number
  /** 图片高度 */
  height: number
}

export interface RenderedCertificateImages {
  /** 16:9 横版正本 */
  wide: RenderedCertificateImage
  /** A4 打印正本 */
  a4: RenderedCertificateImage
}

/** 可按需生成的正本规格。 */
export type CertificateRenderKind = RenderedCertificateImage['kind']

/**
 * @description: 加载图片资源
 * @description Canvas 渲染需要等待底图和头像完成解码，避免空白归档。
 * @param {string} src - 图片 URL
 * @return {Promise<HTMLImageElement>} 已加载图片元素
 */
async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load certificate image: ${src}`))
    image.src = src
  })
}

/**
 * @description: 创建画布
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @return {HTMLCanvasElement} 画布
 */
function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  return canvas
}

/**
 * @description: 画布导出 PNG Blob
 * @param {HTMLCanvasElement} canvas - 待导出的画布
 * @return {Promise<Blob>} PNG Blob
 */
async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to export certificate PNG'))
        return
      }

      resolve(blob)
    }, 'image/png')
  })
}

/**
 * @description: 添加头像圆顶拱门路径
 * @param {CanvasRenderingContext2D} context - 画布上下文
 * @param {number} x - 左上角 x
 * @param {number} y - 左上角 y
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @return {void} 无返回值
 */
function addRoundedArchPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const radius = width / 2
  context.beginPath()
  context.moveTo(x, y + height)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height)
  context.closePath()
}

/**
 * @description: 绘制 cover 模式图片
 * @param {CanvasRenderingContext2D} context - 画布上下文
 * @param {HTMLImageElement | HTMLCanvasElement} image - 图片
 * @param {number} x - 目标 x
 * @param {number} y - 目标 y
 * @param {number} width - 目标宽度
 * @param {number} height - 目标高度
 * @param {number} scale - 额外缩放倍率
 * @return {void} 无返回值
 */
function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1
): void {
  const sourceWidth = image instanceof HTMLCanvasElement ? image.width : image.naturalWidth
  const sourceHeight = image instanceof HTMLCanvasElement ? image.height : image.naturalHeight
  const coverScale = Math.max(width / sourceWidth, height / sourceHeight) * scale
  const drawWidth = sourceWidth * coverScale
  const drawHeight = sourceHeight * coverScale
  const drawX = x + (width - drawWidth) / 2
  const drawY = y + (height - drawHeight) / 2

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

/**
 * @description: 绘制带羽化边缘的头像
 * @description 官方头像和自定义头像共用羽化遮罩，保证后续模板视觉一致。
 * @param {CanvasRenderingContext2D} context - 目标画布上下文
 * @param {HTMLImageElement} avatarImage - 头像图片
 * @param {CertificateTemplateField} field - 头像字段配置
 * @param {number} scale - 模板到正本的缩放倍率
 * @param {boolean} avatarIsCustom - 是否为自定义头像
 * @return {void} 无返回值
 */
function drawAvatarField(
  context: CanvasRenderingContext2D,
  avatarImage: HTMLImageElement,
  field: CertificateTemplateField,
  scale: number,
  avatarIsCustom: boolean
): void {
  if (!field.size) {
    return
  }

  const [fieldX, fieldY] = field.position
  const x = fieldX * scale
  const y = fieldY * scale
  const width = field.size.width * scale
  const height = field.size.height * scale
  const fieldCanvas = createCanvas(width, height)
  const fieldContext = fieldCanvas.getContext('2d')

  if (!fieldContext) {
    return
  }

  drawImageCover(
    fieldContext,
    avatarImage,
    0,
    0,
    width,
    height,
    avatarIsCustom ? (field.customImageScale ?? 1) : 1
  )

  fieldContext.globalCompositeOperation = 'destination-in'
  addRoundedArchPath(fieldContext, 0, 0, width, height)
  fieldContext.fillStyle = '#000'
  fieldContext.fill()

  fieldContext.globalCompositeOperation = 'destination-in'
  const feather = fieldContext.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.28,
    width / 2,
    height / 2,
    Math.min(width, height) * 0.58
  )
  feather.addColorStop(0, 'rgba(0,0,0,1)')
  feather.addColorStop(0.78, 'rgba(0,0,0,1)')
  feather.addColorStop(1, 'rgba(0,0,0,0)')
  fieldContext.fillStyle = feather
  fieldContext.fillRect(0, 0, width, height)

  context.drawImage(fieldCanvas, x, y)
}

/**
 * @description: 计算文字字号
 * @description 尽可能使用最大字号，超出 contentWidth 时逐步缩小到可展示完整。
 * @param {CanvasRenderingContext2D} context - 画布上下文
 * @param {CertificateTemplateField} field - 文字字段
 * @param {string} text - 待绘制文本
 * @param {number} scale - 模板到正本的缩放倍率
 * @return {number} 适配后的字号
 */
function resolveFontSize(
  context: CanvasRenderingContext2D,
  field: CertificateTemplateField,
  text: string,
  scale: number
): number {
  const style = field.textStyle

  if (!style) {
    return 22 * scale
  }

  const maxFontSize = style.fontSize * scale
  const contentWidth = field.contentWidth ? field.contentWidth * scale : 0

  if (!contentWidth) {
    return maxFontSize
  }

  let fontSize = maxFontSize

  while (fontSize > 10 * scale) {
    context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`

    if (context.measureText(text).width <= contentWidth - 6 * scale) {
      return fontSize
    }

    fontSize -= 0.8 * scale
  }

  return fontSize
}

/**
 * @description: 绘制单个文字字段
 * @param {CanvasRenderingContext2D} context - 画布上下文
 * @param {CertificateTemplateField} field - 字段配置
 * @param {string} text - 字段值
 * @param {number} scale - 模板到正本的缩放倍率
 * @return {void} 无返回值
 */
function drawTextField(
  context: CanvasRenderingContext2D,
  field: CertificateTemplateField,
  text: string,
  scale: number
): void {
  const style = field.textStyle

  if (!style || !text) {
    return
  }

  const [fieldX, fieldY] = field.position
  const fontSize = resolveFontSize(context, field, text, scale)
  const lineHeight = style.lineHeight * style.fontSize * scale
  const x = fieldX * scale
  const y = fieldY * scale

  context.save()
  context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`
  context.fillStyle = style.color
  context.textAlign = style.align
  context.textBaseline = 'alphabetic'
  context.shadowColor = 'rgba(255,255,255,0.36)'
  context.shadowBlur = 0
  context.shadowOffsetY = 1 * scale
  // 字号缩小时仍以模板行盒底部为准，避免英文长称号向上漂。
  context.fillText(text, x, y + lineHeight * 0.72)
  context.restore()
}

/**
 * @description: 将模板绘制到指定画布
 * @param {CanvasRenderingContext2D} context - 目标画布上下文
 * @param {CertificateRenderInput} input - 渲染输入
 * @param {HTMLImageElement} templateImage - 底图图片
 * @param {HTMLImageElement} avatarImage - 头像图片
 * @param {number} width - 目标宽度
 * @param {number} height - 目标高度
 * @return {void} 无返回值
 */
function drawCertificate(
  context: CanvasRenderingContext2D,
  input: CertificateRenderInput,
  templateImage: HTMLImageElement,
  avatarImage: HTMLImageElement,
  width: number,
  height: number
): void {
  const scale = width / input.manifest.baseSize.width

  context.clearRect(0, 0, width, height)
  context.drawImage(templateImage, 0, 0, width, height)

  input.manifest.fields.forEach((field) => {
    if (field.kind === 'image' && field.id === 'avatar') {
      drawAvatarField(context, avatarImage, field, scale, input.avatarIsCustom)
      return
    }

    if (field.kind === 'text') {
      drawTextField(context, field, input.fieldValues[field.id] ?? '', scale)
    }
  })
}

/**
 * @description: 渲染证书正本 PNG
 * @description 先生成 16:9 正本，再把横版正本等比例置入 A4 横版画布，统一打印留白。
 * @param {CertificateRenderInput} input - 正本渲染输入
 * @return {Promise<RenderedCertificateImages>} 两种规格 PNG
 */
async function createWideCertificateCanvas(
  input: CertificateRenderInput
): Promise<HTMLCanvasElement> {
  const [templateImage, avatarImage] = await Promise.all([
    loadImageElement(input.templateImageSrc),
    loadImageElement(input.avatarSrc),
  ])
  const wideCanvas = createCanvas(WIDE_CERTIFICATE_SIZE.width, WIDE_CERTIFICATE_SIZE.height)
  const wideContext = wideCanvas.getContext('2d')

  if (!wideContext) {
    throw new Error('Canvas rendering context is not available')
  }

  drawCertificate(
    wideContext,
    input,
    templateImage,
    avatarImage,
    WIDE_CERTIFICATE_SIZE.width,
    WIDE_CERTIFICATE_SIZE.height
  )

  return wideCanvas
}

/**
 * @description: 渲染单张证书正本 PNG
 * @description 领取页按当前 tab 生成所需规格，不把大图长期存入 IndexedDB。
 * @param {CertificateRenderInput} input - 正本渲染输入
 * @param {CertificateRenderKind} kind - 要生成的正本规格
 * @return {Promise<RenderedCertificateImage>} 单张 PNG
 */
export async function renderCertificateImage(
  input: CertificateRenderInput,
  kind: CertificateRenderKind
): Promise<RenderedCertificateImage> {
  const wideCanvas = await createWideCertificateCanvas(input)

  if (kind === 'wide') {
    return {
      kind: 'wide',
      blob: await canvasToPngBlob(wideCanvas),
      width: WIDE_CERTIFICATE_SIZE.width,
      height: WIDE_CERTIFICATE_SIZE.height,
    }
  }

  const a4Canvas = createCanvas(A4_CERTIFICATE_SIZE.width, A4_CERTIFICATE_SIZE.height)
  const a4Context = a4Canvas.getContext('2d')

  if (!a4Context) {
    throw new Error('Canvas rendering context is not available')
  }

  a4Context.fillStyle = '#fff9fc'
  a4Context.fillRect(0, 0, A4_CERTIFICATE_SIZE.width, A4_CERTIFICATE_SIZE.height)

  const safeMargin = 136
  const maxWidth = A4_CERTIFICATE_SIZE.width - safeMargin * 2
  const maxHeight = A4_CERTIFICATE_SIZE.height - safeMargin * 2
  const fitScale = Math.min(
    maxWidth / WIDE_CERTIFICATE_SIZE.width,
    maxHeight / WIDE_CERTIFICATE_SIZE.height
  )
  const drawWidth = WIDE_CERTIFICATE_SIZE.width * fitScale
  const drawHeight = WIDE_CERTIFICATE_SIZE.height * fitScale
  const drawX = (A4_CERTIFICATE_SIZE.width - drawWidth) / 2
  const drawY = (A4_CERTIFICATE_SIZE.height - drawHeight) / 2

  a4Context.drawImage(wideCanvas, drawX, drawY, drawWidth, drawHeight)

  return {
    kind: 'a4',
    blob: await canvasToPngBlob(a4Canvas),
    width: A4_CERTIFICATE_SIZE.width,
    height: A4_CERTIFICATE_SIZE.height,
  }
}

/**
 * @description: 渲染证书正本 PNG
 * @description 兼容批量生成调用；新页面默认按 tab 调用 renderCertificateImage。
 * @param {CertificateRenderInput} input - 正本渲染输入
 * @return {Promise<RenderedCertificateImages>} 两种规格 PNG
 */
export async function renderCertificateImages(
  input: CertificateRenderInput
): Promise<RenderedCertificateImages> {
  const [wide, a4] = await Promise.all([
    renderCertificateImage(input, 'wide'),
    renderCertificateImage(input, 'a4'),
  ])
  return {
    wide,
    a4,
  }
}
