import type { MidiInfo } from '@/types'

const WINDOWS_FILENAME_RESERVED_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

function replaceInvalidFilenameChar(char: string): string {
  return char.charCodeAt(0) < 32 || WINDOWS_FILENAME_RESERVED_CHARS.has(char) ? '_' : char
}

export function stripMidiExtension(filename: string): string {
  const basename = filename.split(/[/\\]/).pop() || filename
  return basename.replace(/\.(mid|midi)$/i, '')
}

export function getMidiDisplayTitle(midi: Pick<MidiInfo, 'filename' | 'title'> | null | undefined) {
  const title = midi?.title?.trim()
  return title || stripMidiExtension(midi?.filename ?? '')
}

export function getMidiDisplayArtist(midi: Pick<MidiInfo, 'author_name'> | null | undefined) {
  return midi?.author_name?.trim() || ''
}

export function getMidiDisplayName(
  midi: Pick<MidiInfo, 'filename' | 'title' | 'author_name'> | null | undefined
) {
  const title = getMidiDisplayTitle(midi)
  const artist = getMidiDisplayArtist(midi)
  return artist ? `${title}/${artist}` : title
}

export function sanitizeMidiFilename(name: string): string {
  const fallback = 'online-song'
  const safe = Array.from(stripMidiExtension(name).trim(), replaceInvalidFilenameChar)
    .join('')
    .replace(/\s+/g, ' ')
  const basename = safe && safe !== '.' && safe !== '..' ? safe : fallback
  return `${basename}.mid`
}
