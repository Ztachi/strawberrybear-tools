/**
 * @fileOverview 办理草稿领域类型
 * @description 定义唯一办理草稿的轻量字段；大型素材和正本图片不进入 Pinia 持久化。
 * @author strawberrybear
 * @date 2026-06-18
 */
import type { LocaleCode } from '@/domain/catalog/types'

/** 办理草稿当前阶段。 */
export type DraftStage = 'registration' | 'proofing'

/**
 * @description: 证书办理草稿
 * @description 这里保存草稿业务字段；头像、背景和模板素材 Blob 由 Dexie 其他表维护。
 */
export interface CertificateDraft {
  /** 唯一草稿 ID，同一设备同一时间只允许一份 */
  id: string
  /** 当前办理阶段 */
  stage: DraftStage
  /** 搭配师姓名 */
  stylistName: string
  /** 已选择的称号 ID */
  titleId: string | null
  /** 证书语言，创建时默认跟随 UI 语言，之后与 UI 语言分离 */
  certificateLocale: LocaleCode
  /** 草稿绑定的资料库版本 */
  catalogVersion: string
  /** 创建时间 ISO 字符串 */
  createdAt: string
  /** 最后更新时间 ISO 字符串 */
  updatedAt: string
}
