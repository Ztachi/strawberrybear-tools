import { describe, expect, it } from 'vitest'
import type { MidiInfo } from '@/types'
import { sortSongsByAddedTime } from './utils'

/** 最小歌曲元数据，时间戳缺失用于验证旧库兼容。 */
function song(filename: string, added_at?: number): MidiInfo {
  return {
    filename,
    added_at,
    file_path: filename,
    duration_ms: 0,
    track_count: 0,
    melody_note_count: 0,
    ticks_per_beat: 480,
    tempo: 500000,
    events: [],
  }
}

describe('歌曲添加时间排序', () => {
  it('默认最新在前，可切到最早在前，原数组与未知时间的相对顺序不变', () => {
    const source = [
      song('old.mid', 100),
      song('new.mid', 300),
      song('middle.mid', 200),
      song('legacy-b.mid'),
      song('legacy-a.mid'),
    ]
    expect(sortSongsByAddedTime(source).map((item) => item.filename)).toEqual([
      'new.mid',
      'middle.mid',
      'old.mid',
      'legacy-b.mid',
      'legacy-a.mid',
    ])
    expect(sortSongsByAddedTime(source, 'asc').map((item) => item.filename)).toEqual([
      'old.mid',
      'middle.mid',
      'new.mid',
      'legacy-b.mid',
      'legacy-a.mid',
    ])
    expect(source.map((item) => item.filename)).toEqual([
      'old.mid',
      'new.mid',
      'middle.mid',
      'legacy-b.mid',
      'legacy-a.mid',
    ])
  })
  it('同毫秒导入保持既有顺序，非法时间与旧数据一起排在末尾', () => {
    const source = [
      song('invalid.mid', NaN),
      song('b.mid', 300),
      song('a.mid', 300),
      song('negative.mid', -1),
    ]
    expect(sortSongsByAddedTime(source).map((item) => item.filename)).toEqual([
      'b.mid',
      'a.mid',
      'invalid.mid',
      'negative.mid',
    ])
  })
})
