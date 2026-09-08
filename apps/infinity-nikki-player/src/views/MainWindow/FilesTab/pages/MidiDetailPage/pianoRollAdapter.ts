import { createTimeline } from '@strawberrybear/piano-roll/core'
import type {
  PianoRollDocument,
  PianoRollNote,
  PianoRollTrack,
} from '@strawberrybear/piano-roll/core'
import type { MidiInfo } from '@/types'

/**
 * @description: 将 Rust MIDI 数据转换为公共卷帘文档，保留空轨、源 tick 和稳定音符 ID。
 * @param {MidiInfo | null} midi 原始 MIDI；没有详情时返回空文档
 * @param {(index: number) => string} trackName 缺少 Track Name 时的本地化后备名称，参数从 1 开始
 * @return {PianoRollDocument} 与 transport、启用配置无关的源文档
 */
export function adaptMidiToPianoRoll(
  midi: MidiInfo | null,
  trackName: (index: number) => string
): PianoRollDocument {
  const ids = new Set<string>()
  const notes = (midi?.events ?? []).map<PianoRollNote>((note, index) => {
    const rawTrack = note.source_track ?? note.track
    const fallback = `note-${rawTrack}-${note.channel}-${note.start_tick}-${note.pitch}-${index}`
    const candidate = note.id?.trim() || fallback
    let id = candidate
    let duplicate = 0
    while (ids.has(id)) id = `${fallback}-${duplicate++}`
    ids.add(id)
    return {
      id,
      trackId: String(rawTrack),
      pitch: note.pitch,
      velocity: note.velocity,
      startTick: note.start_tick,
      endTick: note.end_tick,
    }
  })

  const metadata = new Map((midi?.tracks ?? []).map((track) => [track.index, track]))
  const trackIndexes = new Set<number>(metadata.keys())
  const trackCount = Number.isFinite(midi?.track_count) ? Math.max(0, midi!.track_count) : 0
  for (let index = 0; index < trackCount; index += 1) trackIndexes.add(index)
  const channels = new Map<number, number>()
  const percussion = new Set<number>()
  for (const note of midi?.events ?? []) {
    const rawTrack = note.source_track ?? note.track
    trackIndexes.add(rawTrack)
    if (!channels.has(rawTrack)) channels.set(rawTrack, note.channel)
    if (note.channel === 9) percussion.add(rawTrack)
  }
  const tracks = Array.from(trackIndexes)
    .sort((a, b) => a - b)
    .map<PianoRollTrack>((index) => {
      const track = metadata.get(index)
      const endTick = track?.end_tick
      // MIDI 原轨从 0 开始，保留前导/尾部静音；旧数据缺少轨长时交给公共库按音符推导。
      const hasTrackEnd = typeof endTick === 'number' && Number.isFinite(endTick) && endTick >= 0
      return {
        id: String(index),
        name: track?.name.trim() || trackName(index + 1),
        channel: track?.channel ?? channels.get(index),
        isPercussion: track?.is_percussion ?? percussion.has(index),
        enabled: true,
        ...(hasTrackEnd ? { startTick: 0, endTick } : {}),
      }
    })

  const document: PianoRollDocument = {
    durationTicks: midi?.duration_ticks ?? 0,
    ticksPerBeat: midi?.ticks_per_beat || 480,
    tempoMap: midi?.tempo_map?.length
      ? midi.tempo_map.map((point) => ({
          tick: point.tick,
          microsecondsPerQuarter: point.microseconds_per_quarter,
        }))
      : [{ tick: 0, microsecondsPerQuarter: midi?.tempo || 500000 }],
    timeSignatureMap: (midi?.time_signature_map ?? []).map((point) => ({
      tick: point.tick,
      numerator: point.numerator,
      denominator: point.denominator,
    })),
    tracks,
    notes,
  }
  if (midi?.duration_ticks === undefined) {
    // 旧缓存保留已存时长与音符尾部；新解析结果始终以完整结束 tick 为准。
    let lastNoteTick = 0
    for (const note of notes) lastNoteTick = Math.max(lastNoteTick, note.endTick)
    document.durationTicks = Math.max(
      lastNoteTick,
      createTimeline(document).secondsToTick((midi?.duration_ms ?? 0) / 1000)
    )
  }
  return document
}

/**
 * @description: 仅替换轨道启用状态，不重新转换大型音符数组；1-based 配置映射只存在于 app。
 * @param {PianoRollDocument} document 源文档
 * @param {ReadonlySet<number>} disabledTracks MIDI 播放器使用的原始轨号加一集合
 * @return {PianoRollDocument} 复用音符、tempo 与拍号的显示文档
 */
export function applyPianoTrackEnabled(
  document: PianoRollDocument,
  disabledTracks: ReadonlySet<number>
): PianoRollDocument {
  return {
    ...document,
    tracks: document.tracks.map((track) => ({
      ...track,
      enabled: !disabledTracks.has(Number(track.id) + 1),
    })),
  }
}
