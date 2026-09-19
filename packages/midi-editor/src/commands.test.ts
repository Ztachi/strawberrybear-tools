import { describe, expect, it } from 'vitest'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import { copyNotes, pasteNotes } from './clipboard'
import {
  addNote,
  clampGroupDelta,
  deleteNotes,
  moveNotes,
  resizeNotes,
  setNoteVelocity,
} from './commands/notes'
import { quantizeNotes, transposeNotes } from './commands/quantize'
import {
  createEmptyDocument,
  ensureDurationCovers,
  setTempo,
  setTimeSignature,
  tempoToBpm,
} from './commands/song'
import { addTrack, duplicateTrack, removeTrack, reorderTrack, updateTrack } from './commands/tracks'
import { createHistory } from './history'
import { resolutionTicks, snapTick } from './snap'

function fixture(): PianoRollDocument {
  const base = createEmptyDocument('Lead', 't1')
  return {
    ...base,
    tracks: [...base.tracks, { id: 't2', name: 'Bass', isPercussion: false, enabled: true }],
    notes: [
      { id: 'a', trackId: 't1', pitch: 60, velocity: 100, startTick: 0, endTick: 480 },
      { id: 'b', trackId: 't1', pitch: 64, velocity: 90, startTick: 480, endTick: 960 },
      { id: 'c', trackId: 't2', pitch: 36, velocity: 80, startTick: 250, endTick: 700 },
    ],
  }
}

describe('notes commands', () => {
  it('adds a note with clamped values and generated id', () => {
    const { document, note } = addNote(fixture(), {
      trackId: 't1',
      pitch: 200,
      startTick: -10,
      endTick: -10,
      velocity: 0,
    })
    expect(document.notes).toHaveLength(4)
    expect(note.pitch).toBe(127)
    expect(note.startTick).toBe(0)
    expect(note.endTick).toBe(1)
    expect(note.velocity).toBe(1)
  })

  it('deletes notes and keeps reference when nothing matches', () => {
    const doc = fixture()
    expect(deleteNotes(doc, ['zzz'])).toBe(doc)
    expect(deleteNotes(doc, ['a', 'c']).notes.map((n) => n.id)).toEqual(['b'])
  })

  it('moves a group without splitting it at boundaries', () => {
    const doc = fixture()
    const moved = moveNotes(doc, ['a', 'b'], -300, 70)
    const a = moved.notes.find((n) => n.id === 'a')!
    const b = moved.notes.find((n) => n.id === 'b')!
    // 时间被整体截断到 0，音高整体截断使最高音 64 到 127。
    expect(a.startTick).toBe(0)
    expect(b.startTick).toBe(480)
    expect(b.pitch).toBe(127)
    expect(a.pitch).toBe(123)
    expect(clampGroupDelta([], 5, 5)).toEqual({ deltaTick: 0, deltaPitch: 0 })
  })

  it('resizes both edges with minimum length', () => {
    const doc = fixture()
    const shorter = resizeNotes(doc, ['a'], 'end', -1000)
    expect(shorter.notes[0]!.endTick).toBe(1)
    const start = resizeNotes(doc, ['b'], 'start', -1000)
    expect(start.notes[1]!.startTick).toBe(0)
    const tooFar = resizeNotes(doc, ['b'], 'start', 5000)
    expect(tooFar.notes[1]!.startTick).toBe(959)
  })

  it('sets velocity and ignores no-ops', () => {
    const doc = fixture()
    expect(setNoteVelocity(doc, [{ noteId: 'a', velocity: 100 }])).toBe(doc)
    expect(setNoteVelocity(doc, [{ noteId: 'a', velocity: 999 }]).notes[0]!.velocity).toBe(127)
  })
})

describe('tracks commands', () => {
  it('adds, updates, duplicates, reorders and removes tracks', () => {
    let doc = fixture()
    doc = addTrack(doc, { defaultName: (i) => `音轨 ${i}` }).document
    expect(doc.tracks[2]!.name).toBe('音轨 3')
    expect(doc.tracks[2]!.color).toBeDefined()
    doc = updateTrack(doc, 't1', { name: '  ', color: '#000', channel: 20 })
    expect(doc.tracks[0]!.name).toBe('Lead')
    expect(doc.tracks[0]!.channel).toBe(15)
    const dup = duplicateTrack(doc, 't1')
    expect(dup.track).not.toBeNull()
    expect(dup.document.tracks[1]!.id).toBe(dup.track!.id)
    expect(dup.document.notes.filter((n) => n.trackId === dup.track!.id)).toHaveLength(2)
    const reordered = reorderTrack(dup.document, 't2', 0)
    expect(reordered.tracks[0]!.id).toBe('t2')
    const removed = removeTrack(reordered, 't1')
    expect(removed.tracks.some((t) => t.id === 't1')).toBe(false)
    expect(removed.notes.some((n) => n.trackId === 't1')).toBe(false)
  })

  it('never removes the last track', () => {
    const single = createEmptyDocument()
    expect(removeTrack(single, 'track-1')).toBe(single)
  })
})

