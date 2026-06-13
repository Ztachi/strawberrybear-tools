/**
 * @fileOverview 文件页工具函数
 */
import type { MidiInfo, SongList } from '@/types'

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
