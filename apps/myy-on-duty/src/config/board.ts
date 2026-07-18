/** 台面使用固定设计坐标，渲染层整体等比缩放，避免不同设备改变碰撞结果。 */
export const BOARD = {
  width: 720,
  height: 1280,
  scale: 20,
  ballStart: { x: 660, y: 1100 },
  launcher: {
    x: 660,
    y: 1100,
    width: 80,
    top: 310,
    bottom: 1180,
    compressionTravel: 58,
    /** 球心完全越过发射通道内壁后才算进入主台面，不能只按高度提前判定。 */
    entry: { maxX: 590, maxY: 320 },
    /** 弹珠越过通道顶部后启用单向挡片，不能重新掉回发射通道。 */
    gate: { x1: 620, y1: 330, x2: 695, y2: 300 },
  },
  flippers: {
    left: { x: 205, y: 1060, length: 116, rest: 0.32, active: -0.55 },
    right: { x: 465, y: 1060, length: 116, rest: Math.PI - 0.32, active: -Math.PI + 0.55 },
  },
  bumpers: [
    { id: 'farm', x: 235, y: 300, radius: 60, labelKey: 'game.device.farm' },
    { id: 'pond', x: 475, y: 300, radius: 60, labelKey: 'game.device.pond' },
    { id: 'nest', x: 355, y: 470, radius: 60, labelKey: 'game.device.nest' },
  ],
  // 被动小挡柱会形成静态受力平衡；第一版只保留具有主动弹射反馈的劳动装置。
  posts: [] as Array<{ x: number; y: number; radius: number }>,
  targets: [
    {
      id: 'week',
      x: 445,
      y: 590,
      width: 44,
      height: 64,
      angle: 0.22,
      labelKey: 'game.target.week',
    },
    {
      id: 'purchase',
      x: 505,
      y: 620,
      width: 44,
      height: 64,
      angle: 0.22,
      labelKey: 'game.target.purchase',
    },
    {
      id: 'limit',
      x: 565,
      y: 650,
      width: 44,
      height: 64,
      angle: 0.22,
      labelKey: 'game.target.limit',
    },
  ],
  sensors: [
    { id: 'meteor', x: 550, y: 190, width: 72, height: 55, labelKey: 'game.device.meteor' },
    { id: 'inspection', x: 510, y: 760, width: 86, height: 76, labelKey: 'game.inspection' },
    { id: 'event', x: 360, y: 775, width: 92, height: 38, labelKey: 'game.eventCard' },
    { id: 'loop', x: 245, y: 185, width: 90, height: 42, labelKey: 'game.loop' },
    { id: 'laborZone', x: 365, y: 370, width: 430, height: 390 },
    { id: 'drain', x: 335, y: 1225, width: 110, height: 58 },
    { id: 'leftOutlane', x: 88, y: 1195, width: 70, height: 80 },
    { id: 'rightOutlane', x: 575, y: 1195, width: 50, height: 80 },
  ],
  /** 所有轨道都由线段配置驱动，便于后续只改坐标而不碰物理代码。 */
  walls: [
    { id: 'outer-left', x1: 50, y1: 120, x2: 50, y2: 1160 },
    { id: 'outer-top', x1: 50, y1: 120, x2: 520, y2: 120 },
    { id: 'outer-top-right', x1: 520, y1: 120, x2: 620, y2: 155 },
    { id: 'launcher-curve', x1: 620, y1: 155, x2: 700, y2: 225 },
    { id: 'outer-right', x1: 700, y1: 225, x2: 700, y2: 1180 },
    { id: 'launcher-inner', x1: 620, y1: 310, x2: 620, y2: 1180 },
    { id: 'launcher-floor', x1: 620, y1: 1180, x2: 700, y2: 1180 },

    // 两条连续下半场边界同时分隔回球道与出球道，避免断线接缝把球挤到拍板外侧。
    { id: 'left-outlane-divider', x1: 100, y1: 900, x2: 280, y2: 1240 },
    { id: 'right-outlane-divider', x1: 570, y1: 900, x2: 390, y2: 1240 },

    { id: 'loop-inner-1', x1: 145, y1: 850, x2: 145, y2: 600 },
    { id: 'loop-inner-2', x1: 145, y1: 600, x2: 155, y2: 380 },
    { id: 'loop-inner-3', x1: 155, y1: 380, x2: 185, y2: 260 },
    { id: 'loop-inner-exit', x1: 185, y1: 260, x2: 285, y2: 185 },
  ],
  slingshots: [
    { id: 'left', x1: 145, y1: 880, x2: 240, y2: 980, impulse: { x: 8, y: -12 } },
    { id: 'right', x1: 525, y1: 880, x2: 430, y2: 980, impulse: { x: -8, y: -12 } },
  ],
  overtimeGates: [
    { id: 'left', x1: 145, y1: 585, x2: 260, y2: 625 },
    { id: 'right', x1: 450, y1: 625, x2: 585, y2: 580 },
  ],
  inspectionGate: { x1: 465, y1: 815, x2: 550, y2: 780 },
} as const

export type BoardSensorId = (typeof BOARD.sensors)[number]['id']

/**
 * @description 判断弹珠是否真正离开发射通道并进入主台面
 * @param {number} x 弹珠球心的设计坐标 X
 * @param {number} y 弹珠球心的设计坐标 Y
 * @return {boolean} 是否已进入主台面
 */
export function hasEnteredMainPlayfield(x: number, y: number): boolean {
  return x <= BOARD.launcher.entry.maxX && y <= BOARD.launcher.entry.maxY
}
