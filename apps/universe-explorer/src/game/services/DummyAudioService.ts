/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:55
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 19:00:00
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/services/DummyAudioService.ts
 * @Description: 音频服务实现（Web Audio API）
 */
/**
 * @fileOverview 音频服务
 * @description 实现 IAudioService，使用 Web Audio API 播放音频
 * @description BGM 循环播放，SFX 短音效支持
 */
import type { IAudioService } from '../interfaces/IAudioService'

const BGM_PATH = '/assets/BGM/space.mp3'

export class WebAudioService implements IAudioService {
  private _bgmAudio: HTMLAudioElement | null = null
  private _sfxChannels = new Map<string, HTMLAudioElement>()
  private _volume = 1
  private _bgmVolume = 0.3
  private _isPaused = false

  constructor() {
    this._initBGM()
  }

  private _initBGM(): void {
    this._bgmAudio = new Audio(BGM_PATH)
    this._bgmAudio.loop = true
    this._bgmAudio.volume = this._bgmVolume
  }

  /** @description: 播放背景音乐 */
  playBGM(_name: string): void {
    if (!this._bgmAudio || this._isPaused) return

    this._bgmAudio.currentTime = 0
    this._bgmAudio.play().catch(() => {
      // 自动播放被拦截时静默失败
    })
  }

  /** @description: 停止背景音乐 */
  stopBGM(): void {
    if (!this._bgmAudio) return
    this._bgmAudio.pause()
    this._bgmAudio.currentTime = 0
  }

  /** @description: 播放音效 */
  playSFX(name: string, options?: { loop?: boolean; volume?: number }): void {
    const sfx = new Audio(`/assets/SFX/${name}.mp3`)
    sfx.loop = options?.loop ?? false
    sfx.volume = (options?.volume ?? 1) * this._volume
    sfx.play().catch(() => {})
    this._sfxChannels.set(name, sfx)
  }

  /** @description: 停止指定音效 */
  stopSFX(name: string): void {
    const sfx = this._sfxChannels.get(name)
    if (sfx) {
      sfx.pause()
      sfx.currentTime = 0
      this._sfxChannels.delete(name)
    }
  }

  /** @description: 停止所有音效 */
  stopAllSFX(): void {
    this._sfxChannels.forEach((sfx) => {
      sfx.pause()
      sfx.currentTime = 0
    })
    this._sfxChannels.clear()
  }

  /** @description: 设置全局音量 */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume))
    this._sfxChannels.forEach((sfx) => {
      sfx.volume = sfx.volume * this._volume // 保持相对比例
    })
  }

  /** @description: 设置 BGM 音量 */
  setBGMVolume(volume: number): void {
    this._bgmVolume = Math.max(0, Math.min(1, volume))
    if (this._bgmAudio) {
      this._bgmAudio.volume = this._bgmVolume
    }
  }

  /** @description: 暂停所有音频 */
  pauseAll(): void {
    this._isPaused = true
    this._bgmAudio?.pause()
    this._sfxChannels.forEach((sfx) => sfx.pause())
  }

  /** @description: 恢复所有音频 */
  resumeAll(): void {
    this._isPaused = false
    if (this._bgmAudio) {
      this._bgmAudio.play().catch(() => {})
    }
  }
}
