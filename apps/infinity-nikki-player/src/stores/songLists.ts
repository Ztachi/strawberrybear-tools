/**
 * @fileOverview 自建歌单状态管理
 * @description 负责歌单元数据、封面缓存、导入导出和歌曲索引维护。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { feedback as toast } from '@/lib/feedback'
import { i18n } from '@/i18n'
import type { SongList } from '@/types'

function t(key: string, params?: Record<string, unknown>): string {
  return i18n.global.t(key, params ?? {})
}

function toByteArray(data: Uint8Array | number[]): number[] {
  return data instanceof Uint8Array ? Array.from(data) : data
}

export const useSongListStore = defineStore('songLists', () => {
  /** 自建歌单列表，排序由后端保证。 */
  const songLists = ref<SongList[]>([])
  /** 封面文件名到对象 URL 的缓存。 */
  const coverUrls = ref<Record<string, string>>({})
  const isLoading = ref(false)

  const songListCount = computed(() => songLists.value.length)

  function replaceSongList(nextSongList: SongList): void {
    const index = songLists.value.findIndex((songList) => songList.id === nextSongList.id)
    if (index === -1) {
      songLists.value.unshift(nextSongList)
      return
    }
    songLists.value.splice(index, 1, nextSongList)
  }

  function getSongListById(songListId: string): SongList | null {
    return songLists.value.find((songList) => songList.id === songListId) ?? null
  }

  function revokeCoverUrl(coverFilename: string): void {
    const existingUrl = coverUrls.value[coverFilename]
    if (existingUrl) URL.revokeObjectURL(existingUrl)
    const nextCoverUrls = { ...coverUrls.value }
    delete nextCoverUrls[coverFilename]
    coverUrls.value = nextCoverUrls
  }

  async function loadCoverUrl(coverFilename: string | null | undefined): Promise<string | null> {
    if (!coverFilename) return null
    if (coverUrls.value[coverFilename]) return coverUrls.value[coverFilename]

    try {
      const data = await invoke<number[]>('read_song_list_cover', { coverFilename })
      const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }))
      coverUrls.value = {
        ...coverUrls.value,
        [coverFilename]: url,
      }
      return url
    } catch (error) {
      console.warn('读取歌单封面失败:', error)
      return null
    }
  }

  async function ensureVisibleCovers(nextSongLists: SongList[]): Promise<void> {
    const activeCoverNames = new Set(
      nextSongLists
        .map((songList) => songList.cover_filename)
        .filter((coverFilename): coverFilename is string => Boolean(coverFilename))
    )

    for (const coverFilename of Object.keys(coverUrls.value)) {
      if (!activeCoverNames.has(coverFilename)) revokeCoverUrl(coverFilename)
    }

    await Promise.all(nextSongLists.map((songList) => loadCoverUrl(songList.cover_filename)))
  }

  async function loadSongLists(): Promise<boolean> {
    isLoading.value = true
    try {
      const nextSongLists = await invoke<SongList[]>('get_song_lists')
      songLists.value = nextSongLists
      await ensureVisibleCovers(nextSongLists)
      return true
    } catch (error) {
      toast.error(t('songList.feedback.loadFailed'), {
        description: String(error),
        richColors: true,
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function createSongList(name: string): Promise<SongList | null> {
    try {
      const songList = await invoke<SongList>('create_song_list', { name })
      songLists.value.unshift(songList)
      return songList
    } catch (error) {
      toast.error(t('songList.feedback.createFailed'), {
        description: String(error),
        richColors: true,
      })
      return null
    }
  }

  async function saveSongList(songList: SongList): Promise<SongList | null> {
    try {
      const savedSongList = await invoke<SongList>('save_song_list', { songList })
      replaceSongList(savedSongList)
      await loadCoverUrl(savedSongList.cover_filename)
      toast.success(t('songList.feedback.saved'))
      return savedSongList
    } catch (error) {
      toast.error(t('songList.feedback.saveFailed'), {
        description: String(error),
        richColors: true,
      })
      return null
    }
  }

  async function renameSongList(songListId: string, newName: string): Promise<SongList | null> {
    try {
      const songList = await invoke<SongList>('rename_song_list', { songListId, newName })
      replaceSongList(songList)
      return songList
    } catch (error) {
      toast.error(t('songList.feedback.renameFailed'), {
        description: String(error),
        richColors: true,
      })
      return null
    }
  }

  async function deleteSongList(songListId: string): Promise<boolean> {
    try {
      await invoke('delete_song_list', { songListId })
      const deletedSongList = getSongListById(songListId)
      if (deletedSongList?.cover_filename) revokeCoverUrl(deletedSongList.cover_filename)
      songLists.value = songLists.value.filter((songList) => songList.id !== songListId)
      toast.success(t('songList.feedback.deleted'))
      return true
    } catch (error) {
      toast.error(t('songList.feedback.deleteFailed'), {
        description: String(error),
        richColors: true,
      })
      return false
    }
  }

  async function addSongs(songListId: string, filenames: string[]): Promise<SongList | null> {
    if (filenames.length === 0) return getSongListById(songListId)
    try {
      const songList = await invoke<SongList>('add_songs_to_song_list', { songListId, filenames })
      replaceSongList(songList)
      toast.success(t('songList.feedback.added'))
      return songList
    } catch (error) {
      toast.error(t('songList.feedback.addFailed'), {
        description: String(error),
        richColors: true,
      })
      return null
    }
  }

  async function removeSongs(songListId: string, filenames: string[]): Promise<SongList | null> {
    if (filenames.length === 0) return getSongListById(songListId)
    try {
      const songList = await invoke<SongList>('remove_songs_from_song_list', {
        songListId,
        filenames,
      })
      replaceSongList(songList)
      toast.success(t('songList.feedback.removed'))
      return songList
    } catch (error) {
      toast.error(t('songList.feedback.removeFailed'), {
        description: String(error),
        richColors: true,
      })
      return null
    }
  }

  async function saveCover(
    songListId: string,
    data: Uint8Array | number[]
  ): Promise<string | null> {
    try {
      const coverFilename = await invoke<string>('save_song_list_cover', {
        songListId,
        data: toByteArray(data),
      })
      revokeCoverUrl(coverFilename)
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(toByteArray(data))], { type: 'image/png' })
      )
      coverUrls.value = {
        ...coverUrls.value,
        [coverFilename]: url,
      }
      return coverFilename
    } catch (error) {
      toast.error(t('songList.feedback.coverFailed'), {
        description: String(error),
        richColors: true,
      })
      return null
    }
  }

  async function exportArchive(songListIds: string[], targetPath: string): Promise<boolean> {
    try {
      await invoke('export_song_lists_archive', { songListIds, targetPath })
      toast.success(t('songList.feedback.exported'))
      return true
    } catch (error) {
      toast.error(t('songList.feedback.exportFailed'), {
        description: String(error),
        richColors: true,
      })
      return false
    }
  }

  async function importArchive(sourcePath: string): Promise<SongList[]> {
    try {
      const importedSongLists = await invoke<SongList[]>('import_song_lists_archive', {
        sourcePath,
      })
      await loadSongLists()
      toast.success(t('songList.feedback.importedCount', { count: importedSongLists.length }))
      return importedSongLists
    } catch (error) {
      toast.error(t('songList.feedback.importFailed'), {
        description: String(error),
        richColors: true,
      })
      return []
    }
  }

  function removeSongFromLocalLists(filename: string): void {
    songLists.value = songLists.value.map((songList) => ({
      ...songList,
      song_filenames: songList.song_filenames.filter((item) => item !== filename),
    }))
  }

  return {
    songLists,
    coverUrls,
    isLoading,
    songListCount,
    loadSongLists,
    loadCoverUrl,
    createSongList,
    saveSongList,
    renameSongList,
    deleteSongList,
    addSongs,
    removeSongs,
    saveCover,
    exportArchive,
    importArchive,
    getSongListById,
    removeSongFromLocalLists,
  }
})
