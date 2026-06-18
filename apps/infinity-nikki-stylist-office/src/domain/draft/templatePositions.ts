/**
 * @fileOverview 模板文字层默认位置
 * @description 当前 bg.png 临时底图使用百分比坐标，后续细调时只需要替换这里或资料库配置。
 * @author strawberrybear
 * @date 2026-06-18
 */
import type { TemplateTextLayerId, TemplateTextPosition } from './types'

/** 可在校样页调整的模板文字层顺序。 */
export const TEMPLATE_TEXT_LAYER_IDS: TemplateTextLayerId[] = [
  'certificateTitle',
  'name',
  'stylistTitle',
  'region',
  'comment',
  'certificateNo',
  'president',
]

/** bg.png 临时底图上的默认百分比定位。 */
export const DEFAULT_TEMPLATE_TEXT_POSITIONS: Record<TemplateTextLayerId, TemplateTextPosition> = {
  certificateTitle: { x: 12.4, y: 30.5 },
  name: { x: 29.2, y: 47.8 },
  stylistTitle: { x: 29.2, y: 52.2 },
  region: { x: 29.2, y: 57.9 },
  comment: { x: 39.8, y: 71.8 },
  certificateNo: { x: 16.4, y: 83.8 },
  president: { x: 58.4, y: 84.1 },
}

/**
 * @description: 获取模板文字层位置
 * @description 草稿内没有保存调整时使用 bg.png 默认定位。
 * @param {TemplateTextLayerId} layerId - 文字层 ID
 * @param {Partial<Record<TemplateTextLayerId, TemplateTextPosition>>} positions - 草稿保存的位置
 * @return {TemplateTextPosition} 可直接渲染或编辑的位置
 */
export function resolveTemplateTextPosition(
  layerId: TemplateTextLayerId,
  positions: Partial<Record<TemplateTextLayerId, TemplateTextPosition>>
): TemplateTextPosition {
  return positions[layerId] ?? DEFAULT_TEMPLATE_TEXT_POSITIONS[layerId]
}
