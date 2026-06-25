const CACHE_PREFIX = 'infinity-nikki-stylist-office'
const CACHE_NAME = 'infinity-nikki-stylist-office-resources-v5'
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const IS_LOCAL_DEV_HOST = LOCAL_DEV_HOSTS.has(self.location.hostname)
const NETWORK_ONLY_PATHS = ['/app-version.json']
const NETWORK_FIRST_PATH_PREFIXES = ['/association-data/']
const CACHE_FIRST_PATH_PREFIXES = ['/template/', '/ui/nikki/']
const CORE_RESOURCES = ['/', '/favicon.ico', '/association-data/manifest.seed.json']

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

function shouldUseNetworkOnly(requestUrl) {
  return NETWORK_ONLY_PATHS.some(
    (path) => requestUrl.pathname === path || requestUrl.pathname.endsWith(path)
  )
}

function shouldUseCacheFirst(requestUrl) {
  return CACHE_FIRST_PATH_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix))
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

function cacheFirst(request) {
  return caches
    .match(request)
    .then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((response) => {
        putResponseInCache(request, response)
        return response
      })
    })
    .catch(() => createOfflineResponse(request))
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

function networkOnly(request) {
  return fetch(request).catch(() => createOfflineResponse(request))
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

    if (shouldUseNetworkOnly(requestUrl)) {
      event.respondWith(networkOnly(request))
      return
    }

    if (shouldUseCacheFirst(requestUrl)) {
      event.respondWith(cacheFirst(request))
      return
    }

    if (shouldUseNetworkFirst(request, requestUrl)) {
      event.respondWith(networkFirst(request))
      return
    }

    event.respondWith(staleWhileRevalidate(request))
  })

  self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
      self.skipWaiting()
    }
  })
}
