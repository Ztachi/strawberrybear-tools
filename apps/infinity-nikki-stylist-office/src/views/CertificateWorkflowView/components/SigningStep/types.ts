/**
 * @fileOverview 正本签发页组件共享类型
 * @description 页面私有组件之间共享轻量 UI 类型，避免从 .vue 文件互相导出类型。
 */

/** 签发仪式阶段配置。 */
export interface SigningProgressItem {
  /** 阶段稳定 ID */
  id: string
  /** 阶段标题 */
  title: string
  /** 阶段说明 */
  description: string
  /** 阶段图标 */
  icon: string
}
