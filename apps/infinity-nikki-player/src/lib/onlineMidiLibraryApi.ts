const DEFAULT_API_BASE = 'https://ztachi.com'
const DB_NAME = 'infinity-nikki-online-midi'
const DB_VERSION = 1
const STORE_NAME = 'identity'
const IDENTITY_KEY = 'default'
const APP_VERSION = '1.0.0'
const EMPTY_BODY_SHA256 = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU'

const encoder = new TextEncoder()

export const ONLINE_MIDI_GENRE_TYPES = [
  'classical',
  'pop',
  'anime',
  'game',
  'movie',
  'folk',
  'electronic',
  'other',
] as const

export const ONLINE_MIDI_SOURCE_TYPES = [
  'internet',
  'original',
  'user_submit',
  'public_domain',
] as const

export const ONLINE_MIDI_DIFFICULTY_TYPES = ['unknown', 'easy', 'normal', 'hard', 'expert'] as const

export type OnlineMidiSong = {
  id: string
  title: string
  slug: string
  authorName: string
  description: string
  genreTypes: string[]
  sourceType: string
  licenseType: string
  difficultyType: string
  tags: string[]
  durationMs: number
  trackCount: number
  noteCount: number
  fileSize: number
  sha256: string
  originalFilename: string
  downloadFilename: string
  entryDate: number
  sort: number
  published: 0 | 1
  publishedAt: number | null
  createdAt: number
  updatedAt: number
}

export type OnlineMidiSongListResponse = {
  list: OnlineMidiSong[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type OnlineMidiSongQuery = {
  keyword?: string
  genreType?: string
  sourceType?: string
  difficultyType?: string
  page?: number
  pageSize?: number
}

type ApiResponse<T> = {
  code: number
  message: string
  data: T | null
}

type StoredIdentity = {
  id: typeof IDENTITY_KEY
  deviceId: string
  publicKeyJwk: Record<string, unknown>
  privateKey: CryptoKey
  registeredAt?: number
  registeredApiBase?: string
}

function getApiBase() {
  return (import.meta.env.VITE_MIDI_LIBRARY_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '')
}

function createDeviceId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return base64Url(crypto.getRandomValues(new Uint8Array(24)))
}

function base64Url(bytes: Uint8Array | ArrayBuffer) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of data) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openIdentityDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readIdentity() {
  const db = await openIdentityDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    return (await requestToPromise(store.get(IDENTITY_KEY))) as StoredIdentity | undefined
  } finally {
    db.close()
  }
}

async function saveIdentity(identity: StoredIdentity) {
  const db = await openIdentityDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    await requestToPromise(store.put(identity))
  } finally {
    db.close()
  }
}

async function createIdentity(extractablePrivateKey = false): Promise<StoredIdentity> {
  if (!crypto.subtle) {
    throw new Error('WebCrypto is not available in this environment')
  }

  const keyPair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    extractablePrivateKey,
    ['sign', 'verify']
  )) as { publicKey: CryptoKey; privateKey: CryptoKey }
  const publicKeyJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as Record<
    string,
    unknown
  >

  return {
    id: IDENTITY_KEY,
    deviceId: createDeviceId(),
    publicKeyJwk,
    privateKey: keyPair.privateKey,
  }
}

async function getOrCreateIdentity() {
  const existing = await readIdentity()
  if (existing?.deviceId && existing.publicKeyJwk && existing.privateKey instanceof CryptoKey) {
    return existing
  }

  const identity = await createIdentity(false)
  try {
    await saveIdentity(identity)
    return identity
  } catch {
    const fallbackIdentity = await createIdentity(true)
    await saveIdentity(fallbackIdentity)
    return fallbackIdentity
  }
}

async function postRegister(identity: StoredIdentity, apiBase: string) {
  const response = await fetch(`${apiBase}/api/infinity-nikki/player/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-inp-app-version': APP_VERSION,
    },
    body: JSON.stringify({
      deviceId: identity.deviceId,
      publicKeyJwk: identity.publicKeyJwk,
      appVersion: APP_VERSION,
    }),
  })

  const result = await parseJsonResponse<{ deviceId: string; enabled: number }>(response)
  if (!result.enabled) {
    throw new Error('This device has been disabled for the online MIDI library')
  }
}

async function ensureRegistered(force = false) {
  const apiBase = getApiBase()
  const identity = await getOrCreateIdentity()
  if (!force && identity.registeredAt && identity.registeredApiBase === apiBase) {
    return identity
  }

  await postRegister(identity, apiBase)
  const nextIdentity = {
    ...identity,
    registeredAt: Date.now(),
    registeredApiBase: apiBase,
  }
  await saveIdentity(nextIdentity)
  return nextIdentity
}

async function signRequest(identity: StoredIdentity, method: string, pathWithSearch: string) {
  const timestamp = String(Date.now())
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)))
  const canonical = [
    method.toUpperCase(),
    pathWithSearch,
    identity.deviceId,
    timestamp,
    nonce,
    EMPTY_BODY_SHA256,
  ].join('\n')
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    encoder.encode(canonical)
  )

  return {
    'x-inp-device-id': identity.deviceId,
    'x-inp-timestamp': timestamp,
    'x-inp-nonce': nonce,
    'x-inp-body-sha256': EMPTY_BODY_SHA256,
    'x-inp-signature': base64Url(signature),
    'x-inp-app-version': APP_VERSION,
  }
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(path, getApiBase())
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function signedFetch(
  path: string,
  query?: Record<string, string | number | undefined>,
  retried = false
) {
  const identity = await ensureRegistered(false)
  const url = buildUrl(path, query)
  const pathWithSearch = `${url.pathname}${url.search}`
  const signedHeaders = await signRequest(identity, 'GET', pathWithSearch)
  const response = await fetch(url, {
    method: 'GET',
    headers: signedHeaders,
  })

  if ((response.status === 401 || response.status === 403) && !retried) {
    await ensureRegistered(true)
    return signedFetch(path, query, true)
  }

  return response
}

async function parseJsonResponse<T>(response: Response) {
  let payload: ApiResponse<T> | null = null
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    // ignore non-JSON errors
  }

  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`)
  }
  if (!payload || payload.code !== 0 || payload.data === null) {
    throw new Error(payload?.message || 'Unexpected API response')
  }

  return payload.data
}

export async function fetchOnlineMidiSongs(query: OnlineMidiSongQuery = {}) {
  const response = await signedFetch('/api/infinity-nikki/midi-songs', {
    keyword: query.keyword?.trim(),
    genreType: query.genreType,
    sourceType: query.sourceType,
    difficultyType: query.difficultyType,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 12,
  })

  return parseJsonResponse<OnlineMidiSongListResponse>(response)
}

export async function fetchOnlineMidiSong(id: string) {
  const response = await signedFetch(`/api/infinity-nikki/midi-songs/${encodeURIComponent(id)}`)
  return parseJsonResponse<OnlineMidiSong>(response)
}

export async function downloadOnlineMidiSongFile(id: string) {
  const response = await signedFetch(
    `/api/infinity-nikki/midi-songs/${encodeURIComponent(id)}/file`
  )
  if (!response.ok) {
    await parseJsonResponse<never>(response)
  }

  return new Uint8Array(await response.arrayBuffer())
}
