/**
 * @description: 钢琴卷帘 Canvas 渲染器
 */

export interface NoteEvent {
  pitch: number
  velocity: number
  start_tick: number
  end_tick: number
  channel: number
  track: number
}

export interface TrackInfo {
  index: number
  channel: number
  name: string
  noteCount: number
  isPercussion: boolean
  enabled: boolean
}

export interface PianoRollOptions {
  container: HTMLElement
  notes: NoteEvent[]
  duration: number
  ticksPerBeat: number
  tempo: number
  tracks: TrackInfo[]
  disabledTracks: Set<number>
  currentTime: number
  trackHeight?: number
  colors?: string[]
}

const DEFAULT_COLORS = [
  '#F7C0C1', '#9B59B6', '#3498DB', '#2ECC71',
  '#E67E22', '#1ABC9C', '#E74C3C', '#F39C12',
]

const PIXELS_PER_SECOND = 10
const NOTE_HEIGHT = 2
const MIN_NOTE_WIDTH = 2
const NOTE_GAP = 1

function getChannelColor(channel: number, colors: string[] = DEFAULT_COLORS): string {
  return colors[channel % colors.length]
}

function getNoteY(pitch: number): number {
  return (127 - pitch) * NOTE_HEIGHT
}

function getMaxTick(notes: NoteEvent[]): number {
  if (!notes.length) return 0
  return Math.max(...notes.map((n) => n.end_tick))
}

function groupNotesByTrack(tracks: TrackInfo[], notes: NoteEvent[]): Map<number, NoteEvent[]> {
  const grouped = new Map<number, NoteEvent[]>()
  for (const track of tracks) {
    grouped.set(track.index, [])
  }
  for (const note of notes) {
    const trackNotes = grouped.get(note.track)
    if (trackNotes) {
      trackNotes.push(note)
    }
  }
  return grouped
}

/** tick -> 秒 */
function tickToSeconds(tick: number, tempo: number, ticksPerBeat: number): number {
  return (tick / ticksPerBeat) * (tempo / 1000000)
}

function drawNotes(
  c: CanvasRenderingContext2D,
  width: number,
  tempo: number,
  ticksPerBeat: number,
  trackNotes: Map<number, NoteEvent[]>,
  colors: string[],
  disabledTracks: Set<number>,
  tracks: TrackInfo[],
  trackHeight: number
) {
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    const trackY = i * trackHeight
    const isEnabled = !disabledTracks.has(track.index)
    const notes = trackNotes.get(track.index) || []

    c.strokeStyle = 'rgba(247, 192, 193, 0.1)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(0, trackY + trackHeight - 0.5)
    c.lineTo(width, trackY + trackHeight - 0.5)
    c.stroke()

    for (const note of notes) {
      const noteX = tickToSeconds(note.start_tick, tempo, ticksPerBeat) * PIXELS_PER_SECOND
      const noteDurationSec = tickToSeconds(note.end_tick - note.start_tick, tempo, ticksPerBeat)
      const noteW = Math.max(MIN_NOTE_WIDTH, noteDurationSec * PIXELS_PER_SECOND - NOTE_GAP)
      const noteY = trackY + getNoteY(note.pitch)

      if (noteX + noteW < 0 || noteX > width) continue

      c.fillStyle = isEnabled ? getChannelColor(note.channel, colors) : 'rgba(0, 0, 0, 0.15)'
      c.fillRect(noteX, noteY, noteW, NOTE_HEIGHT)
    }
  }
}

function drawPlayhead(
  c: CanvasRenderingContext2D,
  currentTime: number,
  duration: number,
  width: number,
  trackCount: number,
  trackHeight: number
) {
  // 简单的比例计算：当前时间 / 总时间 = 指针位置 / 总宽度
  const ratio = duration > 0 ? currentTime / duration : 0
  const x = ratio * width
  const totalHeight = trackCount * trackHeight

  c.strokeStyle = '#EF4444'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(x, 0)
  c.lineTo(x, totalHeight)
  c.stroke()

  c.fillStyle = '#EF4444'
  c.beginPath()
  c.moveTo(x - 4, 0)
  c.lineTo(x + 4, 0)
  c.lineTo(x, 6)
  c.closePath()
  c.fill()
}

export function drawPianoRoll(
  canvas: HTMLCanvasElement,
  options: PianoRollOptions
): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('Failed to get 2d context')
    return () => {}
  }
  const c = ctx

  const colors = options.colors || DEFAULT_COLORS
  const trackHeight = options.trackHeight || 176
  const maxTick = getMaxTick(options.notes)

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(800, tickToSeconds(maxTick, options.tempo, options.ticksPerBeat) * PIXELS_PER_SECOND + 100)
    const height = options.tracks.length * trackHeight

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    c.scale(dpr, dpr)

    return { width, height }
  }

  function draw() {
    const { width, height } = setupCanvas()
    const trackNotes = groupNotesByTrack(options.tracks, options.notes)

    c.fillStyle = 'rgba(247, 192, 193, 0.02)'
    c.fillRect(0, 0, width, height)

    drawNotes(c, width, options.tempo, options.ticksPerBeat, trackNotes, colors, options.disabledTracks, options.tracks, trackHeight)
    // 播放指针用 currentTime/duration 比例计算，确保同步
    drawPlayhead(c, options.currentTime, options.duration, width, options.tracks.length, trackHeight)
  }

  draw()

  return () => {}
}

export default drawPianoRoll
