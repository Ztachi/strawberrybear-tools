import {
  createPianoRollEditor,
  createTracksOverview,
  type PianoRollView,
} from '../../src/browser'
import type { PianoRollDocument } from '../../src/core'

const documentModel: PianoRollDocument = {
  durationTicks: 96_000,
  ticksPerBeat: 480,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500_000 }],
  timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [
    { id: 'meta-empty', name: 'Metadata', isPercussion: false, enabled: true },
    { id: 'melody', name: 'Melody', isPercussion: false, enabled: true },
    { id: 'disabled', name: 'Muted music', isPercussion: false, enabled: false },
    { id: 'invalid', name: 'Invalid notes', isPercussion: false, enabled: true },
    {
      id: 'tail-empty',
      name: 'Long empty ending',
      isPercussion: false,
      enabled: true,
      endTick: 96_000,
    },
  ],
  notes: [
    { id: 'melody-note', trackId: 'melody', pitch: 60, velocity: 90, startTick: 0, endTick: 480 },
    { id: 'muted-note', trackId: 'disabled', pitch: 48, velocity: 90, startTick: 480, endTick: 960 },
    {
      id: 'invalid-note',
      trackId: 'invalid',
      pitch: Number.NaN,
      velocity: 90,
      startTick: 0,
      endTick: 480,
    },
  ],
}

const toggles: string[] = []
const followChanges: boolean[] = []
const overview = createTracksOverview({
  container: document.querySelector<HTMLElement>('#overview')!,
  document: documentModel,
  selectedTrackId: 'meta-empty',
  onTrackToggle: (id) => toggles.push(id),
  onFollowChange: (enabled) => followChanges.push(enabled),
})
const editor = createPianoRollEditor({
  container: document.querySelector<HTMLElement>('#editor')!,
  document: documentModel,
  selectedTrackId: 'melody',
  hideEmptyTracks: true,
})

declare global {
  interface Window {
    hideEmptyFixture: {
      document: PianoRollDocument
      overview: PianoRollView
      editor: PianoRollView
      toggles: string[]
      followChanges: boolean[]
      withInitialFilter: () => void
    }
  }
}

window.hideEmptyFixture = {
  document: documentModel,
  overview,
  editor,
  toggles,
  followChanges,
  withInitialFilter() {
    window.hideEmptyFixture.overview.destroy()
    window.hideEmptyFixture.overview = createTracksOverview({
      container: document.querySelector<HTMLElement>('#overview')!,
      document: documentModel,
      selectedTrackId: 'meta-empty',
      hideEmptyTracks: true,
    })
  },
}
