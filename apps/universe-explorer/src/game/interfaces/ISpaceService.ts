/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:37
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:24:38
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/interfaces/ISpaceService.ts
 * @Description:
 */
/**
 * @fileOverview 空间服务接口（核心扩展点）
 * @description 统一处理所有位移逻辑，MovementSystem 通过此接口施加位移
 *
 * 两种实现策略（切换时 MovementSystem 零改动）：
 * - PlayerMoveSpaceService：MVP，移动飞船网格
 * - WorldRebaseSpaceService：未来，移动世界、玩家锚定原点（解决浮点精度问题）
 */
import type { MovementDelta, PlayerTransform } from './MovementDelta'

export interface ISpaceService {
  /**
   * @description: 施加移动增量
   * @param {MovementDelta} delta - 位移和旋转增量（局部坐标系）
   */
  applyMovement(delta: MovementDelta): void
  /**
   * @description: 获取玩家当前变换信息
   * @description RenderSystem 调用以更新相机位置，不直接持有 Ship 引用
   * @return {PlayerTransform} 玩家世界空间位置与旋转
   */
  getPlayerTransform(): PlayerTransform
}
