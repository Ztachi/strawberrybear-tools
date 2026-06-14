/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-06-09 10:48:37
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-06-09 13:53:19
 * @FilePath: /strawberrybear-tools/apps/infinity-nikki-player/src/lib/keyboardTiming.ts
 * @Description:
 */
/**
 * @fileOverview 自动演奏按键时序策略
 * @description 根据游戏实际 FPS 推导模拟按键的保持时间和间隔时间
 */

/** 默认 FPS，自动获取不可用或手动值异常时使用。 */
export const DEFAULT_PLAYBACK_FPS = 60

/**
 * FPS 自适应总开关。
 *
 * true：启用自动/手动 FPS 适配、悬浮窗 FPS 控件和播放前锁定策略。
 * false：完全回到旧策略，按固定 60fps 计算按键持续和间隔。
 */
export const ENABLE_ADAPTIVE_FPS_TIMING = true

/** 最低可接受 FPS，避免极小值把按键保持时间拉得过长。 */
export const MIN_PLAYBACK_FPS = 15

/** 最高可接受 FPS，覆盖高刷场景并过滤异常检测值。 */
export const MAX_PLAYBACK_FPS = 360

/** Windows Sleep 和调度抖动余量，单位毫秒。 */
const WINDOWS_SLEEP_JITTER_MARGIN_MS = 20

/** 游戏至少需要覆盖的轮询帧数。 */
const REQUIRED_POLLING_FRAMES = 2

export interface KeyboardTimingProfile {
  /** 用于计算本 profile 的 FPS。 */
  fps: number
  /** 游戏识别一次按下所需的最短保持时间，单位毫秒。 */
  holdMs: number
  /** 同一个物理键两次独立按下之间的最短释放间隔，单位毫秒。 */
  releaseMs: number
}

/**
 * @description: 归一化 FPS
 * @param {number | null | undefined} fps - 输入 FPS
 * @return {number} 归一化后的 FPS
 */
export function normalizePlaybackFps(fps: number | null | undefined): number {
  if (typeof fps !== 'number' || !Number.isFinite(fps)) return DEFAULT_PLAYBACK_FPS
  return Math.min(MAX_PLAYBACK_FPS, Math.max(MIN_PLAYBACK_FPS, Math.round(fps)))
}

/**
 * @description: 根据 FPS 计算推荐按键持续/间隔
 * @param {number} fps - 游戏逻辑 FPS
 * @return {number} 覆盖游戏轮询和系统调度抖动的推荐毫秒数
 */
export function getRecommendedKeyTimingMs(fps: number): number {
  const normalizedFps = ENABLE_ADAPTIVE_FPS_TIMING
    ? normalizePlaybackFps(fps)
    : DEFAULT_PLAYBACK_FPS
  return Math.ceil(
    (REQUIRED_POLLING_FRAMES * 1000) / normalizedFps + WINDOWS_SLEEP_JITTER_MARGIN_MS
  )
}

/**
 * @description: 创建键盘模拟时序 profile
 * @param {number | null | undefined} fps - 游戏逻辑 FPS
 * @return {KeyboardTimingProfile} 键盘模拟最短保持和同键释放间隔
 */
export function createKeyboardTimingProfile(fps?: number | null): KeyboardTimingProfile {
  const normalizedFps = ENABLE_ADAPTIVE_FPS_TIMING
    ? normalizePlaybackFps(fps)
    : DEFAULT_PLAYBACK_FPS
  const recommendedMs = getRecommendedKeyTimingMs(normalizedFps)
  return {
    fps: normalizedFps,
    holdMs: recommendedMs,
    releaseMs: recommendedMs,
  }
}
