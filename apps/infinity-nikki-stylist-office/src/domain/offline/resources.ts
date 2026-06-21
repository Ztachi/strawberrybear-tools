/**
 * @fileOverview 离线资源清单
 * @description 集中声明首屏预热和后台缓存的 public 资源，模板新增时只需扩展入口清单。
 * @author strawberrybear
 * @date 2026-06-21
 */

/** 当前离线资源缓存名，修改清单结构时递增版本。 */
export const OFFLINE_RESOURCE_CACHE_NAME = 'infinity-nikki-stylist-office-resources-v3'

/** 应用外壳资源；进入页面后空闲时轻量预热。 */
export const APP_SHELL_OFFLINE_RESOURCE_PATHS = [
  '/',
  '/favicon.ico',
  '/association-data/manifest.seed.json',
  '/ui/nikki/header-avatar.png',
] as const

/** 登记页会用到的内置头像资源。 */
export const REGISTRATION_OFFLINE_RESOURCE_PATHS = ['/template/avatars/1.png'] as const

/** 核对和证书页会用到的模板资源。 */
export const TEMPLATE_OFFLINE_RESOURCE_PATHS = [
  '/template/templates/1/manifest.json',
  '/template/templates/1/zh-CN.png',
  '/template/templates/1/zh-TW.png',
  '/template/templates/1/en-US.png',
  '/template/templates/1/ja-JP.png',
] as const

/** 签发仪式页会用到的视觉资源。 */
export const SIGNING_OFFLINE_RESOURCE_PATHS = [
  '/ui/nikki/signing-bg.png',
  '/ui/nikki/signing-witness.png',
] as const

/**
 * @description: 解析 public 资源 URL
 * @param {readonly string[]} paths - 以 / 开头的 public 路径
 * @return {string[]} 带 base 的 URL
 */
export function resolveOfflineResourceUrls(paths: readonly string[]): string[] {
  const baseUrl = import.meta.env.BASE_URL || '/'

  return paths.map((path) => `${baseUrl.replace(/\/$/, '')}${path}`)
}
