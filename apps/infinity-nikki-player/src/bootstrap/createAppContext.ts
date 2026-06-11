/**
 * @fileOverview Infinity Nikki 应用运行时上下文装配
 * @description
 * 将平台无关 Player 与应用侧 MIDI 试听适配层组装为单例上下文。
 * 页面和 Pinia store 只消费上下文中的实例，不在组件内重复创建播放器状态机。
 */
import { Player } from '@strawberrybear/player'
import { MidiPreviewPlaybackFeature } from '@/features/player/midiPreview'

/** MIDI 试听默认启用首尾循环，匹配旧版上一曲/下一曲的循环体验。 */
const MIDI_PREVIEW_REPEAT_MODE = 'all'

/** MIDI 试听自然结束后停止并归零，保持当前详情页试听条的旧交互语义。 */
const MIDI_PREVIEW_END_BEHAVIOR = 'stop'

/**
 * @description: Infinity Nikki 应用运行时上下文
 */
export interface AppContext {
  /** 平台无关播放器状态机，负责试听队列、进度和播放模式。 */
  player: Player
  /** MIDI 试听应用适配层，负责连接 Player 和实际 MIDI 发声实现。 */
  midiPreview: MidiPreviewPlaybackFeature
}

/** 当前应用运行时上下文单例。 */
let appContext: AppContext | null = null

/**
 * @description: 创建应用运行时上下文
 * @return {AppContext} 已装配的播放器运行时上下文
 */
export function createAppContext(): AppContext {
  const midiPreview = new MidiPreviewPlaybackFeature()
  const player = new Player({
    audio: midiPreview,
    initialState: {
      repeatMode: MIDI_PREVIEW_REPEAT_MODE,
      endBehavior: MIDI_PREVIEW_END_BEHAVIOR,
    },
  })
  midiPreview.bindPlayer(player)

  return {
    player,
    midiPreview,
  }
}

/**
 * @description: 获取应用运行时上下文单例
 * @return {AppContext} 应用上下文
 */
export function getAppContext(): AppContext {
  if (!appContext) appContext = createAppContext()
  return appContext
}
