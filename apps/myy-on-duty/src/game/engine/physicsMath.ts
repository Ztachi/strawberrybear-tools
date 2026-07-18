/**
 * @description 把角度归一化到 -π～π，和 Rapier 的旋转读数保持同一范围
 * @param {number} angle 原始弧度
 * @return {number} 归一化后的弧度
 */
export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * @description 沿最短圆弧把当前角度推进到目标角度
 * @param {number} current 当前弧度
 * @param {number} target 目标弧度
 * @param {number} maxStep 单次允许推进的最大弧度
 * @return {number} 下一步弧度
 */
export function stepAngleTowards(current: number, target: number, maxStep: number): number {
  const delta = normalizeAngle(target - current)
  if (Math.abs(delta) <= maxStep) return normalizeAngle(target)
  return normalizeAngle(current + Math.sign(delta) * maxStep)
}
