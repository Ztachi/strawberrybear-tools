/**
 * @fileOverview 离线资源预加载
 * @description 按页面需要在浏览器空闲时缓存资源，不阻塞首屏和用户操作。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { cacheOfflineResources } from './cache'
import {
  APP_SHELL_OFFLINE_RESOURCE_PATHS,
  REGISTRATION_OFFLINE_RESOURCE_PATHS,
  SIGNATURE_OFFLINE_RESOURCE_PATHS,
  SIGNING_OFFLINE_RESOURCE_PATHS,
  TEMPLATE_OFFLINE_RESOURCE_PATHS,
  resolveOfflineResourceUrls,
} from './resources'

/** 已经安排过后台预热的资源组。 */
const scheduledResourceKeys = new Set<string>()

/**
 * @description: 在浏览器空闲时运行任务
 * @param {() => void} task - 后台任务
 * @return {void} 无返回值
 */
function runWhenIdle(task: () => void): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: 3000 })
    return
  }

  globalThis.setTimeout(task, 800)
}

/**
 * @description: 安排指定资源路径后台预热
 * @param {string} key - 资源组唯一键
 * @param {readonly string[]} paths - public 资源路径
 * @return {void} 无返回值
 */
function scheduleOfflineResources(key: string, paths: readonly string[]): void {
  if (scheduledResourceKeys.has(key) || paths.length === 0) {
    return
  }

  scheduledResourceKeys.add(key)
  const urls = resolveOfflineResourceUrls(paths)

  runWhenIdle(() => {
    void cacheOfflineResources(urls)
  })
}

/**
 * @description: 按当前路由后台预热页面资源
 * @description 首屏只轻量预热应用外壳；模板大图在核对、签发、证书等用到时再后台缓存。
 * @param {unknown} routeName - 当前路由名
 * @return {void} 无返回值
 */
export function preloadOfflineResourcesForRoute(routeName: unknown): void {
  scheduleOfflineResources('app-shell', APP_SHELL_OFFLINE_RESOURCE_PATHS)

  switch (routeName) {
    case 'registration':
      scheduleOfflineResources('registration', REGISTRATION_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('signature', SIGNATURE_OFFLINE_RESOURCE_PATHS)
      break
    case 'proofing':
    case 'certificate':
      scheduleOfflineResources('template', TEMPLATE_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('registration', REGISTRATION_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('signature', SIGNATURE_OFFLINE_RESOURCE_PATHS)
      break
    case 'signing':
      scheduleOfflineResources('template', TEMPLATE_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('signing', SIGNING_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('registration', REGISTRATION_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('signature', SIGNATURE_OFFLINE_RESOURCE_PATHS)
      break
    case 'profile':
      scheduleOfflineResources('template', TEMPLATE_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('registration', REGISTRATION_OFFLINE_RESOURCE_PATHS)
      scheduleOfflineResources('signature', SIGNATURE_OFFLINE_RESOURCE_PATHS)
      break
    default:
      break
  }
}
