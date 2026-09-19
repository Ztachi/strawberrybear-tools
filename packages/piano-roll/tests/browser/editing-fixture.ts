import { createPianoRollEditor, createTracksOverview, type PianoRollEditIntent, type PianoRollEditingOptions, type PianoRollView } from '../../src/browser'
import type { PianoRollDocument } from '../../src/core'

declare global {
  interface Window {
    editing: {
      editor: PianoRollView
      overview: PianoRollView
      intents: PianoRollEditIntent[]
      document: PianoRollDocument
      /** 用当前选择/工具重新下发 editing 配置。 */
      configure(patch: Partial<Omit<PianoRollEditingOptions, 'onIntent' | 'snapTicks'>>): void
      select(ids: string[]): void
      /** 把 tick/pitch 转成滚动层内的 CSS 坐标（当前视口）。 */
      point(tick: number, pitch: number): { x: number; y: number }
      actions: string[]
    }
  }
}

/** 120 BPM、PPQ 480、4 小节。 */
const documentModel: PianoRollDocument = {
  durationTicks: 480 * 16,
  ticksPerBeat: 480,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500_000 }],
  timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [
    { id: 't1', name: 'Lead', isPercussion: false, enabled: true },
    { id: 't2', name: 'Bass', isPercussion: false, enabled: true },
  ],
  notes: [
    { id: 'a', trackId: 't1', pitch: 60, velocity: 100, startTick: 480, endTick: 960 },
    { id: 'b', trackId: 't1', pitch: 64, velocity: 80, startTick: 1440, endTick: 1920 },
    { id: 'c', trackId: 't1', pitch: 67, velocity: 60, startTick: 2400, endTick: 2880 },
  ],
}
const intents: PianoRollEditIntent[] = []
const actions: string[] = []
let selected = new Set<string>()
let editing: PianoRollEditingOptions = {
  enabled: true,
  tool: 'select',
  selectedNoteIds: selected,
  snapTicks: (tick, mode) => (mode === 'floor' ? Math.floor(tick / 120) * 120 : Math.round(tick / 120) * 120),
  defaultDurationTicks: 240,
  velocityLaneHeight: 60,
  onIntent: (intent) => {
    intents.push(intent)
    if (intent.type === 'select') {
      selected = intent.mode === 'replace' ? new Set(intent.noteIds) : new Set([...selected, ...intent.noteIds])
      window.editing.configure({ selectedNoteIds: selected })
    }
  },
}
const editor = createPianoRollEditor({
  container: document.querySelector<HTMLElement>('#editor')!,
  document: documentModel,
  selectedTrackId: 't1',
  timeZoom: 100,
  pitchZoom: 16,
  editing,
})
const overview = createTracksOverview({
  container: document.querySelector<HTMLElement>('#overview')!,
  document: documentModel,
  selectedTrackId: 't1',
  renderTrackActions: (container, { track }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'track-action'
    button.textContent = '⋯'
    button.addEventListener('click', () => actions.push(track.id))
    container.append(button)
    return () => button.remove()
  },
})
window.editing = {
  editor,
  overview,
  intents,
  document: documentModel,
  actions,
  configure(patch) {
    editing = { ...editing, ...patch }
    editor.setEditing(editing)
    overview.setEditing(editing)
  },
  select(ids) {
    selected = new Set(ids)
    window.editing.configure({ selectedNoteIds: selected })
  },
  point(tick, pitch) {
    const viewport = editor.getViewport()
    const seconds = tick / 480 / 2
    return {
      x: seconds * viewport.timeZoom - viewport.scrollLeft,
      y: (127 - pitch) * viewport.pitchZoom - viewport.scrollTop + viewport.pitchZoom / 2,
    }
  },
}
