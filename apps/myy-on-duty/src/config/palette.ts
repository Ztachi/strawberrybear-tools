import { NIKKI_COLORS, NIKKI_STATE_COLORS } from '@strawberrybear/nikki-theme'

/**
 * @description 把 #RRGGBB 颜色转换为 Pixi 使用的数值
 * @param {string} color 十六进制颜色字符串
 * @return {number} 颜色数值
 */
const toHex = (color: string): number => Number.parseInt(color.slice(1), 16)

/** 台面渲染唯一调色板：品牌色一律取自 @strawberrybear/nikki-theme，只补充台面装置的辅助色。 */
export const PALETTE = {
  /** 品牌主粉与交互层级。 */
  primary: toHex(NIKKI_COLORS.primary),
  primaryHover: toHex(NIKKI_COLORS.primaryHover),
  primaryActive: toHex(NIKKI_COLORS.primaryActive),
  primaryLight: toHex(NIKKI_COLORS.primaryLight),
  border: toHex(NIKKI_COLORS.border),
  borderSecondary: toHex(NIKKI_COLORS.borderSecondary),
  foreground: toHex(NIKKI_COLORS.foreground),
  mutedDark: toHex(NIKKI_COLORS.mutedDark),
  white: toHex(NIKKI_COLORS.white),
  background: toHex(NIKKI_COLORS.background),
  danger: toHex(NIKKI_STATE_COLORS.danger),
  warning: toHex(NIKKI_STATE_COLORS.warning),
  success: toHex(NIKKI_STATE_COLORS.success),

  /** 台面底板与通道底色。 */
  boardBase: 0xfffbfc,
  boardLane: 0xfdeef2,
  boardShade: 0xfbe3ea,

  /** 三类劳动装置的马卡龙配色（外圈亮色 / 内芯深色）。 */
  farm: { outer: 0xbfe3c0, inner: 0x63a56f },
  pond: { outer: 0xb5d9f2, inner: 0x5f93c0 },
  nest: { outer: 0xf8d3a8, inner: 0xd08e58 },

  /** 陨星坑与验收口袋点缀色。 */
  meteor: 0xc7b3e6,
  meteorDeep: 0x8d76b8,
  gold: 0xf0b64a,
} as const

/** CSS 十六进制文本形式，供 Pixi Text 等需要字符串颜色的场景使用。 */
export const PALETTE_TEXT = {
  foreground: NIKKI_COLORS.foreground,
  mutedDark: NIKKI_COLORS.mutedDark,
  white: NIKKI_COLORS.white,
} as const
