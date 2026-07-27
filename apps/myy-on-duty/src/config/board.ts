/**
 * @fileOverview 台面几何配置
 * @description 台面使用固定 720×1280 设计坐标，渲染层整体等比缩放，避免不同设备改变碰撞结果。
 *   主场横向范围 x∈[50,620]（中心 335），右侧 x∈[620,700] 为发射通道。
 *   顶部为左右对称圆弧角：发射球沿右弧越顶、贴顶墙向左滑行，可直接灌入左侧回环喂给拍板。
 *   下半场为经典弹珠结构：外侧下班道（outlane）→ 回球道（inlane）→ 弹弓 → 拍板漏斗 → 中央落口。
 */
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
  /** 左右拍板轴距 210、板长 88：静止时中央落口约 43px，略大于弹珠直径 36px。 */
  flippers: {
    left: { x: 230, y: 1128, length: 88, rest: 0.32, active: -0.55 },
    right: { x: 440, y: 1128, length: 88, rest: Math.PI - 0.32, active: -Math.PI + 0.55 },
  },
  bumpers: [
    { id: 'farm', x: 250, y: 350, radius: 58, labelKey: 'game.device.farm' },
    { id: 'pond', x: 430, y: 355, radius: 58, labelKey: 'game.device.pond' },
    { id: 'nest', x: 335, y: 500, radius: 58, labelKey: 'game.device.nest' },
  ],
  /** 陨星坑入口两侧的导流挡柱：只有从正下方打入的球才能进坑，且与鱼塘保持可通行间距。 */
  posts: [
    { x: 359, y: 238, radius: 13 },
    { x: 441, y: 234, radius: 13 },
  ] as Array<{ x: number; y: number; radius: number }>,
  /** 三块目标牌连排密封（缝隙小于弹珠），与小动物窝、右墙都留出可通行通道，避免楔形卡球。 */
  targets: [
    {
      id: 'week',
      x: 460,
      y: 565,
      width: 40,
      height: 58,
      angle: 0.55,
      labelKey: 'game.target.week',
    },
    {
      id: 'purchase',
      x: 496,
      y: 587,
      width: 40,
      height: 58,
      angle: 0.55,
      labelKey: 'game.target.purchase',
    },
    {
      id: 'limit',
      x: 531,
      y: 608,
      width: 40,
      height: 58,
      angle: 0.55,
      labelKey: 'game.target.limit',
    },
  ],
  sensors: [
    /** 陨星坑：顶部中偏右、顶盖 + 导流柱保护，发射球贴顶通过时不会误触。 */
    { id: 'meteor', x: 400, y: 235, width: 64, height: 48, labelKey: 'game.device.meteor' },
    { id: 'inspection', x: 584, y: 762, width: 56, height: 62, labelKey: 'game.inspection' },
    { id: 'event', x: 335, y: 730, width: 90, height: 36, labelKey: 'game.eventCard' },
    /** 回环通过判定采用低位→高位双传感器，倒滚回主场不会计数。 */
    { id: 'loopLow', x: 95, y: 640, width: 80, height: 44 },
    { id: 'loop', x: 285, y: 120, width: 70, height: 44, labelKey: 'game.loop' },
    { id: 'laborZone', x: 335, y: 380, width: 400, height: 380 },
    { id: 'drain', x: 335, y: 1240, width: 96, height: 56 },
    { id: 'leftOutlane', x: 110, y: 1065, width: 56, height: 76 },
    { id: 'rightOutlane', x: 560, y: 1065, width: 56, height: 76 },
  ],
  /** 所有轨道都由线段配置驱动，便于后续只改坐标而不碰物理代码。 */
  walls: [
    // 外框：直墙 + 左右对称的圆弧顶角（corner- 前缀的分段共同拟合圆弧）。
    { id: 'outer-left', x1: 50, y1: 240, x2: 50, y2: 1000 },
    { id: 'corner-tl-1', x1: 50, y1: 240, x2: 62, y2: 178 },
    { id: 'corner-tl-2', x1: 62, y1: 178, x2: 92, y2: 128 },
    { id: 'corner-tl-3', x1: 92, y1: 128, x2: 140, y2: 98 },
    { id: 'corner-tl-4', x1: 140, y1: 98, x2: 200, y2: 90 },
    { id: 'outer-top', x1: 200, y1: 90, x2: 560, y2: 90 },
    { id: 'corner-tr-1', x1: 560, y1: 90, x2: 618, y2: 98 },
    { id: 'corner-tr-2', x1: 618, y1: 98, x2: 662, y2: 126 },
    { id: 'corner-tr-3', x1: 662, y1: 126, x2: 690, y2: 175 },
    { id: 'corner-tr-4', x1: 690, y1: 175, x2: 700, y2: 240 },
    { id: 'outer-right', x1: 700, y1: 240, x2: 700, y2: 1180 },
    { id: 'launcher-inner', x1: 620, y1: 330, x2: 620, y2: 1180 },
    { id: 'launcher-floor', x1: 620, y1: 1180, x2: 700, y2: 1180 },

    // 左侧加班回环内轨：与外墙保持约 90px 通道宽，出口唇口下垂避免形成搁球平台。
    { id: 'loop-inner-low', x1: 140, y1: 760, x2: 140, y2: 330 },
    { id: 'loop-arc-1', x1: 140, y1: 330, x2: 150, y2: 265 },
    { id: 'loop-arc-2', x1: 150, y1: 265, x2: 178, y2: 210 },
    { id: 'loop-arc-3', x1: 178, y1: 210, x2: 225, y2: 172 },
    { id: 'loop-arc-4', x1: 225, y1: 172, x2: 290, y2: 150 },
    { id: 'loop-exit-lip', x1: 290, y1: 150, x2: 325, y2: 172 },

    // 陨星坑人字形顶盖：把贴顶滑行时掉落的球向两侧分流，坑口只对下方开放；
    // 与回环出口唇口末端保持可落球间隙，避免形成 V 形卡球槽。
    { id: 'meteor-roof-left', x1: 375, y1: 190, x2: 400, y2: 160 },
    { id: 'meteor-roof-right', x1: 400, y1: 160, x2: 425, y2: 190 },

    // 回环底部导流坡：倒滚的弹珠被引导到左回球道喂给拍板；坡左侧留出外道入口。
    { id: 'left-return-ramp', x1: 102, y1: 878, x2: 128, y2: 940 },
    { id: 'left-inlane-wall', x1: 128, y1: 940, x2: 128, y2: 1035 },
    { id: 'left-inlane-guide', x1: 128, y1: 1035, x2: 230, y2: 1146 },
    { id: 'right-return-ramp', x1: 566, y1: 884, x2: 542, y2: 940 },
    { id: 'right-inlane-wall', x1: 542, y1: 940, x2: 542, y2: 1035 },
    { id: 'right-inlane-guide', x1: 542, y1: 1035, x2: 440, y2: 1146 },

    // 下班道外墙与落球区漏斗：外道弹珠沿斜墙滑到拍板下方汇入中央落口。
    { id: 'left-drain-wall', x1: 50, y1: 1000, x2: 205, y2: 1180 },
    { id: 'left-drain-floor', x1: 205, y1: 1180, x2: 285, y2: 1232 },
    { id: 'right-drain-wall', x1: 620, y1: 1000, x2: 465, y2: 1180 },
    { id: 'right-drain-floor', x1: 465, y1: 1180, x2: 385, y2: 1232 },

    // 弹弓三角形的被动两边（主动弹面在 slingshots 中配置）。
    { id: 'left-sling-back', x1: 184, y1: 950, x2: 184, y2: 1056 },
    { id: 'left-sling-bottom', x1: 184, y1: 1056, x2: 240, y2: 1072 },
    { id: 'right-sling-back', x1: 486, y1: 950, x2: 486, y2: 1056 },
    { id: 'right-sling-bottom', x1: 486, y1: 1056, x2: 430, y2: 1072 },

    // 成果验收口袋：开口朝上，闭合时由 inspectionGate 封住；两段都延伸进右墙避免端头角卡球。
    { id: 'pocket-left', x1: 548, y1: 705, x2: 548, y2: 795 },
    { id: 'pocket-floor', x1: 548, y1: 795, x2: 622, y2: 822 },
  ],
  /** 弹弓主动弹面：碰撞时沿固定方向补充冲量。 */
  slingshots: [
    { id: 'left', x1: 184, y1: 950, x2: 240, y2: 1072, impulse: { x: 9, y: -11 } },
    { id: 'right', x1: 486, y1: 950, x2: 430, y2: 1072, impulse: { x: -9, y: -11 } },
  ],
  /** 强制加班挡片：左片接回环内轨、右片接第一块目标牌，在小动物窝下方合拢封住劳动区。 */
  overtimeGates: [
    { id: 'left', x1: 140, y1: 590, x2: 330, y2: 668 },
    { id: 'right', x1: 340, y1: 660, x2: 430, y2: 585 },
  ],
  inspectionGate: { x1: 548, y1: 704, x2: 622, y2: 678 },
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
