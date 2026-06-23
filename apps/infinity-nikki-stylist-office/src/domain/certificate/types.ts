/**
 * @fileOverview 已签发证书领域类型
 * @description 定义正式证书归档需要保存的核心快照信息。
 * @author strawberrybear
 * @date 2026-06-18
 */
import type { LocaleCode } from '@/domain/catalog/types'
import type { DraftImageTransform } from '@/domain/draft/types'

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
  /** 认证称号 ID 快照 */
  titleId: string
  /** 认证称号显示文案快照 */
  titleName: string
  /** 登记地区 ID 快照 */
  regionId: string
  /** 登记地区三位代码快照 */
  regionCode: string
  /** 头像 ID 快照，可能是协会头像或自定义头像 */
  avatarId: string
  /** 头像在证书框内的取景参数快照 */
  avatarTransform?: DraftImageTransform
  /** 证书语言快照 */
  certificateLocale: LocaleCode
  /** 模板 ID 快照 */
  templateId: string
  /** 资料库版本快照 */
  catalogVersion: string
  /** 证书图上展示的签发日期 */
  issuedDateText: string
  /** 签发时间 ISO 字符串 */
  issuedAt: string
}
