import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchAllOnlineMidiSongs,
  fetchOnlineMidiSong,
  readOnlineMidiLibraryCache,
  saveOnlineMidiLibraryCache,
  upsertOnlineMidiSongCache,
  type OnlineMidiSong,
} from '@/lib/onlineMidiLibraryApi'

export type OnlineMidiLibraryFilters = {
  keyword: string
  genreType?: string
  sourceType?: string
  difficultyType?: string
}

function sortOnlineSongs(a: OnlineMidiSong, b: OnlineMidiSong) {
  if (a.sort !== b.sort) return b.sort - a.sort
  if ((a.entryDate || 0) !== (b.entryDate || 0)) return (b.entryDate || 0) - (a.entryDate || 0)
  return a.title.localeCompare(b.title)
}

function searchableText(song: OnlineMidiSong) {
  return [
    song.title,
    song.authorName,
    song.description,
    song.originalFilename,
    song.downloadFilename,
    ...song.tags,
    ...song.genreTypes,
  ]
    .join('\n')
    .toLowerCase()
}

export const useOnlineMidiLibraryStore = defineStore('onlineMidiLibrary', () => {
  const songsById = ref<Record<string, OnlineMidiSong>>({})
  const syncedAt = ref<number | null>(null)
  const isHydrated = ref(false)
  const isSyncing = ref(false)
  const errorMessage = ref('')
  const filters = reactive<OnlineMidiLibraryFilters>({
    keyword: '',
    genreType: undefined,
    sourceType: undefined,
    difficultyType: undefined,
  })

  const songs = computed(() => Object.values(songsById.value).sort(sortOnlineSongs))
  const hasCache = computed(() => songs.value.length > 0)
  const filteredSongs = computed(() => {
    const keyword = filters.keyword.trim().toLowerCase()
    return songs.value.filter((song) => {
      if (filters.genreType && !song.genreTypes.includes(filters.genreType)) return false
      if (filters.sourceType && song.sourceType !== filters.sourceType) return false
      if (filters.difficultyType && song.difficultyType !== filters.difficultyType) return false
      if (keyword && !searchableText(song).includes(keyword)) return false
      return true
    })
  })

  function setSongs(nextSongs: OnlineMidiSong[], nextSyncedAt: number | null = syncedAt.value) {
    songsById.value = Object.fromEntries(nextSongs.map((song) => [song.id, song]))
    syncedAt.value = nextSyncedAt
  }

  async function hydrateCache() {
    if (isHydrated.value) return
    errorMessage.value = ''
    const cache = await readOnlineMidiLibraryCache()
    if (cache) {
      songsById.value = cache.songsById
      syncedAt.value = cache.syncedAt
    }
    isHydrated.value = true
  }

  async function ensureReady() {
    await hydrateCache()
    if (!hasCache.value) {
      await syncAllSongs()
    }
  }

  async function syncAllSongs() {
    isSyncing.value = true
    errorMessage.value = ''
    try {
      const nextSongs = await fetchAllOnlineMidiSongs()
      const cache = await saveOnlineMidiLibraryCache(nextSongs)
      songsById.value = cache.songsById
      syncedAt.value = cache.syncedAt
      isHydrated.value = true
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isSyncing.value = false
    }
  }

  async function fetchSongById(id: string) {
    await hydrateCache()
    const cached = songsById.value[id]
    if (cached) return cached

    isSyncing.value = true
    errorMessage.value = ''
    try {
      const song = await fetchOnlineMidiSong(id)
      const cache = await upsertOnlineMidiSongCache(song)
      songsById.value = cache.songsById
      syncedAt.value = cache.syncedAt
      return song
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  function getSong(id: string) {
    return songsById.value[id] ?? null
  }

  function clearFilters() {
    filters.keyword = ''
    filters.genreType = undefined
    filters.sourceType = undefined
    filters.difficultyType = undefined
  }

  return {
    songsById,
    songs,
    filteredSongs,
    syncedAt,
    isHydrated,
    isSyncing,
    errorMessage,
    filters,
    hasCache,
    setSongs,
    hydrateCache,
    ensureReady,
    syncAllSongs,
    fetchSongById,
    getSong,
    clearFilters,
  }
})
