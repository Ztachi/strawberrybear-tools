/** 使用游戏按键编译器检查精确映射及实际播放速度下的时序约束。 */
import { compileKeystrokeTimeline } from '@strawberrybear/keystroke-sequencer'
import { clipNoteToTrackRegion, createTimeline } from '@strawberrybear/piano-roll/core'
import type { PianoRollDocument } from '@strawberrybear/midi-editor'
import type { KeyTemplate } from '@/types'
import { createKeyboardTimingProfile } from '@/lib/keyboardTiming'

export interface PlaybackIssue {
  kind: 'unmapped' | 'merged' | 'overlap' | 'timing'
  noteIds: string[]
}
export function checkRecordingPlayback(
  document: PianoRollDocument,
  template: KeyTemplate,
  fps: number,
  speed: number
) {
  const timing = createKeyboardTimingProfile(fps)
  const rate = Number.isFinite(speed) && speed > 0 ? speed : 1
  const timeline = createTimeline(document)
  const tracks = new Map(document.tracks.filter((t) => t.enabled).map((t) => [t.id, t]))
  const keys = new Map(template.mappings.map((m) => [m.pitch, m.key.trim().toUpperCase()]))
  const issues: PlaybackIssue[] = []
  const mapped = document.notes.flatMap((note) => {
    const track = tracks.get(note.trackId)
    const visible = track && clipNoteToTrackRegion(note, track)
    if (!visible) return []
    const key = keys.get(note.pitch)
    if (!key) {
      issues.push({ kind: 'unmapped', noteIds: [note.id] })
      return []
    }
    const startMs = timeline.tickToSeconds(visible.startTick) * 1000
    return [
      {
        id: note.id,
        key,
        startMs,
        durationMs: timeline.tickToSeconds(visible.endTick) * 1000 - startMs,
      },
    ]
  })
  const events = compileKeystrokeTimeline(mapped, {
    holdMs: timing.holdMs,
    gapMs: timing.releaseMs,
  })
  const groups = new Map<string, typeof mapped>()
  for (const note of mapped) groups.set(note.key, [...(groups.get(note.key) ?? []), note])
  for (const [key, notes] of groups) {
    notes.sort((a, b) => a.startMs - b.startMs)
    let longest: (typeof notes)[number] | undefined
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]!,
        previous = notes[i - 1]
      if (previous?.startMs === note.startMs)
        issues.push({ kind: 'merged', noteIds: [previous.id, note.id] })
      else if (longest && longest.startMs + longest.durationMs > note.startMs)
        issues.push({ kind: 'overlap', noteIds: [longest.id, note.id] })
      if (!longest || note.startMs + note.durationMs > longest.startMs + longest.durationMs)
        longest = note
    }
    const sequence = events.filter((event) => event.key === key)
    for (let i = 0; i < sequence.length; i++) {
      const event = sequence[i]!,
        next = sequence[i + 1]
      if (!next) continue
      const required = event.type === 'down' ? timing.holdMs : timing.releaseMs
      if ((next.atMs - event.atMs) / rate + 0.001 < required) {
        const affected = notes
          .filter((note) => note.startMs >= event.atMs && note.startMs <= next.atMs)
          .map((note) => note.id)
        if (!affected.length)
          affected.push([...notes].reverse().find((note) => note.startMs <= event.atMs)!.id)
        issues.push({ kind: 'timing', noteIds: affected })
      }
    }
  }
  return { fps: timing.fps, speed: rate, issues }
}
