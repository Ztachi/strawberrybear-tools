/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:22
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 18:30:00
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/interfaces/IAudioService.ts
 * @Description: 音频服务接口 — 抽象音频播放能力，解耦实现
 */
/**
 * @fileOverview 音频服务接口
 * @description AudioSystem 通过此接口调用，BGM / SFX 分离
 * @description 当前使用 DummyAudioService，后续替换为 WebAudioService / BabylonAudioService 时系统零改动
 */

/**
 * @description: 音频服务接口
 * @description 所有音频播放必须通过此接口，禁止在系统中直接使用浏览器 Audio API
 */
export interface IAudioService {
  /**
   * @description: 播放背景音乐
   * @param {string} name - BGM 资源标识符
   */
  playBGM(name: string): void

  /**
   * @description: 停止背景音乐
   */
  stopBGM(): void

  /**
   * @description: 播放音效
   * @param {string} name - SFX 资源标识符
   * @param {object} options - 播放选项
   * @param {boolean} options.loop - 是否循环（默认 false）
   * @param {number} options.volume - 音量 0~1（默认 1）
   */
  playSFX(name: string, options?: { loop?: boolean; volume?: number }): void

  /**
   * @description: 停止指定音效
   * @param {string} name - SFX 资源标识符
   */
  stopSFX(name: string): void

  /**
   * @description: 停止所有音效
   */
  stopAllSFX(): void

  /**
   * @description: 设置全局音量
   * @param {number} volume - 音量 0~1
   */
  setVolume(volume: number): void

  /**
   * @description: 设置 BGM 音量
   * @param {number} volume - 音量 0~1
   */
  setBGMVolume(volume: number): void

  /**
   * @description: 暂停所有音频
   */
  pauseAll(): void

  /**
   * @description: 恢复所有音频
   */
  resumeAll(): void
}
