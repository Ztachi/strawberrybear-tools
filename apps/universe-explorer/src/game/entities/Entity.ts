/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:25:21
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:25:22
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/entities/Entity.ts
 * @Description:
 */
/**
 * @fileOverview 游戏实体抽象基类
 * @description 所有游戏对象的基类，持有 Babylon.js 网格引用
 */
import type { AbstractMesh, Vector3 } from '@babylonjs/core'

export abstract class Entity {
  /** Babylon.js 网格，子类负责创建 */
  abstract readonly mesh: AbstractMesh

  /** @description: 世界空间位置（代理 mesh.position） */
  get position(): Vector3 {
    return this.mesh.position
  }

  /**
   * @description: 实体自身每帧逻辑更新（由各实体自行实现）
   * @description 注意：移动由 MovementSystem 通过 ISpaceService 处理，不在此执行
   * @param {number} deltaTime - 距上一帧时间差（秒）
   */
  abstract update(deltaTime: number): void
}
