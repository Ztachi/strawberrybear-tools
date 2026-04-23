/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:30
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:24:31
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/interfaces/MovementDelta.ts
 * @Description:
 */
/**
 * @fileOverview 空间位移数学类型
 * @description 纯数学类型，零引擎依赖，MovementSystem 与 SpaceService 之间的契约
 */

/** 三维向量（引擎无关） */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * @description: 移动增量
 * @description MovementSystem 每帧计算并输出此结构，ISpaceService 消费
 */
export interface MovementDelta {
  /** 位移量（局部坐标系，相对飞船朝向） */
  translation: Vec3
  /** 旋转量（弧度/帧） */
  rotation: Vec3
}

/**
 * @description: 玩家变换信息
 * @description ISpaceService 输出，RenderSystem 用于相机跟随
 */
export interface PlayerTransform {
  /** 玩家在世界空间中的位置 */
  position: Vec3
  /** 玩家欧拉旋转（弧度） */
  rotation: Vec3
}
