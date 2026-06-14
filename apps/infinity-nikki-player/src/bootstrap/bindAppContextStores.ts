/**
 * @fileOverview 应用运行时与 Pinia store 绑定
 * @description 将 bootstrap 阶段创建的 Player 和 MIDI 试听 feature 注入 Pinia，避免 store 自行 new 公共库实例。
 */
import type { Pinia } from 'pinia'
import type { AppContext } from './createAppContext'
import { usePlayerStore } from '@/stores/player'

/**
 * @description: 绑定应用上下文到 Pinia stores
 * @param {Pinia} pinia - 当前 Vue 应用使用的 Pinia 实例
 * @param {AppContext} appContext - 应用运行时上下文
 * @return {void} 无返回值
 */
export function bindAppContextStores(pinia: Pinia, appContext: AppContext): void {
  const playerStore = usePlayerStore(pinia)
  playerStore.bindPreviewRuntime(appContext.player, appContext.midiPreview)
}
