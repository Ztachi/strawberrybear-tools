import { createTracksOverview, type PianoRollView } from '../../src/browser'
import type { PianoRollDocument } from '../../src/core'

declare global {
  interface Window {
    regionView: PianoRollView
  }
}

const documentModel: PianoRollDocument = {
  durationTicks: 96_000,
  ticksPerBeat: 480,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500_000 }],
  timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [
    { id: 'short', name: '短轨道名称', startTick: 0, endTick: 1, enabled: true, isPercussion: false },
    { id: 'long', name: 'Long track', startTick: 9_600, endTick: 48_000, enabled: true, isPercussion: false },
    { id: 'end', name: 'End marker', startTick: 96_000, endTick: 96_000, enabled: true, isPercussion: false },
  ],
  notes: [
    { id: 'long-note', trackId: 'long', pitch: 60, velocity: 100, startTick: 12_000, endTick: 18_000 },
  ],
}

window.regionView = createTracksOverview({
  container: document.querySelector<HTMLElement>('#overview')!,
  document: documentModel,
})
