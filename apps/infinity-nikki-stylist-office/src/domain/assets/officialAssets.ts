/**
 * @fileOverview 协会内置素材 URL 注册表
 * @description 将资料库中的稳定 assetId 映射到 public/template 入口下的相对素材。
 * @author strawberrybear
 * @date 2026-06-20
 */

/** public/template 资源根入口，后续远程素材包也按同样的相对路径机制解析。 */
const OFFICIAL_TEMPLATE_ASSET_ROOT = `${import.meta.env.BASE_URL || '/'}template/`

/**
 * @description: 解析协会素材 URL
 * @param {string} relativePath - 相对 public/template 的素材路径
 * @return {string} 可直接给 img 使用的 URL
 */
function resolveOfficialTemplateAssetUrl(relativePath: string): string {
  const cleanRootUrl = OFFICIAL_TEMPLATE_ASSET_ROOT.replace(/\/?$/, '/')
  const cleanRelativePath = relativePath.replace(/^\.?\//, '')

  return `${cleanRootUrl}${cleanRelativePath}`
}

/** 协会内置图片资源 URL，key 必须对应资料库 imageAssets.assetId。 */
const OFFICIAL_ASSET_IMAGE_SOURCES: Record<string, string> = {
  'asset-avatar-default-nikki': resolveOfficialTemplateAssetUrl('avatars/1.png'),
}

/**
 * @description: 获取协会内置素材图片 URL
 * @description 未注册素材返回空字符串，由消费组件展示兜底占位。
 * @param {string} assetId - 资料库 imageAssets 中的稳定素材 ID
 * @return {string} 构建后的图片 URL
 */
export function getOfficialAssetImageSource(assetId: string): string {
  return OFFICIAL_ASSET_IMAGE_SOURCES[assetId] ?? ''
}
