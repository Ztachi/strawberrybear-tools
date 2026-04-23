/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:25:15
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:25:16
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/services/WorldRebaseSpaceService.ts
 * @Description:
 */
/**
 * @fileOverview 世界移动空间服务（未来扩展 Stub）
 * @description 实现 ISpaceService：玩家锚定原点，移动整个世界
 * @description 解决宇宙游戏大距离飞行的浮点精度崩溃问题（Origin Rebasing）
 * @description 切换方式：在 GameManager 中将 PlayerMoveSpaceService 替换为本类即可
 */
import { Vector3 } from '@babylonjs/core'
import type { AbstractMesh } from '@babylonjs/core'
import type { ISpaceService } from '../interfaces/ISpaceService'
import type { MovementDelta, PlayerTransform } from '../interfaces/MovementDelta'

export class WorldRebaseSpaceService implements ISpaceService {
  /** 玩家逻辑坐标（用于 HUD 坐标显示，玩家网格始终在原点） */
  private _playerPosition = { x: 0, y: 0, z: 0 }
  private _playerRotation = { x: 0, y: 0, z: 0 }

  /**
   * @param {AbstractMesh[]} worldObjects - 需要反向移动的世界物体列表
   */
  constructor(private readonly _worldObjects: AbstractMesh[]) {}

  /**
   * @description: 反向移动世界，玩家始终保持在原点
   * @param {MovementDelta} delta - 位移/旋转增量
   */
  applyMovement(delta: MovementDelta): void {
    const { translation, rotation } = delta

    // 世界反向移动：玩家逻辑上前进 +Z，世界向 -Z 移动
    const worldOffset = new Vector3(-translation.x, -translation.y, -translation.z)
    for (const mesh of this._worldObjects) {
      mesh.position.addInPlace(worldOffset)
    }

    // 记录玩家逻辑位置，用于 HUD 坐标显示
    this._playerPosition.x += translation.x
    this._playerPosition.y += translation.y
    this._playerPosition.z += translation.z
    this._playerRotation.x += rotation.x
    this._playerRotation.y += rotation.y
    this._playerRotation.z += rotation.z
  }

  /**
   * @description: 返回玩家逻辑变换（位置始终为原点附近）
   * @return {PlayerTransform} 玩家变换信息
   */
  getPlayerTransform(): PlayerTransform {
    return {
      position: { ...this._playerPosition },
      rotation: { ...this._playerRotation },
    }
  }
}
