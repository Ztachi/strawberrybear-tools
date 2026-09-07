/** @description: 钢琴卷帘公共类型、时间轴与兼容导出。 */
export * from './core'

export interface NoteEvent {
  pitch: number
  velocity: number
  start_tick: number
  end_tick: number
  channel: number
  track: number
  id?: string
}

export interface TrackInfo {
  index: number
  eventTrackValue: number
  channel: number
  name: string
  noteCount: number
  isPercussion: boolean
  enabled: boolean
}
