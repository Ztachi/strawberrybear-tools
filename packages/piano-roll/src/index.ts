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
  eventTrackValue: number
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

function tickToSeconds(tick: number, tempo: number, ticksPerBeat: number): number {
  return (tick / ticksPerBeat) * (tempo / 1000000)
}

function drawNotes(
  c: CanvasRenderingContext2D,
  width: number,
  pixelsPerSecond: number,
  tempo: number,
  ticksPerBeat: number,
  notes: NoteEvent[],
  colors: string[],
  disabledTracks: Set<number>,
  trackIndexToDisplayIndex: Map<number, number>,
  trackHeight: number
) {
  // 分隔线
  const trackCount = Math.max(...Array.from(trackIndexToDisplayIndex.values()), 0) + 1
  for (let i = 0; i < trackCount; i++) {
    const trackY = i * trackHeight
    c.strokeStyle = 'rgba(247, 192, 193, 0.4)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(0, trackY + trackHeight - 0.5)
    c.lineTo(width, trackY + trackHeight - 0.5)
    c.stroke()
  }

  // 绘制音符
  for (const note of notes) {
    const displayIndex = trackIndexToDisplayIndex.get(note.track)
    if (displayIndex === undefined) continue

    // disabledTracks 存储的是 midiPlayerTrackValue (= eventTrackValue + 1)
    const midiPlayerTrackValue = note.track + 1
    const isEnabled = !disabledTracks.has(midiPlayerTrackValue)
    const trackY = displayIndex * trackHeight

    const noteX = tickToSeconds(note.start_tick, tempo, ticksPerBeat) * pixelsPerSecond
    const noteDurationSec = tickToSeconds(note.end_tick - note.start_tick, tempo, ticksPerBeat)
    const noteW = Math.max(MIN_NOTE_WIDTH, noteDurationSec * pixelsPerSecond - NOTE_GAP)
    const noteY = trackY + getNoteY(note.pitch)

    if (noteX + noteW < 0 || noteX > width) continue

    c.fillStyle = isEnabled ? getChannelColor(note.channel, colors) : 'rgba(0, 0, 0, 0.15)'
    c.fillRect(noteX, noteY, noteW, NOTE_HEIGHT)
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
  const ratio = duration > 0 ? currentTime / duration : 0
  const x = ratio * (width - 20) // 留出 20px 给播放指针
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
  const tempo = options.tempo || 500000
  const ticksPerBeat = options.ticksPerBeat || 480

  // 建立 MIDI event.track 值 -> display index 的映射
  const trackIndexToDisplayIndex = new Map<number, number>()
  for (let i = 0; i < options.tracks.length; i++) {
    trackIndexToDisplayIndex.set(options.tracks[i].eventTrackValue, i)
  }

  function draw() {
    const maxTick = getMaxTick(options.notes)
    const maxSeconds = tickToSeconds(maxTick, tempo, ticksPerBeat)

    // 获取容器宽度，如果没有则用默认值
    const containerWidth = options.container.clientWidth || 600
    // 计算像素密度，使音符刚好填满宽度
    const pixelsPerSecond = maxSeconds > 0 ? (containerWidth - 20) / maxSeconds : 10
    const width = Math.max(containerWidth, maxSeconds * pixelsPerSecond + 20)
    const height = options.tracks.length * trackHeight

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    c.scale(dpr, dpr)

    c.fillStyle = 'rgba(247, 192, 193, 0.02)'
    c.fillRect(0, 0, width, height)

    drawNotes(c, width, pixelsPerSecond, tempo, ticksPerBeat, options.notes, colors, options.disabledTracks, trackIndexToDisplayIndex, trackHeight)
    drawPlayhead(c, options.currentTime, options.duration, width, options.tracks.length, trackHeight)
  }

  draw()

  return () => {}
}

export default drawPianoRoll
