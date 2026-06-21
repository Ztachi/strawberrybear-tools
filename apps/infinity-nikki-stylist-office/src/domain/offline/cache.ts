/**
 * @fileOverview 离线缓存仓储
 * @description 负责 Cache API 资源写入、统计和清除，不触碰 IndexedDB 中的用户业务数据。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { OFFLINE_RESOURCE_CACHE_NAME } from './resources'

/** 资源缓存进度。 */
export interface OfflineCacheProgress {
  /** 已处理资源数 */
  completed: number
  /** 资源总数 */
  total: number
  /** 当前百分比 */
  percent: number
  /** 当前资源 URL */
  url: string
}

/**
 * @description: 判断当前浏览器是否支持 Cache API
 * @return {boolean} 是否支持
 */
function supportsCacheApi(): boolean {
  return typeof window !== 'undefined' && 'caches' in window
}

/**
 * @description: 缓存资源列表
 * @description 单个资源失败不会中断整体预热，保证弱网环境仍能进入应用。
 * @param {string[]} urls - 资源 URL
 * @param {(progress: OfflineCacheProgress) => void} onProgress - 进度回调
 * @return {Promise<void>} 无返回值
 */
export async function cacheOfflineResources(
  urls: string[],
  onProgress: (progress: OfflineCacheProgress) => void = () => {}
): Promise<void> {
  const total = urls.length

  if (!supportsCacheApi() || total === 0) {
    onProgress({ completed: total, total, percent: 100, url: '' })
    return
  }

  const cache = await caches.open(OFFLINE_RESOURCE_CACHE_NAME)

  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetch(url, { cache: 'reload' })

      if (response.ok) {
        await cache.put(url, response)
      }
    } catch {
      // 缓存失败不阻塞办理流程，Service Worker 后续仍可按网络状态补齐。
    } finally {
      const completed = index + 1

      onProgress({
        completed,
        total,
        percent: Math.round((completed / total) * 100),
        url,
      })
    }
  }
}

/**
 * @description: 估算离线资源缓存容量
 * @return {Promise<number>} 字节数
 */
export async function estimateOfflineResourceCacheBytes(): Promise<number> {
  if (!supportsCacheApi()) {
    return 0
  }

  const cache = await caches.open(OFFLINE_RESOURCE_CACHE_NAME)
  const requests = await cache.keys()
  let totalBytes = 0

  for (const request of requests) {
    const response = await cache.match(request)

    if (!response) {
      continue
    }

    const contentLength = Number(response.headers.get('content-length'))

    if (Number.isFinite(contentLength) && contentLength > 0) {
      totalBytes += contentLength
      continue
    }

    totalBytes += (await response.clone().arrayBuffer()).byteLength
  }

  return totalBytes
}

/**
 * @description: 清理离线资源缓存
 * @description 只删除本应用资源缓存，不清除草稿、证书历史、自定义素材等 IndexedDB 数据。
 * @return {Promise<void>} 无返回值
 */
export async function clearOfflineResourceCaches(): Promise<void> {
  if (!supportsCacheApi()) {
    return
  }

  const cacheNames = await caches.keys()
  const deletions = cacheNames
    .filter((cacheName) => cacheName.startsWith('infinity-nikki-stylist-office'))
    .map((cacheName) => caches.delete(cacheName))

  await Promise.all(deletions)
}
