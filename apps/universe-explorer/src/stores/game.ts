/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:27:11
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 18:30:00
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/stores/game.ts
 * @Description: 游戏状态 Store — 音频状态 + 游戏阶段管理
 */
/**
 * @fileOverview 游戏状态 Store
 * @description 管理游戏阶段和音频状态，是 Vue UI 与游戏核心的唯一通信桥梁
 * @description AudioSystem 通过 getAudioState() 回调获取状态，实现解耦
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type GamePhase = 'idle' | 'playing'

export const useGameStore = defineStore('game', () => {
  // ========== 游戏阶段 ==========
  /** 当前游戏阶段 */
  const gamePhase = ref<GamePhase>('idle')

  /** @description: 进入游戏，触发 GameCanvas 挂载和引擎初始化 */
  function startGame(): void {
    gamePhase.value = 'playing'
  }

  /** @description: 返回主界面，触发 GameCanvas 卸载和引擎销毁 */
  function stopGame(): void {
    gamePhase.value = 'idle'
  }

  // ========== 音频状态 ==========
  /** 音乐是否开启（默认 true） */
  const musicEnabled = ref(true)

  /** 音量 0~1（默认 0.3） */
  const volume = ref(0.3)

  /** 是否静音（计算属性） */
  const isMuted = computed(() => !musicEnabled.value || volume.value === 0)

  /** @description: 切换音乐开关 */
  function toggleMusic(): void {
    musicEnabled.value = !musicEnabled.value
  }

  /** @description: 设置音量 */
  function setVolume(v: number): void {
    volume.value = Math.max(0, Math.min(1, v))
  }

  /**
   * @description: 供 AudioSystem 获取音频状态的回调（避免直接依赖 Pinia）
   * @return {object} 音频相关状态
   */
  function getAudioState(): { musicEnabled: boolean; volume: number; gamePhase: GamePhase } {
    return {
      musicEnabled: musicEnabled.value,
      volume: volume.value,
      gamePhase: gamePhase.value,
    }
  }

  return {
    // 游戏阶段
    gamePhase,
    startGame,
    stopGame,
    // 音频状态
    musicEnabled,
    volume,
    isMuted,
    toggleMusic,
    setVolume,
    getAudioState,
  }
})
