/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:25:04
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:25:05
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/services/PlayerMoveSpaceService.ts
 * @Description:
 */
/**
 * @fileOverview 玩家移动空间服务（MVP 实现）
 * @description 实现 ISpaceService：移动飞船网格
 * @description 是唯一知道 Ship 存在的地方（除 GameManager 外）
 * @description 未来切换为 WorldRebaseSpaceService 时，MovementSystem 零改动
 */
import { Vector3 } from '@babylonjs/core'
import type { ISpaceService } from '../interfaces/ISpaceService'
import type { MovementDelta, PlayerTransform } from '../interfaces/MovementDelta'
import type { Ship } from '../entities/Ship'

export class PlayerMoveSpaceService implements ISpaceService {
  constructor(private readonly _ship: Ship) {}

  /**
   * @description: 在飞船局部坐标系中施加位移和旋转
   * @param {MovementDelta} delta - 位移/旋转增量（局部坐标系）
   */
  applyMovement(delta: MovementDelta): void {
    const { translation, rotation } = delta
    // locallyTranslate 在飞船自身坐标系中移动（前方 = 飞船 Z 轴）
    this._ship.mesh.locallyTranslate(new Vector3(translation.x, translation.y, translation.z))
    // 直接累加欧拉角旋转（MVP 阶段，后续可升级为四元数）
    this._ship.mesh.rotation.addInPlace(new Vector3(rotation.x, rotation.y, rotation.z))
  }

  /**
   * @description: 读取飞船当前世界坐标变换
   * @return {PlayerTransform} 供 RenderSystem 相机跟随使用
   */
  getPlayerTransform(): PlayerTransform {
    const pos = this._ship.mesh.position
    const rot = this._ship.mesh.rotation
    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z },
    }
  }
}
