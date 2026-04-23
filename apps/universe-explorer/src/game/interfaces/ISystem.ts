/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:24:05
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:24:06
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/game/interfaces/ISystem.ts
 * @Description:
 */
/**
 * @fileOverview 游戏系统统一接口
 * @description 所有游戏系统必须实现此接口，由 GameManager 统一调度
 */

export interface ISystem {
  /** 系统初始化，在首帧前调用一次 */
  init(): void
  /**
   * @description: 每帧更新
   * @param {number} deltaTime - 距上一帧的时间差（秒）
   */
  update(deltaTime: number): void
  /** 系统销毁，释放资源 */
  dispose(): void
}
