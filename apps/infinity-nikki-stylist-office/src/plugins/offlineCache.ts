/**
 * @fileOverview 离线缓存插件
 * @description 注册 Service Worker，配合入口资源预热让内置模板和 UI 素材可离线访问。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { clearOfflineResourceCaches } from '@/domain/offline/cache'

/** 本应用离线缓存名前缀。 */
const OFFLINE_CACHE_PREFIX = 'infinity-nikki-stylist-office'
/** 线上版本清单路径；构建时由 Vite 生成。 */
const APP_VERSION_MANIFEST_PATH = 'app-version.json'
/** 后台版本检查间隔，避免长时间打开页面时错过已发布更新。 */
const APP_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000
/** 离线资源包有新版本时通知根组件展示更新入口。 */
export const OFFLINE_UPDATE_READY_EVENT = 'stylist-office:offline-update-ready'

/** 离线资源包更新事件。 */
export interface OfflineUpdateReadyEventDetail {
  /** 应用等待中的 Service Worker 并刷新页面 */
  apply: () => void
}

/** 线上版本清单。 */
interface AppVersionManifest {
  /** 当前已部署应用版本。 */
  version?: string
}

/** 是否已经启动线上版本轮询。 */
let hasStartedAppVersionWatcher = false
/** 是否已经通知过线上版本更新。 */
let hasNotifiedAppVersionUpdate = false

/**
 * @description: 在页面可用后执行浏览器能力操作
 * @param {() => void} callback - 页面加载完成后的回调
 * @return {void} 无返回值
 */
function runAfterPageLoad(callback: () => void): void {
  if (document.readyState === 'complete') {
    callback()
    return
  }

  window.addEventListener('load', callback, { once: true })
}

/**
 * @description: 拼接线上版本清单 URL
 * @return {string} 带时间戳的版本清单 URL
 */
function getAppVersionManifestUrl(): string {
  const baseUrl = import.meta.env.BASE_URL || '/'
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const versionUrl = new URL(
    `${normalizedBaseUrl}${APP_VERSION_MANIFEST_PATH}`,
    window.location.origin
  )

  versionUrl.searchParams.set('t', String(Date.now()))
  return versionUrl.toString()
}

/**
 * @description: 通知应用存在可应用的离线资源更新
 * @param {ServiceWorkerRegistration} registration - 当前 Service Worker 注册信息
 * @return {void} 无返回值
 */
function notifyOfflineUpdateReady(registration: ServiceWorkerRegistration): void {
  const waitingWorker = registration.waiting

  if (!waitingWorker) {
    return
  }

  window.dispatchEvent(
    new CustomEvent<OfflineUpdateReadyEventDetail>(OFFLINE_UPDATE_READY_EVENT, {
      detail: {
        apply: () => {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' })
        },
      },
    })
  )
}

/**
 * @description: 通知应用线上版本已变化
 * @description 非 SW waiting 场景下先清理可重建缓存再刷新，避免同路径 public 资源继续命中旧缓存。
 * @return {void} 无返回值
 */
function notifyAppVersionUpdateReady(): void {
  if (hasNotifiedAppVersionUpdate) {
    return
  }

  hasNotifiedAppVersionUpdate = true
  window.dispatchEvent(
    new CustomEvent<OfflineUpdateReadyEventDetail>(OFFLINE_UPDATE_READY_EVENT, {
      detail: {
        apply: () => {
          void clearOfflineResourceCaches().finally(() => {
            window.location.reload()
          })
        },
      },
    })
  )
}

/**
 * @description: 检查线上版本是否已经不同于当前 bundle
 * @return {Promise<void>} 无返回值
 */
async function checkAppVersionUpdate(): Promise<void> {
  if (hasNotifiedAppVersionUpdate) {
    return
  }

  try {
    const response = await fetch(getAppVersionManifestUrl(), {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
      },
    })

    if (!response.ok) {
      return
    }

    const manifest = (await response.json()) as AppVersionManifest
    const deployedVersion = manifest.version?.trim()

    if (deployedVersion && deployedVersion !== import.meta.env.VITE_APP_VERSION) {
      notifyAppVersionUpdateReady()
    }
  } catch {
    // 版本检查是更新提示增强能力，失败时保留现有 SW 更新链路。
  }
}

/**
 * @description: 启动线上版本检查
 * @return {void} 无返回值
 */
function startAppVersionWatcher(): void {
  if (hasStartedAppVersionWatcher) {
    return
  }

  hasStartedAppVersionWatcher = true
  void checkAppVersionUpdate()
  window.setInterval(() => void checkAppVersionUpdate(), APP_VERSION_CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkAppVersionUpdate()
    }
  })
}

/**
 * @description: 清理开发环境遗留离线能力
 * @description Vite dev server 依赖 websocket/HMR，开发环境注册 SW 会把旧端口页面缓存住。
 * @return {void} 无返回值
 */
export function cleanupDevelopmentOfflineCache(): void {
  if (!import.meta.env.DEV) {
    return
  }

  runAfterPageLoad(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          await Promise.all(registrations.map((registration) => registration.unregister()))
        })
        .catch(() => undefined)
    }

    if ('caches' in window) {
      void caches
        .keys()
        .then(async (cacheNames) => {
          await Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith(OFFLINE_CACHE_PREFIX))
              .map((cacheName) => caches.delete(cacheName))
          )
        })
        .catch(() => undefined)
    }
  })
}

/**
 * @description: 注册离线 Service Worker
 * @description 只在生产构建启用，开发环境交给 Vite HMR 直接接管。
 * @return {void} 无返回值
 */
export function registerOfflineServiceWorker(): void {
  if (import.meta.env.DEV) {
    return
  }

  runAfterPageLoad(() => {
    startAppVersionWatcher()

    if (!('serviceWorker' in navigator)) {
      return
    }

    const baseUrl = import.meta.env.BASE_URL || '/'
    let isRefreshing = false

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isRefreshing) {
        return
      }

      isRefreshing = true
      window.location.reload()
    })

    void navigator.serviceWorker
      .register(`${baseUrl}sw.js`)
      .then((registration) => {
        if (navigator.serviceWorker.controller && registration.waiting) {
          notifyOfflineUpdateReady(registration)
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing

          if (!installingWorker) {
            return
          }

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyOfflineUpdateReady(registration)
            }
          })
        })

        void registration.update().catch(() => undefined)
      })
      .catch(() => {
        // 离线缓存是增强能力，注册失败不阻塞核心办理流程。
      })
  })
}
