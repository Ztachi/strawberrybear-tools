/**
 * @fileOverview 已签发证书领域类型
 * @description 定义正式证书归档需要保存的核心快照信息。
 * @author strawberrybear
 * @date 2026-06-18
 */
import type { LocaleCode } from '@/domain/catalog/types'

/**
 * @description: 已正式签发证书
 * @description 正式证书不可原地修改，必须保存模板、资料库和用户资料快照。
 */
export interface IssuedCertificate {
  /** 本地证书 ID */
  id: string
  /** 正式证书编号 */
  certificateNo: string
  /** 搭配师姓名快照 */
  stylistName: string
  /** 证书语言快照 */
  certificateLocale: LocaleCode
  /** 模板 ID 快照 */
  templateId: string
  /** 资料库版本快照 */
  catalogVersion: string
  /** 签发时间 ISO 字符串 */
  issuedAt: string
}
