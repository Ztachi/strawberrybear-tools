/**
 * @fileOverview 文件页工具函数
 */
import type { MidiInfo, SongList } from '@/types'

/**
 * 按曲库添加时间稳定排序，不修改 store 中的原集合；未知时间始终放在末尾。
 * @param songs 当前集合的歌曲。
 * @param order desc 最新在前，asc 最早在前。
 * @returns 用于展示和播放队列的排序副本。
 */
export function sortSongsByAddedTime(
  songs: readonly MidiInfo[],
  order: 'asc' | 'desc' = 'desc'
): MidiInfo[] {
  const timestamp = (song: MidiInfo): number | null =>
    typeof song.added_at === 'number' && Number.isFinite(song.added_at) && song.added_at > 0
      ? song.added_at
      : null
  return [...songs].sort((a, b) => {
    const left = timestamp(a)
    const right = timestamp(b)
    if (left === null) return right === null ? 0 : 1
    if (right === null) return -1
    return order === 'desc' ? right - left : left - right
  })
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function getSongListSongs(songList: SongList | null, midiLibrary: MidiInfo[]): MidiInfo[] {
  if (!songList) return []
  const midiMap = new Map(midiLibrary.map((midi) => [midi.filename, midi]))
  return songList.song_filenames
    .map((filename) => midiMap.get(filename))
    .filter((midi): midi is MidiInfo => Boolean(midi))
}

export function buildCollectionContext(id: string, title: string) {
  return {
    id,
    title,
  }
}
