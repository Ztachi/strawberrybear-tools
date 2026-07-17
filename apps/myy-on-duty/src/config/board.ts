/** 台面使用固定设计坐标，渲染层整体等比缩放，避免不同设备改变碰撞结果。 */
export const BOARD = {
  width: 720,
  height: 1280,
  scale: 20,
  ballStart: { x: 654, y: 1100 },
  launcher: { x: 654, y: 1100, width: 74, height: 320 },
  flippers: {
    left: { x: 252, y: 1060, length: 142, rest: 0.28, active: -0.48 },
    right: { x: 468, y: 1060, length: 142, rest: Math.PI - 0.28, active: Math.PI + 0.48 },
  },
  bumpers: [
    { id: 'farm', x: 230, y: 330, radius: 68, labelKey: 'game.device.farm' },
    { id: 'pond', x: 490, y: 330, radius: 68, labelKey: 'game.device.pond' },
    { id: 'nest', x: 360, y: 500, radius: 68, labelKey: 'game.device.nest' },
  ],
  targets: [
    { id: 'week', x: 475, y: 640, labelKey: 'game.target.week' },
    { id: 'purchase', x: 535, y: 665, labelKey: 'game.target.purchase' },
    { id: 'limit', x: 595, y: 690, labelKey: 'game.target.limit' },
  ],
  sensors: [
    { id: 'meteor', x: 565, y: 190, width: 85, height: 70 },
    { id: 'inspection', x: 590, y: 770, width: 75, height: 115 },
    { id: 'event', x: 360, y: 740, width: 90, height: 42 },
    { id: 'drain', x: 360, y: 1220, width: 150, height: 70 },
    { id: 'leftOutlane', x: 75, y: 1160, width: 100, height: 170 },
    { id: 'rightOutlane', x: 645, y: 1160, width: 100, height: 170 },
  ],
  walls: [
    [28, 80, 28, 1180],
    [692, 80, 692, 1180],
    [28, 80, 650, 80],
    [650, 80, 692, 150],
    [610, 900, 610, 1190],
    [610, 900, 665, 850],
    [92, 910, 210, 1010],
    [628, 910, 510, 1010],
    [28, 1180, 150, 1240],
    [692, 1180, 570, 1240],
    [80, 610, 135, 390],
    [135, 390, 185, 180],
    [185, 180, 285, 145],
  ],
} as const

export type BoardSensorId = (typeof BOARD.sensors)[number]['id']
