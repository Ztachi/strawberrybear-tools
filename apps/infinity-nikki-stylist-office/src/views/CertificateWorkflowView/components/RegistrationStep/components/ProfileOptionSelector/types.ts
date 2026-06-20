/**
 * @fileOverview 登记资料选择器类型
 * @description 头像和称号选择器共用的轻量展示数据，避免子组件依赖完整资料库结构。
 * @author strawberrybear
 * @date 2026-06-20
 */

/** 登记页当前支持的资料选择类型。 */
export type ProfileOptionSelectorType = 'avatar' | 'title'

/** 称号选择弹窗使用的展示项。 */
export interface TitlePickerOption {
  id: string
  symbol: string
  displayName: string
  displayDescription: string
}

/** 头像选择弹窗使用的展示项。 */
export interface AvatarPickerOption {
  id: string
  displayName: string
}
