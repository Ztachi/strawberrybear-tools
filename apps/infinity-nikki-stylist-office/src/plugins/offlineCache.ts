/**
 * @fileOverview 离线缓存插件
 * @description 注册 Service Worker，配合入口资源预热让内置模板和 UI 素材可离线访问。
 * @author strawberrybear
 * @date 2026-06-21
 */

/** 本应用离线缓存名前缀。 */
const OFFLINE_CACHE_PREFIX = 'infinity-nikki-stylist-office'
/** 离线资源包有新版本时通知根组件展示更新入口。 */
export const OFFLINE_UPDATE_READY_EVENT = 'stylist-office:offline-update-ready'

/** 离线资源包更新事件。 */
export interface OfflineUpdateReadyEventDetail {
  /** 应用等待中的 Service Worker 并刷新页面 */
  apply: () => void
}

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
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return
  }

  runAfterPageLoad(() => {
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
      })
      .catch(() => {
        // 离线缓存是增强能力，注册失败不阻塞核心办理流程。
      })
  })
}
