/**
 * @fileOverview 内置证书模板注册表
 * @description 只登记模板包入口，manifest、语言底图和后续素材都从入口相对解析。
 * @author strawberrybear
 * @date 2026-06-20
 */
import { certificateTemplateManifestSchema } from './schema'
import type { LocaleCode } from '@/domain/catalog/types'
import type {
  BuiltinCertificateTemplatePackage,
  CertificateTemplateField,
  CertificateTemplateManifest,
  CertificateTemplatePackageEntry,
} from './types'

/** Vite public 资源根路径，跟随部署 base，避免子路径部署时模板资源丢失。 */
const APP_PUBLIC_BASE_URL = import.meta.env.BASE_URL || '/'

/** 模板包 manifest 文件名；内置模板和远程模板保持同一目录契约。 */
const TEMPLATE_MANIFEST_FILENAME = 'manifest.json'

/** 已加载模板包缓存，避免核对页语言切换时重复读取 manifest。 */
const templatePackageCache = new Map<string, Promise<BuiltinCertificateTemplatePackage>>()

/**
 * @description: 解析 public 下的绝对入口
 * @param {string} relativePath - 相对 public 根的模板目录
 * @return {string} 带部署 base 的模板包入口
 */
function resolvePublicEntryUrl(relativePath: string): string {
  const baseUrl = APP_PUBLIC_BASE_URL.endsWith('/')
    ? APP_PUBLIC_BASE_URL
    : `${APP_PUBLIC_BASE_URL}/`
  const cleanPath = relativePath.replace(/^\/+/, '').replace(/\/?$/, '/')

  return `${baseUrl}${cleanPath}`
}

/** 内置模板入口；后续新增模板只登记根目录，不再逐个 import 资源。 */
const BUILTIN_TEMPLATE_ENTRIES: CertificateTemplatePackageEntry[] = [
  {
    templateId: 'template-miracle-continent-classic-001',
    rootUrl: resolvePublicEntryUrl('template/templates/1/'),
  },
]

/**
 * @description: 从模板入口解析素材 URL
 * @description manifest 只保存相对文件名，真实 URL 在这里统一拼接。
 * @param {string} rootUrl - 模板包根地址
 * @param {string} assetPath - manifest 中声明的相对资源路径
 * @return {string} 可直接给 img 使用的 URL
 */
export function resolveTemplateAssetUrl(rootUrl: string, assetPath: string): string {
  if (/^(?:https?:|data:|blob:)/.test(assetPath)) {
    return assetPath
  }

  const cleanRootUrl = rootUrl.replace(/\/?$/, '/')
  const cleanAssetPath = assetPath.replace(/^\.?\//, '')

  return `${cleanRootUrl}${cleanAssetPath}`
}

/**
 * @description: 按模板入口读取 manifest
 * @param {CertificateTemplatePackageEntry} entry - 模板包入口
 * @return {Promise<CertificateTemplateManifest>} 已校验模板 manifest
 */
async function loadTemplateManifest(
  entry: CertificateTemplatePackageEntry
): Promise<CertificateTemplateManifest> {
  const response = await fetch(resolveTemplateAssetUrl(entry.rootUrl, TEMPLATE_MANIFEST_FILENAME))

  if (!response.ok) {
    throw new Error(`Failed to load certificate template manifest: ${entry.rootUrl}`)
  }

  return certificateTemplateManifestSchema.parse(await response.json())
}

/**
 * @description: 从入口加载模板包
 * @description 所有语言底图都按 manifest.localeImages 的相对路径解析，匹配远程模板包机制。
 * @param {CertificateTemplatePackageEntry} entry - 模板包入口
 * @return {Promise<BuiltinCertificateTemplatePackage>} 已解析模板包
 */
async function loadTemplatePackageFromEntry(
  entry: CertificateTemplatePackageEntry
): Promise<BuiltinCertificateTemplatePackage> {
  const manifest = await loadTemplateManifest(entry)

  return {
    rootUrl: entry.rootUrl,
    manifest,
    imageSources: {
      'zh-CN': resolveTemplateAssetUrl(entry.rootUrl, manifest.localeImages['zh-CN']),
      'zh-TW': resolveTemplateAssetUrl(entry.rootUrl, manifest.localeImages['zh-TW']),
      'en-US': resolveTemplateAssetUrl(entry.rootUrl, manifest.localeImages['en-US']),
      'ja-JP': resolveTemplateAssetUrl(entry.rootUrl, manifest.localeImages['ja-JP']),
    },
  }
}

/**
 * @description: 获取证书模板包
 * @description 找不到草稿指定模板时回退第一套内置模板，保证旧草稿仍可渲染。
 * @param {string} templateId - 草稿保存的模板 ID
 * @return {Promise<BuiltinCertificateTemplatePackage>} 模板包
 */
export function loadBuiltinTemplatePackage(
  templateId: string
): Promise<BuiltinCertificateTemplatePackage> {
  const entry =
    BUILTIN_TEMPLATE_ENTRIES.find((item) => item.templateId === templateId) ??
    BUILTIN_TEMPLATE_ENTRIES[0]

  const cachedPackage = templatePackageCache.get(entry.templateId)

  if (cachedPackage) {
    return cachedPackage
  }

  const packagePromise = loadTemplatePackageFromEntry(entry)
  templatePackageCache.set(entry.templateId, packagePromise)

  return packagePromise
}

/**
 * @description: 获取当前语言的模板底图
 * @description 模板未声明该语言时回退简体中文，避免语言包扩展期间白屏。
 * @param {CertificateTemplateManifest} manifest - 模板 manifest
 * @param {Record<LocaleCode, string>} imageSources - 已解析底图 URL 表
 * @param {LocaleCode} locale - 当前证书语言
 * @return {string} 底图 URL
 */
export function getTemplateImageSource(
  manifest: CertificateTemplateManifest,
  imageSources: Record<LocaleCode, string>,
  locale: LocaleCode
): string {
  return manifest.localeImages[locale] ? imageSources[locale] : imageSources['zh-CN']
}

/**
 * @description: 获取模板字段
 * @description 动态渲染和点击热区都通过字段 ID 读取同一份 manifest 配置。
 * @param {CertificateTemplateManifest} manifest - 模板 manifest
 * @param {string} fieldId - 字段 ID
 * @return {CertificateTemplateField | undefined} 模板字段配置
 */
export function getTemplateField(
  manifest: CertificateTemplateManifest,
  fieldId: string
): CertificateTemplateField | undefined {
  return manifest.fields.find((field) => field.id === fieldId)
}
