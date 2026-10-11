/** 录制试听的临时文档：保留原时间轴，曲尾以当前轨最后一个有效音符为准。 */
import { clipNoteToTrackRegion, type PianoRollDocument } from '@strawberrybear/piano-roll/core'

export function recordingPreviewDocument(
  document: PianoRollDocument,
  trackId: string,
  accompaniment: boolean
): PianoRollDocument {
  const target = document.tracks.find((track) => track.id === trackId)
  const endTick = Math.max(
    0,
    ...document.notes.flatMap((note) => {
      const visible =
        target && note.trackId === trackId ? clipNoteToTrackRegion(note, target) : null
      return visible ? [visible.endTick] : []
    })
  )
  const tracks = document.tracks.map((track) => ({
    ...track,
    enabled: track.id === trackId || (accompaniment && track.enabled),
    endTick: Math.min(track.endTick ?? endTick, endTick),
  }))
  const byId = new Map(tracks.map((track) => [track.id, track]))
  return {
    ...document,
    durationTicks: endTick,
    tracks,
    notes: document.notes.flatMap((note) => {
      const track = byId.get(note.trackId)
      const visible = track?.enabled && clipNoteToTrackRegion(note, track)
      return visible ? [visible] : []
    }),
  }
}
