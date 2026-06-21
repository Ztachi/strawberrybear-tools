/**
 * @fileOverview 离线资源预加载
 * @description 应用入口优先缓存证书模板和关键 UI 素材，后台再补齐扩展资源。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { cacheOfflineResources, type OfflineCacheProgress } from './cache'
import {
  DEFERRED_OFFLINE_RESOURCE_PATHS,
  IMPORTANT_OFFLINE_RESOURCE_PATHS,
  resolveOfflineResourceUrls,
} from './resources'

/** 入口预加载进度。 */
export interface AppPreloadProgress {
  /** 当前百分比 */
  percent: number
  /** 已处理资源数 */
  completed: number
  /** 资源总数 */
  total: number
}

/**
 * @description: 预加载关键离线资源
 * @param {(progress: AppPreloadProgress) => void} onProgress - 进度回调
 * @return {Promise<void>} 无返回值
 */
export async function preloadImportantOfflineResources(
  onProgress: (progress: AppPreloadProgress) => void
): Promise<void> {
  const urls = resolveOfflineResourceUrls(IMPORTANT_OFFLINE_RESOURCE_PATHS)

  await cacheOfflineResources(urls, (progress: OfflineCacheProgress) => {
    onProgress({
      percent: progress.percent,
      completed: progress.completed,
      total: progress.total,
    })
  })
}

/**
 * @description: 后台预热非关键资源
 * @description 使用浏览器空闲时间启动，避免抢占签发流程交互。
 * @return {void} 无返回值
 */
export function preloadDeferredOfflineResources(): void {
  const urls = resolveOfflineResourceUrls(DEFERRED_OFFLINE_RESOURCE_PATHS)

  if (urls.length === 0) {
    return
  }

  const run = (): void => {
    void cacheOfflineResources(urls)
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 })
    return
  }

  globalThis.setTimeout(run, 1200)
}
