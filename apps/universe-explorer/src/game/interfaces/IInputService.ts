/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:18
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:24:19
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/interfaces/IInputService.ts
 * @Description:
 */
/**
 * @fileOverview 输入服务接口
 * @description 抽象底层输入设备，返回语义化 InputState
 * @description 后续扩展：实现此接口支持 Gamepad / Touch，无需修改 MovementSystem
 */
import type { InputState } from './InputState'

export interface IInputService {
  /**
   * @description: 绑定到 Canvas 和 DOM 事件
   * @param {HTMLCanvasElement} canvas - 游戏画布（指针锁定用）
   */
  attach(canvas: HTMLCanvasElement): void
  /**
   * @description: 读取当前帧输入状态，调用后重置 lookDelta
   * @return {InputState} 语义化输入状态
   */
  getState(): InputState
  /** 解绑所有事件监听器 */
  dispose(): void
}
