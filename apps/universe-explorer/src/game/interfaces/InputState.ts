/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:12
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:24:13
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/interfaces/InputState.ts
 * @Description:
 */
/**
 * @fileOverview 语义化输入状态
 * @description 抽象设备无关的输入状态，MovementSystem 消费此类型
 */

/**
 * @description: 语义化输入状态
 * @description 表达玩家意图，而非具体设备按键，支持键鼠/手柄/触屏无缝切换
 */
export interface InputState {
  /** 前进/后退轴，范围 -1 ~ 1（正为前进） */
  moveForward: number
  /** 横向移动轴，范围 -1 ~ 1（正为右移） */
  moveRight: number
  /** 垂直移动轴，范围 -1 ~ 1（正为上升） */
  moveUp: number
  /** 视角偏移量，每帧累积后在 getState() 中重置 */
  lookDelta: { x: number; y: number }
  /** 加速（Shift / 手柄扳机） */
  boost: boolean
}