describe('song commands', () => {
  it('replaces tempo and meter maps', () => {
    const doc = setTempo(fixture(), 90)
    expect(tempoToBpm(doc.tempoMap[0]!.microsecondsPerQuarter)).toBe(90)
    expect(setTempo(doc, 90)).toBe(doc)
    const meter = setTimeSignature(doc, 3, 8)
    expect(meter.timeSignatureMap).toEqual([{ tick: 0, numerator: 3, denominator: 8 }])
    expect(setTimeSignature(doc, 4, 5).timeSignatureMap[0]!.denominator).toBe(4)
  })

  it('extends duration to cover notes by whole bars', () => {
    const doc = fixture()
    const { document } = addNote(doc, { trackId: 't1', pitch: 60, startTick: 20000, endTick: 20100 })
    const covered = ensureDurationCovers(document)
    // 20100 / 1920 = 10.47 → (10 + 2) 小节
    expect(covered.durationTicks).toBe(12 * 1920)
    expect(ensureDurationCovers(doc)).toBe(doc)
  })
})

describe('snap / quantize / transpose', () => {
  it('computes resolution ticks and snaps', () => {
    const doc = fixture()
    expect(resolutionTicks('1/4', doc)).toBe(480)
    expect(resolutionTicks('1/8t', doc)).toBe(160)
    expect(resolutionTicks('bar', doc)).toBe(1920)
    expect(resolutionTicks('off', doc)).toBe(0)
    expect(snapTick(250, '1/8', doc)).toBe(240)
    expect(snapTick(250, '1/8', doc, 'floor')).toBe(240)
    expect(snapTick(479, '1/4', doc, 'floor')).toBe(0)
    expect(snapTick(479, 'off', doc)).toBe(479)
  })

  it('snaps relative to meter change anchor', () => {
    const doc: PianoRollDocument = {
      ...fixture(),
      timeSignatureMap: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1000, numerator: 3, denominator: 4 },
      ],
    }
    // 1000 之后网格从 1000 开始，1400 → 1480 更近
    expect(snapTick(1400, '1/4', doc)).toBe(1480)
    expect(resolutionTicks('bar', doc, 1500)).toBe(1440)
  })

  it('quantizes start and length', () => {
    const doc = fixture()
    const q = quantizeNotes(doc, ['c'], '1/8', { start: true, length: true })
    const c = q.notes.find((n) => n.id === 'c')!
    expect(c.startTick).toBe(240)
    expect(c.endTick).toBe(240 + 480)
    expect(quantizeNotes(doc, ['c'], 'off')).toBe(doc)
  })

  it('transposes as a group', () => {
    const doc = fixture()
    const up = transposeNotes(doc, ['a', 'b'], 100)
    expect(up.notes[1]!.pitch).toBe(127)
    expect(up.notes[0]!.pitch).toBe(123)
    expect(transposeNotes(doc, [], 3)).toBe(doc)
  })
})

describe('clipboard', () => {
  it('copies relative to earliest start and pastes with new ids', () => {
    const doc = fixture()
    const payload = copyNotes(doc, ['b', 'c'])!
    expect(payload.notes[0]!.startTick).toBe(0)
    expect(payload.minPitch).toBe(36)
    const result = pasteNotes(doc, payload, { atTick: 2000, trackId: 't1' })
    expect(result.noteIds).toHaveLength(2)
    const pasted = result.document.notes.filter((n) => result.noteIds.includes(n.id))
    expect(pasted.every((n) => n.trackId === 't1')).toBe(true)
    expect(Math.min(...pasted.map((n) => n.startTick))).toBe(2000)
    expect(copyNotes(doc, [])).toBeNull()
  })

  it('scales ticks across different PPQ', () => {
    const doc = fixture()
    const payload = { ...copyNotes(doc, ['a'])!, ticksPerBeat: 240 }
    const result = pasteNotes(doc, payload, { atTick: 0 })
    const note = result.document.notes.find((n) => n.id === result.noteIds[0])!
    expect(note.endTick).toBe(960)
  })
})

describe('history', () => {
  it('coalesces same key and truncates redo', () => {
    const history = createHistory(0, 3)
    history.commit(1, 'a')
    history.commit(2, 'drag', 'k')
    history.commit(3, 'drag', 'k')
    expect(history.present).toBe(3)
    expect(history.undo()).toBe(1)
    expect(history.redo()).toBe(3)
    history.undo()
    history.commit(9, 'new')
    expect(history.canRedo).toBe(false)
    history.commit(10, 'x')
    history.commit(11, 'y')
    // 上限 3 步：0 被丢弃
    history.undo()
    history.undo()
    history.undo()
    expect(history.present).toBe(1)
    expect(history.canUndo).toBe(false)
  })

  it('does not coalesce across undo', () => {
    const history = createHistory('s0')
    history.commit('s1', 'drag', 'k')
    history.undo()
    history.commit('s2', 'drag', 'k')
    expect(history.canUndo).toBe(true)
    expect(history.undo()).toBe('s0')
  })
})
