import type { DefineComponent } from 'vue'
import type { NoteEvent, TrackInfo } from './index'

export interface PianoRollProps {
  notes: NoteEvent[]
  duration: number
  ticksPerBeat?: number
  tempo?: number
  tracks: TrackInfo[]
  disabledTracks: Set<number>
  disabledTracksVersion?: number
  currentTime: number
}

declare const PianoRoll: DefineComponent<PianoRollProps>

export default PianoRoll
