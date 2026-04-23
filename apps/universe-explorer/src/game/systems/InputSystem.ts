/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:25:38
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:25:39
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/systems/InputSystem.ts
 * @Description:
 */
/**
 * @fileOverview 输入系统
 * @description 负责初始化输入服务（绑定事件），为后续系统提供输入数据
 */
import type { ISystem } from '../interfaces/ISystem'
import type { IInputService } from '../interfaces/IInputService'

export class InputSystem implements ISystem {
  /**
   * @param {IInputService} _inputService - 输入服务（键鼠/手柄/触屏均可）
   * @param {HTMLCanvasElement} _canvas - 游戏画布，用于指针锁定
   */
  constructor(
    private readonly _inputService: IInputService,
    private readonly _canvas: HTMLCanvasElement
  ) {}

  /**
   * @description: 初始化：将输入服务绑定到 Canvas 和 DOM
   */
  init(): void {
    this._inputService.attach(this._canvas)
  }

  /**
   * @description: 每帧更新（预留输入平滑、组合键等扩展点）
   * @param {number} _deltaTime - 距上一帧时间差（秒）
   */
  update(_deltaTime: number): void {
    // 输入平滑、组合键检测等可在此扩展
  }

  /** @description: 销毁，释放输入服务资源 */
  dispose(): void {
    this._inputService.dispose()
  }
}
