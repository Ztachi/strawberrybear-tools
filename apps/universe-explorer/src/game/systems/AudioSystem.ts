/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:26:18
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 18:30:00
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/systems/AudioSystem.ts
 * @Description: 音频系统 — 状态驱动的音频调度中心
 */
/**
 * @fileOverview 音频系统
 * @description 通过 IAudioService 处理游戏音效，基于状态驱动
 * @description 监听 Pinia store 状态变化，执行音频行为
 * @description Vue 层仅通过 store.musicEnabled / store.volume 控制音频
 */
import type { ISystem } from '../interfaces/ISystem'
import type { IAudioService } from '../interfaces/IAudioService'

/** 音频相关状态类型（由 Vue 层通过 Pinia 注入） */
export interface AudioState {
  /** 音乐是否开启 */
  musicEnabled: boolean
  /** 音量 0~1 */
  volume: number
  /** 当前游戏阶段 */
  gamePhase: 'idle' | 'playing'
}

export class AudioSystem implements ISystem {
  private _audioService: IAudioService
  private readonly _getState: () => AudioState
  private _lastBGMPlaying = false

  /**
   * @param {IAudioService} audioService - 音频服务（当前为 WebAudioService）
   * @param {() => AudioState} getState - 获取音频状态的回调（避免直接依赖 Pinia）
   */
  constructor(audioService: IAudioService, getState: () => AudioState) {
    this._audioService = audioService
    this._getState = getState
  }

  /** @description: 初始化，尝试播放 BGM（如果启用且在游戏中） */
  init(): void {
    const state = this._getState()
    this._syncVolume(state)
    this._syncBGM(state)
  }

  /**
   * @description: 每帧同步音频状态
   * @param {number} _deltaTime - 距上一帧时间差（秒）
   */
  update(_deltaTime: number): void {
    const state = this._getState()
    this._syncVolume(state)
    this._syncBGM(state)
  }

  /** @description: 同步音量设置 */
  private _syncVolume(state: AudioState): void {
    this._audioService.setVolume(state.volume)
    this._audioService.setBGMVolume(state.volume)
  }

  /** @description: 根据状态同步 BGM 播放 */
  private _syncBGM(state: AudioState): void {
    const shouldPlay = state.musicEnabled && state.gamePhase === 'playing'

    if (shouldPlay && !this._lastBGMPlaying) {
      this._audioService.playBGM('space')
      this._lastBGMPlaying = true
    } else if (!shouldPlay && this._lastBGMPlaying) {
      this._audioService.stopBGM()
      this._lastBGMPlaying = false
    }
  }

  /**
   * @description: 播放音效（由游戏逻辑调用，如碰撞、加速等）
   * @param {string} name - SFX 标识符
   * @param {object} options - 播放选项
   */
  playSFX(name: string, options?: { loop?: boolean; volume?: number }): void {
    this._audioService.playSFX(name, options)
  }

  /**
   * @description: 停止所有音频（游戏结束时调用）
   */
  dispose(): void {
    this._audioService.stopBGM()
    this._audioService.stopAllSFX()
    this._lastBGMPlaying = false
  }
}
