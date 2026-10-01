import { createPianoRollEditor, createTracksOverview, type PianoRollView } from '../../src/browser'
import type { PianoRollDocument } from '../../src/core'

declare global {
  interface Window {
    fixture: {
      overview: PianoRollView
      editor: PianoRollView
      seeks: number[]
      previews: (number | null)[]
      selections: string[]
      opened: string[]
      toggles: string[]
      openContexts: { trackId: string; selectedTrackIdAtGestureStart: string | null }[]
      setTime: (seconds: number, playing?: boolean) => void
      large: () => void
      paints: number
    }
  }
}
const documentModel: PianoRollDocument = {
  durationTicks: 96000,
  ticksPerBeat: 480,
  tempoMap: [
    { tick: 0, microsecondsPerQuarter: 500001 },
    { tick: 1920, microsecondsPerQuarter: 750003 },
  ],
  timeSignatureMap: [
    { tick: 0, numerator: 4, denominator: 4 },
    { tick: 3840, numerator: 3, denominator: 4 },
  ],
  tracks: Array.from({ length: 18 }, (_, index) => ({
    id: String(index),
    name: `Track ${index}`,
    isPercussion: false,
    enabled: true,
  })),
  notes: Array.from({ length: 1000 }, (_, index) => ({
    id: `n${index}`,
    trackId: String(index % 18),
    pitch: 48 + (index % 32),
    velocity: 90,
    startTick: index * 80,
    endTick: index * 80 + 180,
  })),
}
const seeks: number[] = []
const previews: (number | null)[] = []
const selections: string[] = []
const opened: string[] = []
const toggles: string[] = []
const openContexts: { trackId: string; selectedTrackIdAtGestureStart: string | null }[] = []
const overview = createTracksOverview({
  container: document.querySelector<HTMLElement>('#overview')!,
  document: documentModel,
  onSeek: (seconds) => seeks.push(seconds),
  onSeekPreview: (seconds) => previews.push(seconds),
  onTrackSelect: (id) => {
    selections.push(id)
    overview.setSelectedTrack(id)
    editor.setSelectedTrack(id)
  },
  onTrackOpen: (id, context) => {
    opened.push(id)
    openContexts.push({ trackId: id, ...context })
    editor.setSelectedTrack(id)
  },
  onTrackToggle: (id) => toggles.push(id),
})
const editor = createPianoRollEditor({
  container: document.querySelector<HTMLElement>('#editor')!,
  document: documentModel,
  selectedTrackId: '0',
  onSeek: (seconds) => seeks.push(seconds),
  onSeekPreview: (seconds) => previews.push(seconds),
})
window.fixture = {
  overview,
  editor,
  seeks,
  previews,
  selections,
  opened,
  toggles,
  openContexts,
  paints: 0,
  setTime(seconds, playing = false) {
    const transport = { positionSeconds: seconds, isPlaying: playing, playbackRate: 1 }
    overview.setTransport(transport)
    editor.setTransport(transport)
  },
  large() {
    const notes = Array.from({ length: 200000 }, (_, index) => ({
      id: `large${index}`,
      trackId: '0',
      startTick: index * 480,
      endTick: index * 480 + 200,
      pitch: 60,
      velocity: 90,
    }))
    overview.setDocument({ ...documentModel, durationTicks: 200001 * 480, notes })
  },
}
const clear = CanvasRenderingContext2D.prototype.clearRect
CanvasRenderingContext2D.prototype.clearRect = function (...args) {
  window.fixture.paints += 1
  return clear.apply(this, args)
}
