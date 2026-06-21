const CACHE_PREFIX = 'infinity-nikki-stylist-office'
const CACHE_NAME = 'infinity-nikki-stylist-office-resources-v2'
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const IS_LOCAL_DEV_HOST = LOCAL_DEV_HOSTS.has(self.location.hostname)
const NETWORK_FIRST_PATH_PREFIXES = ['/association-data/', '/template/']
const CORE_RESOURCES = [
  '/',
  '/favicon.ico',
  '/association-data/manifest.seed.json',
  '/template/templates/1/manifest.json',
  '/template/templates/1/zh-CN.png',
  '/template/templates/1/zh-TW.png',
  '/template/templates/1/en-US.png',
  '/template/templates/1/ja-JP.png',
  '/template/avatars/1.png',
  '/ui/nikki/header-avatar.png',
  '/ui/nikki/signing-bg.png',
  '/ui/nikki/signing-witness.png',
]

function deleteAppCaches() {
  return caches
    .keys()
    .then((names) =>
      Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name))
      )
    )
}

function createOfflineResponse(request) {
  if (request.mode === 'navigate') {
    return caches
      .match('/')
      .then((response) => response || new Response('', { status: 504, statusText: 'Offline' }))
  }

  return new Response('', { status: 504, statusText: 'Offline' })
}

function putResponseInCache(request, response) {
  if (!response.ok) {
    return
  }

  const responseClone = response.clone()

  caches.open(CACHE_NAME).then((cache) => {
    cache.put(request, responseClone)
  })
}

function shouldUseNetworkFirst(request, requestUrl) {
  return (
    request.mode === 'navigate' ||
    request.cache === 'reload' ||
    requestUrl.pathname === '/' ||
    requestUrl.pathname === '/index.html' ||
    NETWORK_FIRST_PATH_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix))
  )
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      putResponseInCache(request, response)
      return response
    })
    .catch(() =>
      caches.match(request).then((response) => response || createOfflineResponse(request))
    )
}

function staleWhileRevalidate(request) {
  const networkResponse = fetch(request)
    .then((response) => {
      putResponseInCache(request, response)
      return response
    })
    .catch(() => undefined)

  return caches
    .match(request)
    .then((cachedResponse) => cachedResponse || networkResponse)
    .then((response) => response || createOfflineResponse(request))
}

if (IS_LOCAL_DEV_HOST) {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      deleteAppCaches()
        .then(() => self.registration.unregister())
        .then(() => self.skipWaiting())
    )
  })

  self.addEventListener('activate', (event) => {
    event.waitUntil(deleteAppCaches().then(() => self.clients.claim()))
  })
} else {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.addAll(CORE_RESOURCES))
        .catch(() => undefined)
    )
  })

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
              .map((name) => caches.delete(name))
          )
        )
        .then(() => self.clients.claim())
    )
  })

  self.addEventListener('fetch', (event) => {
    const request = event.request

    if (request.method !== 'GET') {
      return
    }

    const requestUrl = new URL(request.url)

    if (requestUrl.origin !== self.location.origin) {
      return
    }

    event.respondWith(
      shouldUseNetworkFirst(request, requestUrl)
        ? networkFirst(request)
        : staleWhileRevalidate(request)
    )
  })

  self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
      self.skipWaiting()
    }
  })
}
