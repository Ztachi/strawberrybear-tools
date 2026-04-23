/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:25:49
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:25:50
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/systems/MovementSystem.ts
 * @Description:
 */
/**
 * @fileOverview 移动系统（架构核心）
 * @description 将语义输入转换为 MovementDelta，通过 ISpaceService 施加位移
 *
 * 关键设计：
 * - 零 Babylon.js 依赖（纯接口 + 纯数学）
 * - 零 Ship/Entity 直接引用
 * - 扩展输入：替换 IInputService 实现，本系统零改动
 * - 切换世界移动：替换 ISpaceService 实现，本系统零改动
 */
import type { ISystem } from '../interfaces/ISystem'
import type { IInputService } from '../interfaces/IInputService'
import type { ISpaceService } from '../interfaces/ISpaceService'

/** 基础飞行速度（单位/秒） */
const BASE_SPEED = 12
/** 加速倍率（Shift 键） */
const BOOST_MULTIPLIER = 2.5
/** 鼠标视角灵敏度 */
const LOOK_SENSITIVITY = 0.003

export class MovementSystem implements ISystem {
  /**
   * @param {IInputService} _inputService - 语义化输入服务（设备无关）
   * @param {ISpaceService} _spaceService - 空间服务（玩家移动 or 世界移动）
   */
  constructor(
    private readonly _inputService: IInputService,
    private readonly _spaceService: ISpaceService
  ) {}

  init(): void {}

  /**
   * @description: 每帧计算位移增量并通过 ISpaceService 施加
   * @param {number} deltaTime - 距上一帧时间差（秒）
   */
  update(deltaTime: number): void {
    const state = this._inputService.getState()
    const speed = (state.boost ? BASE_SPEED * BOOST_MULTIPLIER : BASE_SPEED) * deltaTime

    // 输出 MovementDelta — translation 在飞船局部坐标系中
    this._spaceService.applyMovement({
      translation: {
        x: state.moveRight * speed,
        y: state.moveUp * speed,
        z: state.moveForward * speed,
      },
      rotation: {
        x: state.lookDelta.y * LOOK_SENSITIVITY, // 鼠标上下 → 俯仰
        y: state.lookDelta.x * LOOK_SENSITIVITY, // 鼠标左右 → 偏航
        z: 0,
      },
    })
  }
}
