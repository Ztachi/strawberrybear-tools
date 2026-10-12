/** 录制的 WebAudio 适配器；复用共享音色，每个会话单独拥有声音句柄。 */
import { createEditorTransport } from '@strawberrybear/midi-editor'
import type { PianoRollDocument } from '@strawberrybear/midi-editor'
import { createTimeline } from '@strawberrybear/piano-roll/core'
import { ensureAudioRunning, getAudioClock, getAudioContext, scheduleNote } from '@/lib/midiPlayer'
import type { RecorderAudio } from './types'

export function createRecorderAudio(trackId: string): RecorderAudio {
  let transport: ReturnType<typeof createEditorTransport> | undefined
  const voices = new Map<number, { stop(when?: number): void }[]>()
  const clicks = new Set<OscillatorNode>()
  const scheduled = new Map<{ stop(when?: number): void }, number>()
  function stopAccompaniment(): void {
    transport?.dispose()
    transport = undefined
    for (const oscillator of clicks) {
      try {
        oscillator.stop()
      } catch {
        /* 已停止 */
      }
    }
    clicks.clear()
  }
  return {
    prepare: ensureAudioRunning,
    now: getAudioClock,
    note: (pitch, velocity) => scheduleNote(pitch, velocity, getAudioClock()),
    startAccompaniment(document, atTick, range, anchorClock) {
      stopAccompaniment()
      let accompaniment: PianoRollDocument = document
      if (range)
        accompaniment = {
          ...document,
          notes: document.notes.flatMap((note) => {
            if (
              note.trackId !== trackId ||
              note.endTick <= range.startTick ||
              note.startTick >= range.endTick
            )
              return [note]
            const outside = []
            if (note.startTick < range.startTick)
              outside.push({ ...note, endTick: range.startTick })
            if (note.endTick > range.endTick) outside.push({ ...note, startTick: range.endTick })
            return outside
          }),
        }
      // 只延长临时伴奏传输的停止边界，真实项目和卷帘不写入这段留白。
      accompaniment = {
        ...accompaniment,
        durationTicks: Math.max(accompaniment.durationTicks, 2 ** 31 - 1),
      }
      transport = createEditorTransport({
        getDocument: () => accompaniment,
        now: getAudioClock,
        synth: {
          noteOn(pitch, velocity, when) {
            const voice = scheduleNote(pitch, velocity, when)
            if (voice) {
              scheduled.set(voice, Infinity)
              voices.set(pitch, [...(voices.get(pitch) ?? []), voice])
            }
          },
          noteOff(pitch, when) {
            const voice = voices.get(pitch)?.shift()
            if (voice) {
              voice.stop(when)
              scheduled.set(voice, when)
            }
            for (const [finished, end] of scheduled)
              if (end <= getAudioClock()) scheduled.delete(finished)
          },
          allNotesOff() {
            for (const voice of scheduled.keys()) voice.stop()
            scheduled.clear()
            voices.clear()
          },
        },
      })
      transport.play(
        createTimeline(document).tickToSeconds(atTick) +
          Math.max(0, getAudioClock() - (anchorClock ?? getAudioClock()))
      )
    },
    stopAccompaniment,
    click(accent, when) {
      const context = getAudioContext()
      if (!context || context.state !== 'running') return
      const start = Math.max(context.currentTime, when)
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = accent ? 1200 : 800
      gain.gain.setValueAtTime(0.06, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05)
      oscillator.connect(gain)
      gain.connect(context.destination)
      clicks.add(oscillator)
      oscillator.onended = () => {
        clicks.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + 0.05)
    },
  }
}
