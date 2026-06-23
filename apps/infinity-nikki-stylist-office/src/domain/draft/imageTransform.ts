/**
 * @fileOverview 草稿图片取景参数
 * @description 统一头像与后续背景取景的默认值、归一化和边界约束。
 * @author strawberrybear
 * @date 2026-06-23
 */
import type { DraftImageTransform } from './types'

/** 默认图片取景参数。 */
export const DEFAULT_DRAFT_IMAGE_TRANSFORM: DraftImageTransform = {
  x: 0,
  y: 3,
  scale: 1,
}

/** 证书头像在模板框内允许调整的边界。 */
const AVATAR_TRANSFORM_LIMITS = {
  minScale: 0.6,
  maxScale: 2.8,
  minOffset: -45,
  maxOffset: 45,
} as const

/**
 * @description: 限制数字范围
 * @param {number} value - 原始值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @return {number} 限制后的值
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * @description: 归一化图片取景参数
 * @param {Partial<DraftImageTransform> | undefined} transform - 原始取景参数
 * @return {DraftImageTransform} 字段完整的取景参数
 */
export function normalizeDraftImageTransform(
  transform?: Partial<DraftImageTransform>
): DraftImageTransform {
  const x = Number(transform?.x)
  const y = Number(transform?.y)
  const scale = Number(transform?.scale)

  return {
    x: Number.isFinite(x) ? x : DEFAULT_DRAFT_IMAGE_TRANSFORM.x,
    y: Number.isFinite(y) ? y : DEFAULT_DRAFT_IMAGE_TRANSFORM.y,
    scale: Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_DRAFT_IMAGE_TRANSFORM.scale,
  }
}

/**
 * @description: 限制头像取景参数
 * @param {Partial<DraftImageTransform> | undefined} transform - 原始头像取景参数
 * @return {DraftImageTransform} 可安全用于预览和导出的头像取景参数
 */
export function clampAvatarImageTransform(
  transform?: Partial<DraftImageTransform>
): DraftImageTransform {
  const normalizedTransform = normalizeDraftImageTransform(transform)

  return {
    x: clamp(
      normalizedTransform.x,
      AVATAR_TRANSFORM_LIMITS.minOffset,
      AVATAR_TRANSFORM_LIMITS.maxOffset
    ),
    y: clamp(
      normalizedTransform.y,
      AVATAR_TRANSFORM_LIMITS.minOffset,
      AVATAR_TRANSFORM_LIMITS.maxOffset
    ),
    scale: clamp(
      normalizedTransform.scale,
      AVATAR_TRANSFORM_LIMITS.minScale,
      AVATAR_TRANSFORM_LIMITS.maxScale
    ),
  }
}

/**
 * @description: 判断两份图片取景参数是否一致
 * @param {Partial<DraftImageTransform> | undefined} first - 第一份参数
 * @param {Partial<DraftImageTransform> | undefined} second - 第二份参数
 * @return {boolean} 是否一致
 */
export function areDraftImageTransformsEqual(
  first?: Partial<DraftImageTransform>,
  second?: Partial<DraftImageTransform>
): boolean {
  const normalizedFirst = normalizeDraftImageTransform(first)
  const normalizedSecond = normalizeDraftImageTransform(second)

  return (
    normalizedFirst.x === normalizedSecond.x &&
    normalizedFirst.y === normalizedSecond.y &&
    normalizedFirst.scale === normalizedSecond.scale
  )
}
