/**
 * @fileOverview 无限暖暖共享主题 token
 * @description 提供不绑定 UI 框架的颜色、圆角、阴影和 CSS 变量，供 Web/Tauri 等应用自行适配。
 * @author strawberrybear
 * @date 2026-06-18
 */

/**
 * @description: 无限暖暖品牌主色集合
 * @description 这些色值来自当前 infinity-nikki-player 运行时代码，公共包以代码事实为准。
 */
export const NIKKI_COLORS = {
  primary: '#F7B7BE',
  primaryLight: '#FFF1F4',
  primaryHover: '#EE8FA1',
  primaryActive: '#E36F86',
  primaryDisabledBg: '#FFF1F4',
  primaryDisabledBorder: '#F8D4DA',
  primaryDisabledText: '#F0B8C2',
  secondary: '#F3A1AE',
  foreground: '#4A3F3F',
  muted: '#A89A9A',
  mutedDark: '#6B5A5A',
  white: '#FFFFFF',
  background: '#FFF7FA',
  container: '#FFFFFF',
  elevated: '#FFF9FC',
  border: '#F3CAD0',
  borderSecondary: '#F8DCE2',
} as const

/**
 * @description: 状态色集合
 * @description 应用内成功、警告、错误反馈统一从这里取值，避免每个 app 自行发散。
 */
export const NIKKI_STATE_COLORS = {
  success: '#4ADE80',
  warning: '#F5C542',
  danger: '#EF5B6B',
} as const

/**
 * @description: 主题尺寸 token
 * @description 保持工具型界面克制圆角，普通控件使用 12px，复杂面板可使用 16px。
 */
export const NIKKI_RADII = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
} as const

/**
 * @description: 阴影 token
 * @description 粉色阴影只用于强调卡片、主按钮或浮层，不作为大面积背景装饰。
 */
export const NIKKI_SHADOWS = {
  pink: '0 8px 32px rgba(238, 143, 161, 0.16)',
  pinkSm: '0 2px 8px rgba(238, 143, 161, 0.1)',
  card: '0 2px 12px rgba(0, 0, 0, 0.06)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.04)',
} as const

/**
 * @description: CSS 变量表
 * @description key 是 CSS 变量名，value 是默认值；应用可以直接注入到全局样式或测试断言。
 */
export const NIKKI_CSS_VARIABLES = {
  '--color-primary': '#f7b7be',
  '--color-primary-light': '#fff1f4',
  '--color-primary-hover': '#ee8fa1',
  '--color-primary-active': '#e36f86',
  '--color-primary-disabled-bg': '#fff1f4',
  '--color-primary-disabled-border': '#f8d4da',
  '--color-primary-disabled-text': '#f0b8c2',
  '--color-secondary': '#f3a1ae',
  '--color-foreground': '#4a3f3f',
  '--color-muted': '#a89a9a',
  '--color-muted-dark': '#6b5a5a',
  '--color-white': '#ffffff',
  '--background': '340 100% 98%',
  '--foreground': '330 10% 15%',
  '--card': '0 0% 100%',
  '--card-foreground': '330 10% 15%',
  '--primary': '350 89% 80%',
  '--primary-foreground': '330 10% 15%',
  '--border': '350 55% 88%',
  '--input': '350 45% 88%',
  '--ring': '350 89% 80%',
  '--radius': '0.75rem',
} as const

/**
 * @description: 创建可写入 style 的 CSS 变量对象
 * @description 返回浅拷贝，避免应用层误改公共 token 常量本身。
 * @return {Record<string, string>} CSS 变量名到变量值的映射
 */
export function createNikkiCssVariableRecord(): Record<string, string> {
  return { ...NIKKI_CSS_VARIABLES }
}
