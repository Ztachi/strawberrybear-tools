/**
 * @fileOverview FPS 采集 Tauri 命令封装
 * @description 前端只消费统一快照与能力信息，不直接处理平台 provider 差异
 */

import { invoke } from '@tauri-apps/api/core'

export type CaptureStatus =
  | 'unsupported_platform'
  | 'idle'
  | 'starting'
  | 'capturing'
  | 'present_mon_missing'
  | 'target_not_found'
  | 'permission_denied'
  | 'error'

export type FrameRateSource = 'present_mon' | 'unsupported'

export interface StableFps {
  /** 四舍五入后的稳定 FPS。 */
  fps: number
  /** 平均 FPS。 */
  average_fps: number
  /** FPS 标准差。 */
  jitter: number
  /** 稳定窗口样本数量。 */
  sample_count: number
  /** 0-1 稳定置信度。 */
  confidence: number
}

export interface FrameRateSnapshot {
  /** 当前采集状态。 */
  status: CaptureStatus
  /** 最新单帧推导 FPS。 */
  current_fps: number | null
  /** 最近稳定 FPS。 */
  stable_fps: StableFps | null
  /** 当前窗口样本数。 */
  sample_count: number
  /** 数据来源。 */
  source: FrameRateSource
  /** 命中的目标进程。 */
  target_process: string | null
  /** 最近更新时间，Unix 毫秒。 */
  updated_at_ms: number | null
  /** 状态说明。 */
  message: string | null
}

export interface FrameRateCaptureCapability {
  /** 当前平台。 */
  platform: string
  /** 平台是否支持自动采集。 */
  supported: boolean
  /** provider 名称。 */
  provider: string
  /** 当前是否可尝试自动采集。 */
  auto_capture_available: boolean
  /** 能力说明。 */
  message: string
}

/**
 * @description: 获取 FPS 自动采集能力
 * @return {Promise<FrameRateCaptureCapability>} 平台能力
 */
export async function getFrameRateCaptureCapability(): Promise<FrameRateCaptureCapability> {
  return await invoke<FrameRateCaptureCapability>('get_frame_rate_capture_capability')
}

/**
 * @description: 启动 FPS 自动采集
 * @return {Promise<FrameRateSnapshot>} 当前 FPS 快照
 */
export async function startFrameRateCapture(): Promise<FrameRateSnapshot> {
  return await invoke<FrameRateSnapshot>('start_frame_rate_capture')
}

/**
 * @description: 获取 FPS 快照
 * @return {Promise<FrameRateSnapshot>} 当前 FPS 快照
 */
export async function getFrameRateSnapshot(): Promise<FrameRateSnapshot> {
  return await invoke<FrameRateSnapshot>('get_frame_rate_snapshot')
}

/**
 * @description: 停止 FPS 自动采集
 * @return Promise
 */
export async function stopFrameRateCapture(): Promise<void> {
  await invoke('stop_frame_rate_capture')
}
